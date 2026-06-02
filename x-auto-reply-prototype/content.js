const PROCESSING_TWEETS = new Set();
const COMPLETED_TWEETS = new Set();
let settingsCache = null;
let observerStarted = false;
let sidebarRoot = null;
let sidebarVisible = true;
let queuePanelVisible = false;
let deletePanelVisible = false;
let autoScrollEnabled = false;
let autoScrollState = 'idle';
let autoScrollTimer = null;
let extensionAlive = true;
let sidebarRefreshInFlight = false;
let replyInProgress = false;
let cooldownPausedUntil = 0;
let cooldownCountdownTimer = null;
let manualCooldownEnabled = false;
let intentReplyStartedAt = 0;
let intentReplyTabId = 0;
let autoScrollSubmitCount = 0;
let autoRefreshScheduled = false;
const intentRetryCount = new Map();
const MAX_INTENT_RETRIES = 2;
const INTENT_REPLY_TIMEOUT_MS = 90_000;
const URL_QUEUE_STORAGE_KEY = 'urlReplyQueue';
const AUTO_SCROLL_STORAGE_KEY = 'xarAutoScroll';
const MANUAL_COOLDOWN_STORAGE_KEY = 'xarManualCooldown';
const ACTIVE_ASSIST_STORAGE_KEY = 'xarActiveAssistSession';
let urlQueueState = {
  active: false,
  urls: [],
  index: 0,
  rawText: '',
  lastReason: '',
  recheckDone: false
};
let urlQueueRunning = false;
let suppressIntentQueueAdvance = false;
let deleteRepliesRunning = false;
let deleteRepliesStopRequested = false;
const DELETED_REPLY_IDS = new Set();


bootstrap();
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'INTENT_REPLY_DONE') {
    finishTweetProcessing(message.payload?.tweetId, { resumeScroll: true });
  }
});

async function bootstrap() {
  const response = await safeSendMessage({ type: 'GET_SETTINGS' });
  settingsCache = response?.settings || null;
  if (isIntentReplyPage()) {
    await handleIntentReplyPage();
    return;
  }
  await loadUrlQueueState();
  await loadAutoScrollState();
  await loadManualCooldownState();
  injectSidebar();
  startObserver();
  scanTimeline();
  if (urlQueueState?.active) continueUrlQueue();
  setInterval(async () => {
    if (!extensionAlive) return;
    if (urlQueueState?.active) {
      continueUrlQueue();
    } else {
      scanTimeline();
    }
  }, 2500);
  setInterval(() => {
    if (!extensionAlive) return;
    refreshSidebar();
  }, 3000);
  startAutoScrollLoop();
}

function isIntentReplyPage() {
  return location.pathname === '/intent/tweet' && new URLSearchParams(location.search).has('in_reply_to');
}

function startObserver() {
  if (observerStarted) return;
  observerStarted = true;
  const observer = new MutationObserver(() => {
    injectAssistButtons();
    if (urlQueueState?.active) {
      continueUrlQueue();
    } else {
      scanTimeline();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function scanTimeline() {
  refreshSidebar();
  if (urlQueueState?.active) {
    autoScrollState = 'queue';
    return;
  }
  if (!replyInProgress && PROCESSING_TWEETS.size === 0 && clickNewPostsBannerIfVisible()) {
    autoScrollState = 'new posts';
    return;
  }
  if (!settingsCache?.enabled) return;
  if (isCooldownActive()) {
    autoScrollState = 'cooldown';
    return;
  }
  if (replyInProgress) {
    if (intentReplyStartedAt && Date.now() - intentReplyStartedAt > INTENT_REPLY_TIMEOUT_MS) {
      console.warn('[x-auto-reply] intent reply watchdog timeout');

      // Tutup tab intent yang stuck
      if (intentReplyTabId) {
        await safeSendMessage({ type: 'CLOSE_TAB_BY_ID', payload: { tabId: intentReplyTabId } });
        intentReplyTabId = 0;
      }

      // Cek retry per tweet
      const retryTweetIds = [...PROCESSING_TWEETS];
      let canRetry = false;

      for (const tweetId of retryTweetIds) {
        const retries = intentRetryCount.get(tweetId) || 0;
        if (retries < MAX_INTENT_RETRIES) {
          // Retry: hapus dari PROCESSING tapi JANGAN masukkan ke COMPLETED
          intentRetryCount.set(tweetId, retries + 1);
          console.log(`[x-auto-reply] retrying tweet ${tweetId} (attempt ${retries + 2})`);
          await safeSendMessage({
            type: 'RECORD_RESULT',
            payload: { tweetId, status: 'failed', reason: `intent-timeout-retry-${retries + 1}` }
          });
          PROCESSING_TWEETS.delete(tweetId);
          canRetry = true;
        } else {
          // Max retries habis, mark as failed dan move on
          console.warn(`[x-auto-reply] tweet ${tweetId} failed after ${MAX_INTENT_RETRIES} retries`);
          await safeSendMessage({
            type: 'RECORD_RESULT',
            payload: { tweetId, status: 'failed', reason: 'intent-timeout-max-retries' }
          });
          await safeSendMessage({
            type: 'CLEAR_PENDING_INTENT_REPLY',
            payload: { tweetId }
          });
          PROCESSING_TWEETS.delete(tweetId);
          COMPLETED_TWEETS.add(tweetId);
          intentRetryCount.delete(tweetId);
        }
      }

      replyInProgress = false;
      intentReplyStartedAt = 0;
      autoScrollState = canRetry ? 'checking' : (autoScrollEnabled ? 'scrolling' : 'idle');
      refreshSidebar();
    } else {
      autoScrollState = 'replying';
    }
    return;
  }
  if (PROCESSING_TWEETS.size > 0) return;

  const tweets = findTweetArticles();
  for (const tweet of tweets) {
    const meta = extractTweetMeta(tweet);
    if (!meta?.tweetId) continue;
    if (COMPLETED_TWEETS.has(meta.tweetId) || PROCESSING_TWEETS.has(meta.tweetId)) continue;
    PROCESSING_TWEETS.add(meta.tweetId);
    handleTweet(tweet, meta).catch((error) => {
      console.error('[x-auto-reply] handleTweet error', error);
      finishTweetProcessing(meta.tweetId);
    });
    return;
  }
}

function findTweetArticles() {
  const primary = [...document.querySelectorAll('article[data-testid="tweet"]')];
  if (primary.length > 0) return primary;
  return [...document.querySelectorAll('article[role="article"]')].filter((article) => article.querySelector('a[href*="/status/"]'));
}

function parseFromHandleFromSearchQuery(query = '') {
  const match = String(query || '').match(/\bfrom:([A-Za-z0-9_]{1,15})\b/i);
  return match?.[1] ? `@${match[1].toLowerCase()}` : '';
}

function buildXSearchUrl(query) {
  const clean = String(query || '').trim();
  return `https://x.com/search?q=${encodeURIComponent(clean)}&src=typed_query&f=live`;
}

async function openDeleteSearchFromPanel() {
  const input = sidebarRoot?.querySelector('[data-action="delete-query"]');
  const query = input?.value?.trim() || '';
  if (!query) {
    alert('Isi query search dulu, contoh: from:airplanestar_ lang:ja filter:replies');
    return;
  }
  location.href = buildXSearchUrl(query);
}

function getDeleteSearchQuery() {
  const input = sidebarRoot?.querySelector('[data-action="delete-query"]');
  return input?.value?.trim() || new URLSearchParams(location.search).get('q') || '';
}

function isOwnArticleForDelete(article, query) {
  const meta = extractTweetMeta(article);
  if (!meta?.tweetId || DELETED_REPLY_IDS.has(meta.tweetId)) return { ok: false, meta };

  const currentHandle = normalizeHandleForUi(getCurrentAccountHandle());
  const queryHandle = normalizeHandleForUi(parseFromHandleFromSearchQuery(query));
  const authorHandle = normalizeHandleForUi(meta.authorHandle);
  const expectedHandle = queryHandle || currentHandle;
  if (!expectedHandle || authorHandle !== expectedHandle) return { ok: false, meta };

  return { ok: true, meta };
}

function normalizeHandleForUi(value = '') {
  const clean = String(value || '').trim().replace(/^@+/, '').toLowerCase();
  return clean ? `@${clean}` : '';
}

async function deleteVisibleRepliesFromPanel() {
  if (deleteRepliesRunning) return;
  deleteRepliesRunning = true;
  deleteRepliesStopRequested = false;
  updateDeleteControl('running');

  try {
    const query = getDeleteSearchQuery();
    const queryHandle = normalizeHandleForUi(parseFromHandleFromSearchQuery(query));
    const currentHandle = normalizeHandleForUi(getCurrentAccountHandle());
    if (!queryHandle || !/\bfilter:replies\b/i.test(query)) {
      alert('Query harus pakai from:handle dan filter:replies supaya aman.');
      updateDeleteControl('blocked: query not safe');
      return;
    }
    if (currentHandle && queryHandle !== currentHandle) {
      alert(`Query from:${queryHandle.replace('@', '')} tidak sama dengan akun aktif ${currentHandle}.`);
      updateDeleteControl('blocked: account mismatch');
      return;
    }

    let deleted = 0;
    let skipped = 0;
    let idleCycles = 0;

    while (!deleteRepliesStopRequested) {
      const candidate = findDeleteCandidate(query);
      if (!candidate) {
        idleCycles += 1;
        const waitingText = autoScrollEnabled
          ? `waiting new replies · deleted ${deleted}`
          : `no visible replies · deleted ${deleted}`;
        updateDeleteControl(waitingText);

        if (!autoScrollEnabled && idleCycles >= 2) break;
        await sleep(1500);
        continue;
      }

      idleCycles = 0;
      setSidebarField('provider', `Delete ${deleted + 1}`);
      const result = await deleteTweetArticle(candidate.article);
      if (result.ok) {
        deleted += 1;
        DELETED_REPLY_IDS.add(candidate.meta.tweetId);
        await safeSendMessage({
          type: 'RECORD_RESULT',
          payload: {
            tweetId: candidate.meta.tweetId,
            text: candidate.meta.text,
            author: candidate.meta.author,
            authorHandle: candidate.meta.authorHandle,
            url: candidate.meta.url,
            status: 'deleted',
            reason: 'delete-reply'
          }
        });
      } else {
        skipped += 1;
        DELETED_REPLY_IDS.add(candidate.meta.tweetId);
        console.warn('[x-auto-reply] delete skipped', result.reason);
      }
      updateDeleteControl(`deleted ${deleted}, skipped ${skipped}`);
      await sleep(randomBetween(900, 1600));
    }

    updateDeleteControl(deleteRepliesStopRequested ? `stopped · deleted ${deleted}` : `done · deleted ${deleted}`);
  } finally {
    deleteRepliesRunning = false;
    deleteRepliesStopRequested = false;
    refreshSidebar();
  }
}

function findDeleteCandidate(query) {
  for (const article of findTweetArticles()) {
    const { ok, meta } = isOwnArticleForDelete(article, query);
    if (ok) return { article, meta };
  }
  return null;
}

async function deleteTweetArticle(article) {
  if (!article || !document.contains(article)) return { ok: false, reason: 'article-not-found' };
  article.scrollIntoView({ block: 'center', behavior: 'smooth' });
  await sleep(600);

  const menuButton =
    article.querySelector('[data-testid="caret"]') ||
    article.querySelector('[aria-label="More"]') ||
    article.querySelector('[aria-label="More options"]') ||
    article.querySelector('[aria-label="Lainnya"]');
  if (!menuButton) return { ok: false, reason: 'menu-not-found' };

  menuButton.click();
  const deleteMenuItem = await waitForMenuItemText(/\b(delete|hapus)\b/i, 4000);
  if (!deleteMenuItem) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { ok: false, reason: 'delete-menu-not-found' };
  }

  deleteMenuItem.click();
  const confirmButton = await waitForDeleteConfirmButton(5000);
  if (!confirmButton) return { ok: false, reason: 'delete-confirm-not-found' };

  confirmButton.click();
  await sleep(1600);
  return { ok: true, reason: 'deleted' };
}

async function waitForMenuItemText(pattern, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const items = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')];
    const match = items.find((item) => pattern.test(item.innerText || item.textContent || ''));
    if (match) return match;
    await sleep(150);
  }
  return null;
}

async function waitForDeleteConfirmButton(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const confirm =
      document.querySelector('[data-testid="confirmationSheetConfirm"]') ||
      [...document.querySelectorAll('button, [role="button"]')]
        .find((button) => /\b(delete|hapus)\b/i.test(button.innerText || button.textContent || ''));
    if (confirm) return confirm;
    await sleep(150);
  }
  return null;
}

function extractTweetMeta(article) {
  const statusLink = extractPrimaryStatusLink(article);
  const href = statusLink?.getAttribute('href') || '';
  const match = href.match(/status\/(\d+)/);
  const tweetId = match?.[1];
  const text = extractTweetText(article);
  const author = article.querySelector('[data-testid="User-Name"]')?.innerText?.split('\n')?.[0] || '';
  const authorHandle = extractAuthorHandle(article, href);
  const currentHandle = getCurrentAccountHandle();
  const isPromoted = detectPromoted(article);
  const isLiked = detectLiked(article);
  const isReply = detectReplyPost(article);
  const tweetTs = extractTweetTimestamp(article);
  const url = href ? new URL(href, location.origin).toString() : '';
  return tweetId ? { tweetId, text, author, authorHandle, currentHandle, isPromoted, isLiked, isReply, tweetTs, url } : null;
}

function extractPrimaryStatusLink(article) {
  const timeLink = article.querySelector('time[datetime]')?.closest('a[href*="/status/"]');
  if (timeLink) return timeLink;
  return article.querySelector('a[href*="/status/"]');
}

function extractTweetTimestamp(article) {
  const datetime = article.querySelector('time[datetime]')?.getAttribute('datetime') || '';
  const ts = datetime ? Date.parse(datetime) : 0;
  return Number.isFinite(ts) ? ts : 0;
}

function extractAuthorHandle(article, href = '') {
  const candidates = [
    ...article.querySelectorAll('[data-testid="User-Name"] a[href^="/"]'),
    ...article.querySelectorAll('a[href^="/"]')
  ];

  for (const anchor of candidates) {
    const handle = parseHandleFromHref(anchor.getAttribute('href'));
    if (handle && !anchor.getAttribute('href')?.includes('/status/')) return handle;
  }

  return parseHandleFromHref(href);
}

function getCurrentAccountHandle() {
  // 1. Cek link profile di sidebar kiri
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  let handle = parseHandleFromHref(profileLink?.getAttribute('href') || '');
  if (handle) return handle;

  // 2. Cek text di dalam tombol Account Switcher (biasanya ada @username)
  const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (switcher) {
    const match = (switcher.innerText || '').match(/@([A-Za-z0-9_]{1,15})/);
    if (match?.[1]) return `@${match[1].toLowerCase()}`;
  }

  // 3. Fallback aria-label
  const profileAria = document.querySelector('a[aria-label*="Profile"]');
  handle = parseHandleFromHref(profileAria?.getAttribute('href') || '');
  if (handle) return handle;

  return '';
}

function parseHandleFromHref(href = '') {
  const clean = String(href || '').split('?')[0].split('#')[0];
  const match = clean.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
  return match?.[1] ? `@${match[1].toLowerCase()}` : '';
}

function extractTweetText(article) {
  const selectors = [
    '[data-testid="tweetText"]',
    'div[lang]',
    '[data-testid="tweetText"] span',
    'div[dir="auto"] span'
  ];

  for (const selector of selectors) {
    const nodes = [...article.querySelectorAll(selector)].filter((node) => node.closest('article') === article);
    const text = nodes.map((node) => node.innerText?.trim() || '').filter(Boolean).join(' ').trim();
    if (text) return text;
  }

  return '';
}

function detectPromoted(article) {
  const text = article.innerText?.toLowerCase() || '';
  if (text.includes('promoted') || text.includes('sponsored') || text.includes('diiklankan')) return true;
  if (article.querySelector('[data-testid="placementTracking"]')) return true;
  const links = [...article.querySelectorAll('a[href*="/i/ads/"]')];
  return links.length > 0;
}

function detectLiked(article) {
  return Boolean(article.querySelector('[data-testid="unlike"]'));
}

function detectReplyPost(article) {
  const text = String(article.innerText || article.textContent || '').replace(/\s+/g, ' ').trim();
  if (/\b(replying to|membalas|balasan kepada)\s+@/i.test(text)) return true;
  if (article.querySelector('a[href*="/compose/post"][href*="in_reply_to="]')) return true;
  return false;
}

async function loadUrlQueueState() {
  const stored = await chrome.storage.local.get([URL_QUEUE_STORAGE_KEY]);
  urlQueueState = normalizeUrlQueueState(stored?.[URL_QUEUE_STORAGE_KEY]);
}

async function saveUrlQueueState(patch) {
  urlQueueState = normalizeUrlQueueState({ ...urlQueueState, ...patch });
  await chrome.storage.local.set({ [URL_QUEUE_STORAGE_KEY]: urlQueueState });
  updateQueueControl();
  refreshSidebar();
  return urlQueueState;
}

async function loadAutoScrollState() {
  const stored = await chrome.storage.local.get([AUTO_SCROLL_STORAGE_KEY]);
  const state = stored?.[AUTO_SCROLL_STORAGE_KEY] || {};
  autoScrollEnabled = Boolean(state.enabled);
  autoScrollSubmitCount = Math.max(0, Number(state.submitCount || 0));
  autoScrollState = autoScrollEnabled ? 'scrolling' : 'idle';
}

async function saveAutoScrollState(patch = {}) {
  const next = {
    enabled: autoScrollEnabled,
    submitCount: autoScrollSubmitCount,
    ...patch
  };
  autoScrollEnabled = Boolean(next.enabled);
  autoScrollSubmitCount = Math.max(0, Number(next.submitCount || 0));
  await chrome.storage.local.set({ [AUTO_SCROLL_STORAGE_KEY]: next });
  refreshSidebar();
}

async function loadManualCooldownState() {
  const stored = await chrome.storage.local.get([MANUAL_COOLDOWN_STORAGE_KEY]);
  applyManualCooldownState(stored?.[MANUAL_COOLDOWN_STORAGE_KEY] || {});
}

async function saveManualCooldownState(patch = {}) {
  const next = {
    enabled: manualCooldownEnabled,
    until: cooldownPausedUntil,
    ...patch
  };
  applyManualCooldownState(next);
  await chrome.storage.local.set({ [MANUAL_COOLDOWN_STORAGE_KEY]: next });
  refreshSidebar();
}

async function setActiveAssistSession(session, tweetId = '') {
  activeAssistSession = session;
  await chrome.storage.local.set({
    [ACTIVE_ASSIST_STORAGE_KEY]: {
      session,
      tweetId,
      ts: Date.now()
    }
  });
}

async function isCurrentAssistSession(session) {
  const stored = await chrome.storage.local.get([ACTIVE_ASSIST_STORAGE_KEY]);
  return Number(stored?.[ACTIVE_ASSIST_STORAGE_KEY]?.session || 0) === Number(session);
}

async function clearActiveAssistSession(session) {
  const stored = await chrome.storage.local.get([ACTIVE_ASSIST_STORAGE_KEY]);
  if (Number(stored?.[ACTIVE_ASSIST_STORAGE_KEY]?.session || 0) === Number(session)) {
    await chrome.storage.local.remove([ACTIVE_ASSIST_STORAGE_KEY]);
  }
}

function applyManualCooldownState(state = {}) {
  manualCooldownEnabled = Boolean(state.enabled);
  cooldownPausedUntil = Math.max(0, Number(state.until || 0));

  if (isCooldownActive()) {
    autoScrollState = 'cooldown';
    startCooldownCountdown();
  } else {
    stopCooldownCountdown();
    if (autoScrollState === 'cooldown') {
      autoScrollState = autoScrollEnabled ? 'scrolling' : 'idle';
    }
    if (!manualCooldownEnabled) cooldownPausedUntil = 0;
  }
}

function normalizeUrlQueueState(input = {}) {
  const urls = Array.isArray(input.urls) ? [...new Set(input.urls.map(normalizeXStatusUrl).filter(Boolean))] : [];
  const index = Math.min(Math.max(Number(input.index || 0), 0), urls.length);
  return {
    active: Boolean(input.active && urls.length > 0 && index < urls.length),
    urls,
    index,
    rawText: String(input.rawText || ''),
    lastReason: String(input.lastReason || ''),
    recheckDone: Boolean(input.recheckDone)
  };
}

function extractQueueUrls(text) {
  const urls = [];
  const pattern = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>"')]+/gi;
  for (const match of String(text || '').matchAll(pattern)) {
    const normalized = normalizeXStatusUrl(match[0]);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  }
  return urls;
}

function normalizeXStatusUrl(value) {
  const text = String(value || '').trim();
  const match = text.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:i\/web\/status\/|[^/\s]+\/status\/)(\d+)/i);
  if (!match?.[1]) return '';
  return `https://x.com/i/web/status/${match[1]}`;
}

function getTweetIdFromUrl(value = location.href) {
  const match = String(value || '').match(/\/status\/(\d+)/);
  return match?.[1] || '';
}

function findTweetArticleById(tweetId) {
  for (const article of findTweetArticles()) {
    const meta = extractTweetMeta(article);
    if (meta?.tweetId === tweetId) return article;
  }
  return null;
}

async function waitForTweetArticleById(tweetId, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const article = findTweetArticleById(tweetId);
    if (article) return article;
    await sleep(300);
  }
  return null;
}

async function continueUrlQueue() {
  if (!urlQueueState?.active || urlQueueRunning || !extensionAlive) return;
  urlQueueRunning = true;

  try {
    autoScrollEnabled = false;
    autoScrollState = 'queue';
    updateQueueControl();

    if (replyInProgress) {
      if (intentReplyStartedAt && Date.now() - intentReplyStartedAt > INTENT_REPLY_TIMEOUT_MS) {
        if (intentReplyTabId) {
          await safeSendMessage({ type: 'CLOSE_TAB_BY_ID', payload: { tabId: intentReplyTabId } });
          intentReplyTabId = 0;
        }

        suppressIntentQueueAdvance = true;
        try {
          for (const tweetId of [...PROCESSING_TWEETS]) {
            await safeSendMessage({
              type: 'RECORD_RESULT',
              payload: { tweetId, status: 'failed', reason: 'queue-intent-timeout' }
            });
            await safeSendMessage({
              type: 'CLEAR_PENDING_INTENT_REPLY',
              payload: { tweetId }
            });
            finishTweetProcessing(tweetId);
          }
        } finally {
          suppressIntentQueueAdvance = false;
        }
        await advanceUrlQueue('failed: intent timeout');
      } else {
        await saveUrlQueueState({ lastReason: 'waiting: intent reply' });
      }
      return;
    }

    if (!settingsCache?.enabled) {
      await saveUrlQueueState({ lastReason: 'waiting: extension disabled' });
      return;
    }

    if (isCooldownActive()) {
      await saveUrlQueueState({ lastReason: 'waiting: cooldown' });
      return;
    }

    const currentUrl = urlQueueState.urls[urlQueueState.index];
    const currentId = getTweetIdFromUrl(currentUrl);

    if (!currentUrl || !currentId) {
      await saveUrlQueueState({ active: false, lastReason: 'done' });
      return;
    }

    if (getTweetIdFromUrl(location.href) !== currentId) {
      await saveUrlQueueState({ lastReason: `opening ${urlQueueState.index + 1}/${urlQueueState.urls.length}` });
      location.href = currentUrl;
      return;
    }

    setSidebarField('provider', `Queue ${urlQueueState.index + 1}/${urlQueueState.urls.length}`);
    const article = await waitForTweetArticleById(currentId, 30000);
    if (!article) {
      await safeSendMessage({
        type: 'RECORD_RESULT',
        payload: {
          tweetId: currentId,
          url: currentUrl,
          status: 'failed',
          reason: 'queue-tweet-not-found'
        }
      });
      await advanceUrlQueue('failed: tweet not found');
      return;
    }

    const meta = {
      ...extractTweetMeta(article),
      url: currentUrl,
      forceRetry: Boolean(urlQueueState.recheckDone),
      forceReply: true
    };
    if (!meta?.tweetId) {
      await advanceUrlQueue('failed: meta not found');
      return;
    }

    PROCESSING_TWEETS.add(meta.tweetId);
    const result = await handleTweet(article, meta, { useIntent: false });
    if (result?.temporary) {
      await saveUrlQueueState({ lastReason: `waiting: ${result.reason}` });
      return;
    }

    await advanceUrlQueue(result?.reason || result?.status || 'processed');
  } finally {
    urlQueueRunning = false;
    updateQueueControl();
    refreshSidebar();
  }
}

async function advanceUrlQueue(reason = 'processed') {
  const nextIndex = urlQueueState.index + 1;
  if (nextIndex >= urlQueueState.urls.length) {
    await finishUrlQueue(reason, nextIndex);
    return;
  }

  await saveUrlQueueState({ index: nextIndex, lastReason: reason });
  location.href = urlQueueState.urls[nextIndex];
}

async function finishUrlQueue(reason = 'processed', doneIndex = urlQueueState.urls.length) {
  if (!urlQueueState.recheckDone) {
    const missedUrls = await findQueueMissedUrls();
    if (missedUrls.length > 0) {
      await saveUrlQueueState({
        active: true,
        urls: missedUrls,
        index: 0,
        recheckDone: true,
        lastReason: `recheck: ${missedUrls.length} URL`
      });
      location.href = missedUrls[0];
      return;
    }
  }

  await saveUrlQueueState({ active: false, index: doneIndex, lastReason: `done: ${reason}` });
  setSidebarField('provider', 'Queue done');
}

async function findQueueMissedUrls() {
  const response = await safeSendMessage({ type: 'GET_LOGS' });
  const logs = Array.isArray(response?.logs) ? response.logs : [];
  const successStatuses = new Set(['submitted', 'drafted']);
  const retryStatuses = new Set(['failed']);

  return (urlQueueState.urls || []).filter((url) => {
    const tweetId = getTweetIdFromUrl(url);
    if (!tweetId) return false;
    const latest = [...logs].reverse().find((item) => String(item.tweetId || '') === tweetId);
    if (!latest) return true;
    if (successStatuses.has(latest.status)) return false;
    return retryStatuses.has(latest.status);
  });
}

async function startUrlQueueFromPanel() {
  const textarea = sidebarRoot?.querySelector('[data-action="queue-input"]');
  const rawText = textarea?.value || '';
  const urls = extractQueueUrls(rawText);
  if (!urls.length) {
    alert('Tidak ada link X post yang valid di queue.');
    return;
  }

  COMPLETED_TWEETS.clear();
  PROCESSING_TWEETS.clear();
  autoScrollEnabled = false;
  await saveUrlQueueState({
    active: true,
    urls,
    index: 0,
    rawText,
    recheckDone: false,
    lastReason: `ready: ${urls.length} URL`
  });
  continueUrlQueue();
}

async function stopUrlQueueFromPanel() {
  await saveUrlQueueState({ active: false, lastReason: 'stopped' });
}

async function clearUrlQueueFromPanel() {
  const textarea = sidebarRoot?.querySelector('[data-action="queue-input"]');
  if (textarea) textarea.value = '';
  await saveUrlQueueState({
    active: false,
    urls: [],
    index: 0,
    rawText: '',
    lastReason: '',
    recheckDone: false
  });
}

async function likeTweetIfNeeded(article) {
  if (!article || !document.contains(article)) {
    const tweetId = getTweetIdFromUrl(location.href);
    article = tweetId ? findTweetArticleById(tweetId) : null;
  }

  if (!article) return { ok: false, reason: 'like-article-not-found' };
  if (article.querySelector('[data-testid="unlike"]')) return { ok: true, reason: 'already-liked' };

  const likeButton = article.querySelector('[data-testid="like"]');
  if (!likeButton) return { ok: false, reason: 'like-button-not-found' };
  if (likeButton.disabled || likeButton.getAttribute('aria-disabled') === 'true') {
    return { ok: false, reason: 'like-button-disabled' };
  }

  await sleep(randomBetween(700, 1400));
  likeButton.click();
  await sleep(500);
  return { ok: true, reason: 'liked' };
}

function watchManualAssistSubmitAndLike(article, dialog) {
  if (!settingsCache?.autoLikeAfterReply) return;
  const scope = dialog || document;
  const submitButton = findSubmitButton(scope);
  if (!submitButton) return;

  submitButton.addEventListener('click', async () => {
    for (let i = 0; i < 24; i++) {
      await sleep(500);
      if (!dialog || !document.body.contains(dialog)) {
        const likeResult = await likeTweetIfNeeded(article);
        if (!likeResult.ok) {
          console.warn('[x-auto-reply] assist like skipped', likeResult.reason);
        }
        return;
      }
    }
  }, { once: true, capture: true });
}

async function handleTweet(article, meta, options = {}) {
  const decision = await safeSendMessage({
    type: 'SHOULD_PROCESS_TWEET',
    payload: meta
  });

  if (!decision?.allow) {
    const waitReasons = new Set(['intent-pending', 'cooldown', 'hourly-limit']);

    if (decision?.reason === 'cooldown') {
      pauseAutoScrollForCooldown(decision);
    }

    if (waitReasons.has(decision?.reason)) {
      // Alasan sementara: lepas dari PROCESSING tapi JANGAN masuk COMPLETED
      // Supaya tweet tetap dianggap "belum diproses" → scroll nunggu → dicek ulang nanti
      PROCESSING_TWEETS.delete(meta.tweetId);
      refreshSidebar();
      return { done: false, temporary: true, reason: decision?.reason || 'wait' };
    }

    // Alasan permanen: log dan mark completed, boleh di-scroll lewat
    await safeSendMessage({
      type: 'RECORD_RESULT',
      payload: {
        tweetId: meta.tweetId,
        text: meta.text,
        author: meta.author,
        authorHandle: meta.authorHandle,
        url: meta.url,
        status: 'skipped',
        reason: decision?.reason || 'blocked'
      }
    });
    refreshSidebar();
    finishTweetProcessing(meta.tweetId);
    return { done: true, status: 'skipped', reason: decision?.reason || 'blocked' };
  }

  // 1. Klik reply native untuk buka modal dulu, kecuali queue intent.
  const replyBtn = article.querySelector('[data-testid="reply"]');
  if (replyBtn && !options.useIntent) {
    replyBtn.click();
  } else if (!replyBtn && !options.useIntent) {
    await safeSendMessage({
      type: 'RECORD_RESULT',
      payload: { ...meta, status: 'skipped', reason: 'no-reply-btn' }
    });
    refreshSidebar();
    finishTweetProcessing(meta.tweetId);
    return { done: true, status: 'skipped', reason: 'no-reply-btn' };
  }

  setSidebarField('provider', '⏳ Generating...');

  // Bersihkan retry dan lock lama agar session LLM 100% fresh
  intentRetryCount.delete(meta.tweetId);
  await safeSendMessage({ type: 'CLEANUP_STALE_PENDING' });

  // 2. Generate Reply
  const generation = await safeSendMessage({
    type: 'GENERATE_REPLY',
    payload: meta
  });

  setSidebarField('provider', '-');
  refreshSidebar();

  if (!generation?.ok || generation.skip || !generation.reply) {
    // Tutup modal kalau gagal/skip
    const closeBtn = document.querySelector('[role="dialog"] [aria-label="Close"]');
    if (closeBtn) closeBtn.click();

    await safeSendMessage({
      type: 'RECORD_RESULT',
      payload: {
        tweetId: meta.tweetId,
        text: meta.text,
        author: meta.author,
        authorHandle: meta.authorHandle,
        url: meta.url,
        status: 'skipped',
        reason: generation?.error || 'model-skip'
      }
    });
    refreshSidebar();
    finishTweetProcessing(meta.tweetId);
    return { done: true, status: 'skipped', reason: generation?.error || 'model-skip' };
  }

  if (options.useIntent) {
    stopAutoScrollForReply();
    intentReplyStartedAt = Date.now();

    const intent = await safeSendMessage({
      type: 'OPEN_INTENT_REPLY',
      payload: {
        tweetId: meta.tweetId,
        reply: generation.reply,
        autoSubmit: Boolean(settingsCache?.autoSubmit),
        meta
      }
    });

    if (intent?.ok && intent.tabId) {
      intentReplyTabId = intent.tabId;
      refreshSidebar();
      return { done: false, temporary: true, reason: 'intent-opened' };
    }

    await safeSendMessage({
      type: 'RECORD_RESULT',
      payload: {
        tweetId: meta.tweetId,
        text: meta.text,
        author: meta.author,
        authorHandle: meta.authorHandle,
        url: meta.url,
        reply: generation.reply,
        status: 'failed',
        reason: intent?.error || 'intent-open-failed'
      }
    });
    finishTweetProcessing(meta.tweetId);
    return { done: true, status: 'failed', reason: intent?.error || 'intent-open-failed' };
  }



  stopAutoScrollForReply();
  
  // 3. Inject dan Submit secara Inline
  const result = await submitReplyInline(generation.reply, Boolean(settingsCache?.autoSubmit));
  
  const submitted = Boolean(result?.ok);
  const status = submitted ? (settingsCache?.autoSubmit ? 'submitted' : 'drafted') : 'failed';
  if (status === 'submitted' && settingsCache?.autoLikeAfterReply) {
    const likeResult = await likeTweetIfNeeded(article);
    if (!likeResult.ok) {
      console.warn('[x-auto-reply] auto like skipped', likeResult.reason);
    }
  }

  await safeSendMessage({
    type: 'RECORD_RESULT',
    payload: {
      tweetId: meta.tweetId,
      text: meta.text,
      author: meta.author,
      authorHandle: meta.authorHandle,
      url: meta.url,
      reply: generation.reply,
      status,
      reason: result?.reason || 'ok'
    }
  });
  
  refreshSidebar();
  finishTweetProcessing(meta.tweetId, { resumeScroll: true });
  if (status === 'submitted' || status === 'drafted') {
    await startManualCooldownAfterReply();
  }
  if (status === 'submitted') {
    scheduleAutoScrollRefreshIfNeeded();
  }
  return {
    done: true,
    status,
    reason: result?.reason || 'ok'
  };
}

function finishTweetProcessing(tweetId, { resumeScroll = false } = {}) {
  if (tweetId) {
    PROCESSING_TWEETS.delete(tweetId);
    COMPLETED_TWEETS.add(tweetId);
    intentRetryCount.delete(tweetId);
  }
  if (replyInProgress) {
    replyInProgress = false;
    intentReplyStartedAt = 0;
    intentReplyTabId = 0;
    autoScrollState = resumeScroll && autoScrollEnabled ? 'scrolling' : 'paused';
  } else if (isCooldownActive()) {
    autoScrollState = 'cooldown';
  } else if (autoScrollEnabled) {
    autoScrollState = 'scrolling';
  }
  refreshSidebar();
}

async function submitReplyInline(replyText, autoSubmit) {
  try {
    let composer = null;
    let dialog = null;
    
    // Tunggu modal composer
    for (let i = 0; i < 20; i++) {
      dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        composer = dialog.querySelector('[data-testid="tweetTextarea_0"]') || dialog.querySelector('div[role="textbox"]');
        if (composer) break;
      }
      await new Promise(r => setTimeout(r, 250));
    }
    
    if (!composer || !dialog) return { ok: false, reason: 'modal-not-found' };
    
    // Inject text
    await simulateReactInput(composer, replyText);
    
    if (autoSubmit) {
      await new Promise(r => setTimeout(r, 1000)); // jeda baca bentar
      const submitBtn = dialog.querySelector('[data-testid="tweetButton"]');
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
        
        // Tunggu modal nutup sbg verifikasi sukses
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          if (!document.body.contains(dialog)) {
            return { ok: true, reason: 'inline-submitted' };
          }
        }
        return { ok: false, reason: 'inline-submit-timeout' };
      } else {
        return { ok: false, reason: 'inline-btn-not-ready' };
      }
    } else {
      return { ok: true, reason: 'inline-drafted' };
    }
  } catch (e) {
    console.error('[x-auto-reply]', e);
    return { ok: false, reason: 'inline-error' };
  }
}

async function handleIntentReplyPage() {
  const params = new URLSearchParams(location.search);
  const tweetId = params.get('in_reply_to') || '';
  const fallbackReply = params.get('text') || '';
  if (!tweetId) return;

  const pendingResponse = await safeSendMessage({
    type: 'GET_PENDING_INTENT_REPLY',
    payload: { tweetId }
  });
  const pending = pendingResponse?.pending || {
    tweetId,
    reply: fallbackReply,
    autoSubmit: false,
    meta: {
      tweetId,
      url: `https://x.com/i/web/status/${tweetId}`
    }
  };

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[x-auto-reply] intent-page attempt ${attempt}/${MAX_ATTEMPTS}`);

    const replyContext = await waitForReplyComposer(attempt === 1 ? 20000 : 15000);
    const composer = replyContext?.composer;
    const dialog = replyContext?.dialog || null;
    if (!composer) {
      if (attempt < MAX_ATTEMPTS) {
        console.log('[x-auto-reply] composer not found, retrying...');
        await sleep(3000);
        continue;
      }
      await recordIntentResult(pending, 'failed', 'intent-composer-not-found');
      await safeSendMessage({ type: 'CLOSE_INTENT_TAB' });
      return;
    }

    const scope = dialog || composer.closest('div[role="dialog"]') || document;
    const textReady = await waitForComposerText(composer, pending.reply, 15000);
    const composerDirty = await waitForComposerReady(scope, composer, 15000);
    if (!textReady || !composerDirty) {
      if (attempt < MAX_ATTEMPTS) {
        console.log('[x-auto-reply] composer text/ready check failed, retrying...');
        await sleep(2000);
        continue;
      }
      await recordIntentResult(pending, 'failed', textReady ? 'intent-submit-not-ready' : 'intent-text-not-ready');
      await safeSendMessage({ type: 'CLOSE_INTENT_TAB' });
      return;
    }

    if (!pending.autoSubmit) {
      await recordIntentResult(pending, 'drafted', 'intent-drafted');
      return;
    }

    const submitButton = await waitForSubmitButton(scope, 10000);
    if (!submitButton || submitButton.disabled) {
      if (attempt < MAX_ATTEMPTS) {
        console.log('[x-auto-reply] submit button not ready, retrying...');
        await sleep(2000);
        continue;
      }
      await recordIntentResult(pending, 'failed', 'intent-submit-not-ready');
      await safeSendMessage({ type: 'CLOSE_INTENT_TAB' });
      return;
    }

    await sleep(randomBetween(900, 1600));
    submitButton.click();
    await sleep(randomBetween(1500, 2500));
    await recordIntentResult(pending, 'submitted', 'intent-submitted');
    await safeSendMessage({ type: 'CLOSE_INTENT_TAB' });
    return;
  }
}

async function recordIntentResult(pending, status, reason) {
  await safeSendMessage({
    type: 'RECORD_RESULT',
    payload: {
      ...(pending.meta || {}),
      tweetId: pending.tweetId,
      reply: pending.reply,
      status,
      reason
    }
  });
  await safeSendMessage({
    type: 'CLEAR_PENDING_INTENT_REPLY',
    payload: { tweetId: pending.tweetId }
  });
}

function getComposerEditable(node) {
  if (!node) return null;
  if (node.matches?.('[contenteditable="true"], [role="textbox"]')) return node;
  return (
    node.querySelector?.('[contenteditable="true"]') ||
    node.querySelector?.('[role="textbox"]') ||
    node
  );
}

function getComposerText(node) {
  const editable = getComposerEditable(node);
  return (editable?.innerText || editable?.textContent || '').replace(/\s+/g, ' ').trim();
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function waitForElement(selector, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const started = Date.now();
    const timer = setInterval(() => {
      const found = document.querySelector(selector);
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 250);
  });
}

async function waitForComposerText(node, expectedText, timeoutMs = 2500) {
  const target = String(expectedText || '').replace(/\s+/g, ' ').trim();
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const current = getComposerText(node);
    if (current && (current === target || current.includes(target.slice(0, Math.max(12, target.length - 8))))) {
      return true;
    }
    await sleep(150);
  }
  return false;
}

async function waitForComposerReady(scopeNode, composerNode, timeoutMs = 2500) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const text = getComposerText(composerNode);
    const submitButton = findSubmitButton(scopeNode);
    if (text && submitButton && !submitButton.disabled) {
      return true;
    }
    await sleep(150);
  }
  return false;
}

async function waitForReplyComposer(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const dialogs = [...document.querySelectorAll('div[role="dialog"]')];
    for (const dialog of dialogs.reverse()) {
      const composer =
        dialog.querySelector('[data-testid="tweetTextarea_0"]') ||
        dialog.querySelector('div[role="textbox"]');
      if (composer) {
        await sleep(350);
        return { composer, dialog };
      }
    }

    const fallbackComposer = document.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"]');
    if (fallbackComposer) {
      await sleep(350);
      return { composer: fallbackComposer, dialog: fallbackComposer.closest('div[role="dialog"]') || null };
    }
    await sleep(250);
  }
  return null;
}

async function waitForSubmitButton(scopeNode, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const submitButton = findSubmitButton(scopeNode);
    if (submitButton && !submitButton.disabled) {
      await sleep(250);
      return submitButton;
    }
    await sleep(250);
  }
  return null;
}

function findSubmitButton(scopeNode) {
  const scope = scopeNode && document.contains(scopeNode) ? scopeNode : document;
  return (
    scope.querySelector?.('[data-testid="tweetButton"]') ||
    scope.querySelector?.('[data-testid="tweetButtonInline"]') ||
    scope.querySelector?.('button[data-testid^="tweetButton"]') ||
    null
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recoverFromFailedReply() {
  await sleep(randomBetween(900, 1600));

  const composerStillOpen =
    document.querySelector('[data-testid="tweetTextarea_0"]') ||
    document.querySelector('div[role="textbox"]') ||
    document.querySelector('div[role="dialog"]');

  if (!composerStillOpen && location.pathname.includes('/home')) {
    return 'recover:none';
  }

  const closeButton =
    document.querySelector('[data-testid="app-bar-close"]') ||
    document.querySelector('[aria-label="Close"]') ||
    document.querySelector('[data-testid="sheetDialog"] [role="button"]');

  if (closeButton) {
    closeButton.click();
    await sleep(1200);
    return 'recover:close-modal';
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(1000);

  const stillBlocked =
    document.querySelector('[data-testid="tweetTextarea_0"]') ||
    document.querySelector('div[role="dialog"]');
  if (!stillBlocked && location.pathname.includes('/home')) {
    return 'recover:escape';
  }

  location.href = 'https://x.com/home';
  await sleep(2000);
  return 'recover:go-home';
}

function injectSidebar() {
  if (document.getElementById('x-auto-reply-sidebar')) return;

  const style = document.createElement('style');
  style.id = 'x-auto-reply-sidebar-style';
  style.textContent = `
    /* ===== CSS Custom Properties for Theming ===== */
    #x-auto-reply-sidebar {
      --xar-bg: #ffffff;
      --xar-bg-secondary: #f8fafc;
      --xar-bg-card: #f1f5f9;
      --xar-bg-input: #ffffff;
      --xar-border: rgba(0,0,0,0.08);
      --xar-border-strong: rgba(0,0,0,0.12);
      --xar-text: #0f172a;
      --xar-text-secondary: #64748b;
      --xar-text-muted: #94a3b8;
      --xar-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
      --xar-btn-bg: #f1f5f9;
      --xar-btn-hover: #e2e8f0;
      --xar-btn-active: #0ea5e9;
      --xar-btn-active-text: #ffffff;
      --xar-accent: #0ea5e9;
      --xar-badge-off-bg: #f1f5f9;
      --xar-badge-off-text: #64748b;
      --xar-badge-live-bg: #dcfce7;
      --xar-badge-live-text: #16a34a;
      --xar-log-bg: #f8fafc;
      --xar-log-border: rgba(0,0,0,0.06);
    }
    #x-auto-reply-sidebar.xar-dark {
      --xar-bg: #0f1419;
      --xar-bg-secondary: #16202a;
      --xar-bg-card: #1c2732;
      --xar-bg-input: #0f1419;
      --xar-border: rgba(255,255,255,0.08);
      --xar-border-strong: rgba(255,255,255,0.12);
      --xar-text: #e7e9ea;
      --xar-text-secondary: #8b98a5;
      --xar-text-muted: #6e767d;
      --xar-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
      --xar-btn-bg: #1c2732;
      --xar-btn-hover: #263340;
      --xar-btn-active: #1d9bf0;
      --xar-btn-active-text: #ffffff;
      --xar-accent: #1d9bf0;
      --xar-badge-off-bg: #1c2732;
      --xar-badge-off-text: #8b98a5;
      --xar-badge-live-bg: rgba(0,186,124,0.15);
      --xar-badge-live-text: #00ba7c;
      --xar-log-bg: #16202a;
      --xar-log-border: rgba(255,255,255,0.06);
    }

    /* ===== Layout ===== */
    #x-auto-reply-sidebar {
      position: fixed;
      top: 64px;
      right: 12px;
      width: 320px;
      max-height: calc(100vh - 80px);
      background: var(--xar-bg);
      color: var(--xar-text);
      border: 1px solid var(--xar-border);
      border-radius: 16px;
      box-shadow: var(--xar-shadow);
      z-index: 999999;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      transition: width 0.2s ease, background 0.25s ease, color 0.25s ease;
    }
    #x-auto-reply-sidebar.collapsed { width: 48px; border-radius: 24px; }

    /* ===== Header ===== */
    #x-auto-reply-sidebar .xar-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--xar-border);
      background: var(--xar-bg-secondary);
    }
    #x-auto-reply-sidebar .xar-title-wrap { flex: 1; min-width: 0; }
    #x-auto-reply-sidebar .xar-title { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
    #x-auto-reply-sidebar .xar-sub { font-size: 11px; color: var(--xar-text-muted); margin-top: 1px; }
    #x-auto-reply-sidebar .xar-head-btns { display: flex; gap: 4px; align-items: center; }

    /* ===== Buttons (shared) ===== */
    #x-auto-reply-sidebar button {
      border: none; border-radius: 8px; background: var(--xar-btn-bg); color: var(--xar-text);
      cursor: pointer; font-size: 12px; font-weight: 600;
      transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
    }
    #x-auto-reply-sidebar button:hover { background: var(--xar-btn-hover); }
    #x-auto-reply-sidebar button:active { transform: scale(0.97); }

    /* ===== Icon buttons in header ===== */
    #x-auto-reply-sidebar .xar-icon-btn {
      width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
      font-size: 14px; border-radius: 50%; padding: 0;
    }

    /* ===== Body ===== */
    #x-auto-reply-sidebar .xar-body {
      display: block; overflow-y: auto; max-height: calc(100vh - 140px); padding: 12px 14px;
    }
    #x-auto-reply-sidebar .xar-body::-webkit-scrollbar { width: 4px; }
    #x-auto-reply-sidebar .xar-body::-webkit-scrollbar-thumb { background: var(--xar-text-muted); border-radius: 4px; }
    #x-auto-reply-sidebar .xar-body::-webkit-scrollbar-track { background: transparent; }
    #x-auto-reply-sidebar.collapsed .xar-body,
    #x-auto-reply-sidebar.collapsed .xar-title-wrap,
    #x-auto-reply-sidebar.collapsed .xar-head-btns .xar-theme-btn { display: none; }

    /* ===== Status Grid ===== */
    #x-auto-reply-sidebar .xar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
    #x-auto-reply-sidebar .xar-card {
      background: var(--xar-bg-card); border-radius: 10px; padding: 8px 10px;
      border: 1px solid var(--xar-border);
    }
    #x-auto-reply-sidebar .xar-label {
      font-size: 9px; color: var(--xar-text-muted); text-transform: uppercase;
      letter-spacing: .05em; font-weight: 600;
    }
    #x-auto-reply-sidebar .xar-value {
      font-size: 12px; margin-top: 2px; font-weight: 700; word-break: break-word;
      color: var(--xar-text);
    }

    /* ===== Badge ===== */
    #x-auto-reply-sidebar .xar-badge {
      display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px;
      border-radius: 999px; font-size: 11px; font-weight: 700; margin-bottom: 10px;
    }
    #x-auto-reply-sidebar .xar-badge.off {
      background: var(--xar-badge-off-bg); color: var(--xar-badge-off-text);
    }
    #x-auto-reply-sidebar .xar-badge.live {
      background: var(--xar-badge-live-bg); color: var(--xar-badge-live-text);
    }

    /* ===== Toggle Switches ===== */
    #x-auto-reply-sidebar .xar-switches {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 10px;
    }
    #x-auto-reply-sidebar .xar-switches button {
      width: 100%; padding: 7px 6px; font-size: 11px; min-width: 0;
      border: 1px solid var(--xar-border); border-radius: 8px;
      text-align: center;
    }
    #x-auto-reply-sidebar .xar-switches button.active {
      background: var(--xar-btn-active); color: var(--xar-btn-active-text);
      border-color: var(--xar-btn-active);
    }

    /* ===== Controls ===== */
    #x-auto-reply-sidebar .xar-control {
      background: var(--xar-bg-card); border: 1px solid var(--xar-border);
      border-radius: 10px; padding: 10px; margin-bottom: 10px;
    }
    #x-auto-reply-sidebar .xar-control label {
      display: block; font-size: 9px; color: var(--xar-text-muted); text-transform: uppercase;
      letter-spacing: .05em; font-weight: 600; margin-bottom: 5px;
    }
    #x-auto-reply-sidebar .xar-control select,
    #x-auto-reply-sidebar .xar-control input,
    #x-auto-reply-sidebar .xar-control textarea {
      width: 100%; box-sizing: border-box; border: 1px solid var(--xar-border-strong);
      border-radius: 8px; background: var(--xar-bg-input); color: var(--xar-text);
      padding: 7px 8px; font-size: 12px; outline: none;
      transition: border-color 0.15s ease;
    }
    #x-auto-reply-sidebar .xar-control select:focus,
    #x-auto-reply-sidebar .xar-control input:focus,
    #x-auto-reply-sidebar .xar-control textarea:focus {
      border-color: var(--xar-accent);
    }
    #x-auto-reply-sidebar .xar-control input { margin-top: 6px; }
    #x-auto-reply-sidebar .xar-control textarea { min-height: 80px; resize: vertical; line-height: 1.4; }
    #x-auto-reply-sidebar .xar-queue-row { display: flex; gap: 6px; margin-top: 8px; }
    #x-auto-reply-sidebar .xar-queue-row button { flex: 1; padding: 7px 8px; font-size: 11px; text-align: center; }
    #x-auto-reply-sidebar .xar-queue-status {
      color: var(--xar-text-muted); font-size: 11px; line-height: 1.4; margin-top: 6px;
    }
    #x-auto-reply-sidebar .xar-queue-toggle {
      width: 100%; display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding: 8px 9px; border: 1px solid var(--xar-border);
      background: var(--xar-btn-bg); text-align: left;
    }
    #x-auto-reply-sidebar .xar-queue-toggle span {
      color: var(--xar-text-muted); font-size: 11px; font-weight: 600;
    }
    #x-auto-reply-sidebar .xar-queue-panel.collapsed { display: none; }
    #x-auto-reply-sidebar .xar-delete-panel.collapsed { display: none; }
    #x-auto-reply-sidebar .xar-delete-row { display: flex; gap: 6px; margin-top: 8px; }
    #x-auto-reply-sidebar .xar-delete-row button { flex: 1; padding: 7px 8px; font-size: 11px; text-align: center; }
    #x-auto-reply-sidebar .xar-delete-status {
      color: var(--xar-text-muted); font-size: 11px; line-height: 1.4; margin-top: 6px;
    }

    /* ===== Stats ===== */
    #x-auto-reply-sidebar .xar-stats {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px;
    }
    #x-auto-reply-sidebar .xar-mini {
      background: var(--xar-bg-card); border: 1px solid var(--xar-border);
      border-radius: 10px; padding: 6px 8px; text-align: center;
    }
    #x-auto-reply-sidebar .xar-mini strong { display: block; font-size: 14px; color: var(--xar-text); }
    #x-auto-reply-sidebar .xar-mini span { font-size: 9px; color: var(--xar-text-muted); text-transform: uppercase; letter-spacing: .03em; }

    /* ===== Action Buttons ===== */
    #x-auto-reply-sidebar .xar-actions { display: flex; gap: 6px; margin-bottom: 10px; }
    #x-auto-reply-sidebar .xar-actions button {
      flex: 1; padding: 7px 8px; font-size: 11px;
      border: 1px solid var(--xar-border); text-align: center;
    }

    /* ===== Logs ===== */
    #x-auto-reply-sidebar .xar-log {
      background: var(--xar-log-bg); border-radius: 8px; padding: 8px 10px;
      margin-bottom: 6px; border: 1px solid var(--xar-log-border);
    }
    #x-auto-reply-sidebar .xar-log-head {
      display: flex; justify-content: space-between; gap: 8px;
      font-size: 10px; color: var(--xar-text-muted); margin-bottom: 4px; font-weight: 600;
    }
    #x-auto-reply-sidebar .xar-log-text {
      font-size: 11px; line-height: 1.4; white-space: pre-wrap; word-break: break-word;
      color: var(--xar-text-secondary);
    }
    #x-auto-reply-sidebar .xar-empty { color: var(--xar-text-muted); font-size: 12px; }
  `;
  document.documentElement.appendChild(style);

  sidebarRoot = document.createElement('div');
  sidebarRoot.id = 'x-auto-reply-sidebar';
  sidebarRoot.innerHTML = `
    <div class="xar-head">
      <div class="xar-title-wrap">
        <div class="xar-title">X Co Pilot <span style="font-size:10px; color:var(--xar-text-muted); font-weight:700;">v1</span></div>
        <div class="xar-sub">by airplanestar</div>
      </div>
      <div class="xar-head-btns">
        <button class="xar-icon-btn xar-theme-btn" type="button" title="Toggle theme">☀</button>
        <button class="xar-icon-btn xar-toggle" type="button" title="Collapse">◂</button>
      </div>
    </div>
    <div class="xar-body">
      <div class="xar-grid">
        <div class="xar-card"><div class="xar-label">Status</div><div class="xar-value" data-field="status">-</div></div>
        <div class="xar-card"><div class="xar-label">Mode</div><div class="xar-value" data-field="mode">-</div></div>
        <div class="xar-card"><div class="xar-label">Akun</div><div class="xar-value" data-field="account">-</div></div>
        <div class="xar-card"><div class="xar-label">Scroll</div><div class="xar-value" data-field="scroll">idle</div></div>
        <div class="xar-card"><div class="xar-label">Scanned</div><div class="xar-value" data-field="scanned">0</div></div>
        <div class="xar-card"><div class="xar-label">Provider</div><div class="xar-value" data-field="provider" style="font-size:11px;">-</div></div>
      </div>
      <div data-field="badge"></div>
      <div class="xar-switches">
        <button type="button" data-action="toggle-enabled">Enabled</button>
        <button type="button" data-action="toggle-whitelist">Whitelist</button>
        <button type="button" data-action="toggle-scroll">Auto Scroll</button>
        <button type="button" data-action="toggle-like">Like</button>
        <button type="button" data-action="toggle-cooldown">Cooldown</button>
        <button type="button" data-action="language-mode">Lang: All</button>
      </div>
      <div class="xar-control">
        <button class="xar-queue-toggle" type="button" data-action="queue-toggle">
          <strong>URL Queue</strong>
          <span data-field="queue-summary">idle</span>
        </button>
        <div class="xar-queue-panel collapsed" data-field="queue-panel">
          <textarea id="xar-url-queue" data-action="queue-input" placeholder="Paste daftar link X post di sini"></textarea>
          <div class="xar-queue-row">
            <button type="button" data-action="queue-start">Start Queue</button>
            <button type="button" data-action="queue-clear">Clear</button>
            <button type="button" data-action="queue-stop">Stop</button>
          </div>
          <div class="xar-queue-status" data-field="queue-status">-</div>
        </div>
      </div>
      <div class="xar-control">
        <button class="xar-queue-toggle" type="button" data-action="delete-toggle">
          <strong>Delete Replies</strong>
          <span data-field="delete-summary">idle</span>
        </button>
        <div class="xar-delete-panel collapsed" data-field="delete-panel">
          <input type="text" data-action="delete-query" value="from:airplanestar_ lang:ja filter:replies" />
          <div class="xar-delete-row">
            <button type="button" data-action="delete-search">Search</button>
            <button type="button" data-action="delete-visible">Run Delete</button>
            <button type="button" data-action="delete-stop">Stop</button>
          </div>
          <div class="xar-delete-status" data-field="delete-status">Search dulu, cek hasilnya, lalu Delete Visible.</div>
        </div>
      </div>
      <div class="xar-stats" data-field="stats"></div>
      <div class="xar-actions">
        <button type="button" data-action="ping">Ping LLM</button>
        <button type="button" data-action="scan">Test scan</button>
        <button type="button" data-action="logs">Open logs</button>
      </div>
      <div data-field="logs"></div>
    </div>
  `;
  document.documentElement.appendChild(sidebarRoot);

  // Auto-detect X's current theme
  function detectXTheme() {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg) return 'dark';
    const match = bg.match(/\d+/g);
    if (!match) return 'dark';
    const brightness = (parseInt(match[0]) + parseInt(match[1]) + parseInt(match[2])) / 3;
    return brightness > 128 ? 'light' : 'dark';
  }

  let panelTheme = detectXTheme();
  if (panelTheme === 'dark') sidebarRoot.classList.add('xar-dark');

  function updateThemeButton() {
    const btn = sidebarRoot.querySelector('.xar-theme-btn');
    if (btn) btn.textContent = sidebarRoot.classList.contains('xar-dark') ? '☀' : '🌙';
  }
  updateThemeButton();

  sidebarRoot.querySelector('.xar-theme-btn')?.addEventListener('click', () => {
    sidebarRoot.classList.toggle('xar-dark');
    updateThemeButton();
  });

  sidebarRoot.querySelector('.xar-toggle')?.addEventListener('click', () => {
    sidebarVisible = !sidebarVisible;
    sidebarRoot.classList.toggle('collapsed', !sidebarVisible);
    const btn = sidebarRoot.querySelector('.xar-toggle');
    if (btn) btn.textContent = sidebarVisible ? '◂' : '▸';
  });

  sidebarRoot.querySelector('[data-action="ping"]')?.addEventListener('click', async () => {
    setSidebarField('provider', 'pinging...');
    try {
      const res = await safeSendMessage({ type: 'PING_PROVIDER' });
      if (res?.ok) {
        setSidebarField('provider', '✅ OK (200)');
      } else {
        setSidebarField('provider', `❌ ${res?.error || res?.status || 'Error'}`);
      }
    } catch (err) {
      setSidebarField('provider', '❌ Disconnected');
    }
  });

  sidebarRoot.querySelector('[data-action="scan"]')?.addEventListener('click', () => {
    scanTimeline();
  });

  sidebarRoot.querySelector('[data-action="logs"]')?.addEventListener('click', async () => {
    const url = chrome.runtime.getURL('logs.html');
    window.open(url, '_blank');
  });

  sidebarRoot.querySelector('[data-action="toggle-enabled"]')?.addEventListener('click', async () => {
    await saveQuickSettings({ enabled: !settingsCache?.enabled });
  });

  sidebarRoot.querySelector('[data-action="toggle-whitelist"]')?.addEventListener('click', async () => {
    await saveQuickSettings({ whitelistEnabled: !settingsCache?.whitelistEnabled });
  });

  sidebarRoot.querySelector('[data-action="toggle-scroll"]')?.addEventListener('click', async () => {
    const nextEnabled = !autoScrollEnabled;
    autoScrollState = nextEnabled ? 'scrolling' : 'idle';
    await saveAutoScrollState({ enabled: nextEnabled });
  });

  sidebarRoot.querySelector('[data-action="toggle-like"]')?.addEventListener('click', async () => {
    await saveQuickSettings({ autoLikeAfterReply: !settingsCache?.autoLikeAfterReply });
  });

  sidebarRoot.querySelector('[data-action="toggle-cooldown"]')?.addEventListener('click', () => {
    toggleManualCooldown();
  });

  sidebarRoot.querySelector('[data-action="language-mode"]')?.addEventListener('click', async () => {
    const nextMode = settingsCache?.replyLanguageMode === 'english' ? 'all' : 'english';
    await saveQuickSettings({ replyLanguageMode: nextMode });
  });

  sidebarRoot.querySelector('[data-action="queue-toggle"]')?.addEventListener('click', () => {
    queuePanelVisible = !queuePanelVisible;
    updateQueueControl();
  });

  sidebarRoot.querySelector('[data-action="queue-start"]')?.addEventListener('click', () => {
    startUrlQueueFromPanel();
  });

  sidebarRoot.querySelector('[data-action="queue-clear"]')?.addEventListener('click', () => {
    clearUrlQueueFromPanel();
  });

  sidebarRoot.querySelector('[data-action="queue-stop"]')?.addEventListener('click', () => {
    stopUrlQueueFromPanel();
  });

  sidebarRoot.querySelector('[data-action="delete-toggle"]')?.addEventListener('click', () => {
    deletePanelVisible = !deletePanelVisible;
    updateDeleteControl();
  });

  sidebarRoot.querySelector('[data-action="delete-search"]')?.addEventListener('click', () => {
    openDeleteSearchFromPanel();
  });

  sidebarRoot.querySelector('[data-action="delete-visible"]')?.addEventListener('click', () => {
    deleteVisibleRepliesFromPanel();
  });

  sidebarRoot.querySelector('[data-action="delete-stop"]')?.addEventListener('click', () => {
    deleteRepliesStopRequested = true;
    updateDeleteControl('stopping');
  });

  refreshSidebar();
}



async function refreshSidebar() {
  if (!sidebarRoot || !extensionAlive || sidebarRefreshInFlight) return;
  sidebarRefreshInFlight = true;

  try {
    const [statsResponse, logsResponse] = await Promise.all([
      safeSendMessage({ type: 'GET_STATS' }),
      safeSendMessage({ type: 'GET_LOGS' })
    ]);

    const stats = statsResponse?.stats || {};
    const logs = logsResponse?.logs || [];
    const account = getCurrentAccountHandle() || '-';
    const statusClass = !settingsCache?.enabled ? 'off' : 'live';
    const statusText = !settingsCache?.enabled ? 'OFF' : 'ON · live';

    setSidebarField('status', statusText);
    setSidebarField('mode', `${settingsCache?.personaMode || '-'} / ${settingsCache?.personaStyle || '-'}`);
    setSidebarField('account', account);
    setSidebarField('scroll', isCooldownActive() ? 'cooling down' : autoScrollEnabled ? autoScrollState : 'off');
    setSidebarField('scanned', String(COMPLETED_TWEETS.size));
    if (isCooldownActive()) {
      setSidebarField('provider', getCooldownCountdownText());
    }
    
    // Jangan nimpa kalau lagi nampilin hasil ping atau lagi generate
    const providerWrap = sidebarRoot.querySelector('[data-field="provider"]');
    if (!isCooldownActive() && providerWrap && 
        !providerWrap.textContent.includes('✅') && 
        !providerWrap.textContent.includes('❌') && 
        !providerWrap.textContent.includes('pinging') &&
        !providerWrap.textContent.includes('Cooldown') &&
        !providerWrap.textContent.includes('Generating')) {
      const modelName = settingsCache?.model?.split('/').pop() || '-';
      setSidebarField('provider', modelName);
    }

    const badgeWrap = sidebarRoot.querySelector('[data-field="badge"]');
    if (badgeWrap) {
      badgeWrap.innerHTML = `<div class="xar-badge ${statusClass}">${escapeHtml(statusText)} · ${settingsCache?.whitelistEnabled ? 'whitelist on' : 'general mode'}</div>`;
    }

    const statsWrap = sidebarRoot.querySelector('[data-field="stats"]');
    if (statsWrap) {
      const byStatus = stats.byStatus || {};
      statsWrap.innerHTML = [
        ['skipped', byStatus.skipped || 0],
        ['drafted', byStatus.drafted || 0],
        ['submitted', byStatus.submitted || 0],
        ['failed', byStatus.failed || 0],
        ['1h sent', stats.submittedLastHour || 0],
        ['24h total', stats.last24h || 0],
        ['refresh', `${autoScrollSubmitCount}/${Number(settingsCache?.autoRefreshAfterSubmits || 0) || '-'}`]
      ].map(([label, value]) => `<div class="xar-mini"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`).join('');
    }

    updateSwitchButton('toggle-enabled', !!settingsCache?.enabled);
    updateSwitchButton('toggle-whitelist', !!settingsCache?.whitelistEnabled);
    updateSwitchButton('toggle-scroll', !!autoScrollEnabled);
    updateSwitchButton('toggle-like', !!settingsCache?.autoLikeAfterReply);
    updateSwitchButton('toggle-cooldown', manualCooldownEnabled || isCooldownActive());
    updateLanguageControl();
    updateQueueControl();
    updateDeleteControl();

    const logsWrap = sidebarRoot.querySelector('[data-field="logs"]');
    if (logsWrap) {
      const recent = [...logs].slice(-6).reverse();
      logsWrap.innerHTML = recent.length
        ? recent.map((item) => `
          <div class="xar-log">
            <div class="xar-log-head">
              <span>${escapeHtml(item.status || '-')}</span>
              <span>${escapeHtml(item.authorHandle || item.author || '-')}</span>
            </div>
            <div class="xar-log-text">${escapeHtml(item.reply || item.reason || '-')}</div>
          </div>
        `).join('')
        : '<div class="xar-empty">Belum ada log.</div>';
    }
  } finally {
    sidebarRefreshInFlight = false;
  }
}

async function saveQuickSettings(patch) {
  const response = await safeSendMessage({
    type: 'SAVE_SETTINGS',
    payload: patch
  });
  settingsCache = response?.settings || settingsCache;
  refreshSidebar();
}

async function safeSendMessage(message) {
  if (!extensionAlive) return null;
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    const text = String(error?.message || error || '');
    if (text.includes('Extension context invalidated')) {
      extensionAlive = false;
      autoScrollEnabled = false;
      autoScrollState = 'stopped';
      if (autoScrollTimer) {
        clearInterval(autoScrollTimer);
        autoScrollTimer = null;
      }
      stopCooldownCountdown();
      return null;
    }
    return null;
  }
}

function updateSwitchButton(action, active) {
  const node = sidebarRoot?.querySelector(`[data-action="${action}"]`);
  if (!node) return;
  node.classList.toggle('active', active);
}

function updateLanguageControl() {
  const node = sidebarRoot?.querySelector('[data-action="language-mode"]');
  if (!node) return;
  const mode = settingsCache?.replyLanguageMode || 'all';
  node.textContent = mode === 'english' ? 'Lang: EN' : 'Lang: All';
  node.title = mode === 'english' ? 'Reply hanya tweet English' : 'Reply semua bahasa';
  node.classList.toggle('active', mode === 'english');
}

function updateQueueControl() {
  if (!sidebarRoot) return;

  const panel = sidebarRoot.querySelector('[data-field="queue-panel"]');
  if (panel) panel.classList.toggle('collapsed', !queuePanelVisible);

  const input = sidebarRoot.querySelector('[data-action="queue-input"]');
  if (input && document.activeElement !== input && urlQueueState?.rawText && input.value !== urlQueueState.rawText) {
    input.value = urlQueueState.rawText;
  }

  updateSwitchButton('queue-start', !!urlQueueState?.active);
  const status = sidebarRoot.querySelector('[data-field="queue-status"]');
  const summary = sidebarRoot.querySelector('[data-field="queue-summary"]');

  const total = urlQueueState?.urls?.length || 0;
  const current = total ? Math.min((urlQueueState?.index || 0) + 1, total) : 0;
  const state = urlQueueState?.active ? 'running' : 'idle';
  const reason = urlQueueState?.lastReason || '-';
  if (summary) {
    summary.textContent = total ? `${state} ${current}/${total}` : 'idle';
  }
  if (status) {
    status.textContent = total
    ? `${state} · ${current}/${total} · ${reason}`
    : 'Paste link lalu Start Queue.';
  }
}

function updateDeleteControl(message = '') {
  if (!sidebarRoot) return;

  const panel = sidebarRoot.querySelector('[data-field="delete-panel"]');
  if (panel) panel.classList.toggle('collapsed', !deletePanelVisible);

  const summary = sidebarRoot.querySelector('[data-field="delete-summary"]');
  const status = sidebarRoot.querySelector('[data-field="delete-status"]');
  const text = message || (deleteRepliesRunning ? 'running' : 'idle');
  if (summary) summary.textContent = text;
  if (status && message) status.textContent = message;

  updateSwitchButton('delete-visible', deleteRepliesRunning);
}

function hasUnprocessedVisibleTweets() {
  const tweets = findTweetArticles();
  for (const tweet of tweets) {
    const meta = extractTweetMeta(tweet);
    if (!meta?.tweetId) continue;
    if (!COMPLETED_TWEETS.has(meta.tweetId) && !PROCESSING_TWEETS.has(meta.tweetId)) {
      return true;
    }
  }
  return false;
}

function getAutoScrollDistance() {
  const mode = String(settingsCache?.autoScrollDistanceMode || 'medium').toLowerCase();
  const distances = {
    a: 600,
    medium: 600,
    b: 1000,
    more: 1000,
    c: 1600,
    deep: 1600
  };
  return distances[mode] || distances.medium;
}

function clickNewPostsBannerIfVisible() {
  const pattern = /\b(show|tampilkan|lihat)\s+[\d,.kKmM+]+\s+(post|posts|posting|postingan)\b/i;
  const candidates = [
    ...document.querySelectorAll('a[role="link"], div[role="button"], button, [data-testid="cellInnerDiv"]')
  ];

  for (const node of candidates) {
    const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!pattern.test(text)) continue;

    const clickable =
      node.querySelector?.('a[role="link"], div[role="button"], button') ||
      node.closest('a[role="link"], div[role="button"], button') ||
      node;
    if (!clickable || !document.contains(clickable)) continue;
    clickElementLikeUser(clickable);
    setSidebarField('provider', text.slice(0, 32));
    return true;
  }

  return false;
}

function clickElementLikeUser(element) {
  element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  element.focus?.();
  for (const type of ['mouseover', 'mousedown', 'mouseup', 'click']) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }
  element.click?.();
}

function startAutoScrollLoop() {
  if (autoScrollTimer) clearInterval(autoScrollTimer);
  autoScrollTimer = setInterval(() => {
    if (!autoScrollEnabled) return;
    if (autoRefreshScheduled) return;
    if (!settingsCache?.enabled) {
      autoScrollState = 'paused';
      return;
    }
    if (isCooldownActive()) {
      autoScrollState = 'cooldown';
      return;
    }
    if (replyInProgress) {
      autoScrollState = 'replying';
      return;
    }
    if (PROCESSING_TWEETS.size > 0) {
      autoScrollState = 'checking';
      return;
    }
    if (clickNewPostsBannerIfVisible()) {
      autoScrollState = 'new posts';
      return;
    }
    autoScrollState = 'scrolling';
    window.scrollBy({ top: getAutoScrollDistance(), behavior: 'smooth' });
  }, 5000);
}

function isCooldownActive() {
  return cooldownPausedUntil && Date.now() < cooldownPausedUntil;
}

async function toggleManualCooldown() {
  manualCooldownEnabled = !manualCooldownEnabled;

  if (!manualCooldownEnabled) {
    await saveManualCooldownState({ enabled: false, until: 0 });
    return;
  }

  setSidebarField('provider', 'Cooldown ready');
  await saveManualCooldownState({ enabled: true, until: cooldownPausedUntil });
}

async function startManualCooldownAfterReply() {
  if (!manualCooldownEnabled) return;

  const cooldownSec = Math.max(1, Number(settingsCache?.cooldownSec || 120));
  await saveManualCooldownState({
    enabled: true,
    until: Date.now() + cooldownSec * 1000
  });
}

function pauseAutoScrollForCooldown(decision = {}) {
  const retryAt = Number(decision.retryAt || 0);
  const remainingMs = Number(decision.cooldownRemainingMs || 0);
  cooldownPausedUntil = retryAt || Date.now() + Math.max(1000, remainingMs);
  autoScrollState = 'cooldown';
  startCooldownCountdown();
  if (manualCooldownEnabled) {
    saveManualCooldownState({ enabled: true, until: cooldownPausedUntil });
  }
  refreshSidebar();
}

function startCooldownCountdown() {
  if (cooldownCountdownTimer) clearInterval(cooldownCountdownTimer);
  updateCooldownProvider();
  cooldownCountdownTimer = setInterval(updateCooldownProvider, 1000);
}

function stopCooldownCountdown() {
  if (cooldownCountdownTimer) {
    clearInterval(cooldownCountdownTimer);
    cooldownCountdownTimer = null;
  }
}

function updateCooldownProvider() {
  if (!isCooldownActive()) {
    stopCooldownCountdown();
    if (autoScrollState === 'cooldown') {
      autoScrollState = autoScrollEnabled ? 'scrolling' : 'idle';
    }
    setSidebarField('provider', manualCooldownEnabled ? 'Cooldown ready' : '-');
    refreshSidebar();
    return;
  }

  setSidebarField('provider', getCooldownCountdownText());
  setSidebarField('scroll', 'cooling down');
  updateSwitchButton('toggle-cooldown', true);
}

function getCooldownCountdownText() {
  const remainingMs = Math.max(0, cooldownPausedUntil - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Cooldown ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopAutoScrollForReply() {
  replyInProgress = true;
  autoScrollState = 'replying';
  refreshSidebar();
}

function scheduleAutoScrollRefreshIfNeeded() {
  if (urlQueueState?.active || !autoScrollEnabled || autoRefreshScheduled) return;

  const threshold = Number(settingsCache?.autoRefreshAfterSubmits || 0);
  if (!threshold || threshold < 1) return;

  autoScrollSubmitCount += 1;
  if (autoScrollSubmitCount < threshold) {
    saveAutoScrollState({ enabled: true, submitCount: autoScrollSubmitCount });
    refreshSidebar();
    return;
  }

  autoRefreshScheduled = true;
  autoScrollSubmitCount = 0;
  autoScrollState = 'refreshing';
  refreshSidebar();

  saveAutoScrollState({ enabled: true, submitCount: 0 }).finally(() => {
    setTimeout(() => {
      location.reload();
    }, 1500);
  });
}

function setSidebarField(name, value) {
  const node = sidebarRoot?.querySelector(`[data-field="${name}"]`);
  if (node) node.textContent = value;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==========================================
// MANUAL ASSIST MODE
// ==========================================

let activeAssistSession = 0;

function injectAssistButtons() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  for (const article of articles) {
    if (article.dataset.assistInjected) continue;

    const actionBar = article.querySelector('[role="group"]');
    if (!actionBar) continue;

    const btn = document.createElement('button');
    btn.innerHTML = '🎲';
    btn.className = 'xar-assist-btn';
    btn.title = 'X Co Pilot';
    btn.style.cssText = `
      background: transparent; 
      border: none; 
      border-radius: 999px; 
      width: 34px; 
      height: 34px; 
      font-size: 18px; 
      cursor: pointer; 
      margin-left: 4px; 
      transition: all 0.2s ease-in-out;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    `;
    
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(29, 155, 240, 0.1)'; // Twitter blue light hover
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleManualAssist(btn, article);
    });

    actionBar.appendChild(btn);
    article.dataset.assistInjected = 'true';
  }
}

async function handleManualAssist(btn, article) {
  if (btn.disabled) return;
  btn.disabled = true;

  try {
    const meta = extractTweetMeta(article);
    if (!meta?.tweetId) {
      alert('❌ Error: Gagal membaca ID tweet');
      return;
    }

    // 1. Simpan session ID biar kalau ada klik baru, yang lama otomatis di-cancel
    const session = Date.now();
    await setActiveAssistSession(session, meta.tweetId);

    // 2. Langsung klik tombol reply X buat buka modal biar responsif
    const replyBtn = article.querySelector('[data-testid="reply"]');
    if (replyBtn) {
      replyBtn.click();
    } else {
      alert('❌ Error: Tombol Reply tidak ditemukan');
      return;
    }

    // 3. Kasih tau di panel kalau lagi generate manual (di kolom provider)
    setSidebarField('provider', '⏳ Generating...');

    // 4. Panggil LLM buat nge-generate teks
    const generation = await safeSendMessage({
      type: 'GENERATE_REPLY',
      payload: meta
    });

    // Cek apakah user udah klik Assist di tweet lain pas kita lagi nunggu LLM
    if (!(await isCurrentAssistSession(session))) {
      console.warn(`[x-auto-reply] Assist for ${meta.tweetId} aborted because a newer tweet was clicked.`);
      return; // Stop di sini, jangan inject teks
    }

    // Bersihkan status provider agar bisa direfresh kembali ke nama model
    setSidebarField('provider', '-');
    refreshSidebar();

    if (!generation?.ok || !generation.reply) {
      alert('❌ Failed: ' + (generation?.error || 'Gagal generate reply'));
      return;
    }

    // 4. Pastikan modal composer udah kebuka
    let composer = null;
    let dialog = null;
    for (let i = 0; i < 20; i++) {
      dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        composer = dialog.querySelector('[data-testid="tweetTextarea_0"]') || dialog.querySelector('div[role="textbox"]');
        if (composer) break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!composer) {
      alert('❌ Modal Reply tidak terbuka');
      return;
    }

    // 5. Inject teks ke dalam composer
    await simulateReactInput(composer, generation.reply);
    watchManualAssistSubmitAndLike(article, dialog);
    await startManualCooldownAfterReply();
    await clearActiveAssistSession(session);

  } catch (err) {
    console.error('[x-auto-reply]', err);
    setSidebarField('provider', '-');
    refreshSidebar();
  } finally {
    await clearActiveAssistSession(activeAssistSession);
    setTimeout(() => {
      btn.disabled = false;
    }, 2000);
  }
}

async function simulateReactInput(element, text) {
  element.focus();
  element.click();
  await new Promise(r => setTimeout(r, 100));

  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);
  
  element.dispatchEvent(
    new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    })
  );
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings?.newValue) {
    settingsCache = changes.settings.newValue;
  }
  if (areaName === 'local' && changes[URL_QUEUE_STORAGE_KEY]?.newValue) {
    urlQueueState = normalizeUrlQueueState(changes[URL_QUEUE_STORAGE_KEY].newValue);
  }
  if (areaName === 'local' && changes[AUTO_SCROLL_STORAGE_KEY]?.newValue) {
    const state = changes[AUTO_SCROLL_STORAGE_KEY].newValue || {};
    autoScrollEnabled = Boolean(state.enabled);
    autoScrollSubmitCount = Math.max(0, Number(state.submitCount || 0));
    if (!autoScrollEnabled && !autoRefreshScheduled) autoScrollState = 'idle';
  }
  if (areaName === 'local' && changes[MANUAL_COOLDOWN_STORAGE_KEY]?.newValue) {
    applyManualCooldownState(changes[MANUAL_COOLDOWN_STORAGE_KEY].newValue || {});
  }
  refreshSidebar();
});
