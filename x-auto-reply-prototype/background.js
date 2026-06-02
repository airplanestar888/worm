import { LOCAL_DEFAULTS, LOCAL_PROVIDERS } from './local-secrets.js';
import { CONFIG } from './config.js';

const PERSONA_MODES = {
  balanced: 'Fokus ke reply yang relevan, aman, dan nyambung konteks.',
  engage: 'Fokus ke engagement natural yang bikin orang pengen lanjut ngobrol.',
  support: 'Fokus ke reply yang positif, helpful, dan enak dibaca.',
  promo: 'Fokus ke awareness halus tanpa hard selling atau kesannya spam.'
};

const PERSONA_STYLES = {
  natural: 'Gaya natural, santai, dan manusiawi.',
  witty: 'Gaya ringan dan witty secukupnya, jangan maksa lucu.',
  sharp: 'Gaya tajam, ringkas, dan percaya diri tanpa agresif.',
  warm: 'Gaya hangat, sopan, dan gampang disukai.'
};

const DEFAULT_SETTINGS = {
  enabled: false,
  autoSubmit: true,
  endpoint: LOCAL_DEFAULTS?.endpoint || 'https://integrate.api.nvidia.com/v1/chat/completions',
  apiKey: LOCAL_DEFAULTS?.apiKey || '',
  model: LOCAL_DEFAULTS?.model || 'stepfun-ai/step-3.5-flash',
  dryRun: false,
  debug: true,
  ...CONFIG
};

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get(['settings']);
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, logs: [], replyHistory: [] });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case 'GET_SETTINGS': {
          const settings = await getSettings();
          sendResponse({ ok: true, settings });
          break;
        }
        case 'SAVE_SETTINGS': {
          const merged = await saveSettings(message.payload || {});
          sendResponse({ ok: true, settings: merged });
          break;
        }
        case 'GET_AVAILABLE_MODELS': {
          const result = await getAvailableModels();
          sendResponse({ ok: true, ...result });
          break;
        }
        case 'GET_PROVIDER_PRESETS': {
          sendResponse({ ok: true, providers: LOCAL_PROVIDERS });
          break;
        }
        case 'SHOULD_PROCESS_TWEET': {
          const decision = await shouldProcessTweet(message.payload || {});
          sendResponse({ ok: true, ...decision });
          break;
        }
        case 'GENERATE_REPLY': {
          const reply = await generateReply(message.payload || {});
          sendResponse({ ok: true, ...reply });
          break;
        }
        case 'OPEN_INTENT_REPLY': {
          const result = await openIntentReply(message.payload || {}, sender.tab?.id);
          sendResponse({ ok: true, ...result });
          break;
        }
        case 'GET_PENDING_INTENT_REPLY': {
          const pending = await getPendingIntentReply(message.payload?.tweetId);
          sendResponse({ ok: true, pending });
          break;
        }
        case 'CLEAR_PENDING_INTENT_REPLY': {
          await clearPendingIntentReply(message.payload?.tweetId);
          sendResponse({ ok: true });
          break;
        }
        case 'CLOSE_INTENT_TAB': {
          await closeIntentTab(sender.tab?.id);
          sendResponse({ ok: true });
          break;
        }
        case 'CLOSE_TAB_BY_ID': {
          const tabId = message.payload?.tabId;
          if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
          sendResponse({ ok: true });
          break;
        }
        case 'RECORD_RESULT': {
          await recordResult(message.payload || {});
          sendResponse({ ok: true });
          break;
        }
        case 'GET_STATS': {
          const stats = await getStats();
          sendResponse({ ok: true, stats });
          break;
        }
        case 'GET_LOGS': {
          const { logs = [] } = await chrome.storage.local.get(['logs']);
          sendResponse({ ok: true, logs });
          break;
        }
        case 'CLEAR_LOGS': {
          await chrome.storage.local.set({ logs: [] });
          sendResponse({ ok: true });
          break;
        }
        case 'PING_PROVIDER': {
          const ping = await pingProvider();
          sendResponse({ ok: true, ...ping });
          break;
        }
        case 'CLEANUP_STALE_PENDING': {
          const cleaned = await cleanupStalePending();
          sendResponse({ ok: true, cleaned });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[x-auto-reply]', error);
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  })();

  return true;
});

async function getSettings() {
  const { settings } = await chrome.storage.local.get(['settings']);
  
  // Base default adalah DEFAULT_SETTINGS digabung dengan CONFIG
  const base = { ...DEFAULT_SETTINGS, ...CONFIG };
  
  // Storage (hasil save dari Options menu) menimpa base config
  const merged = { ...base, ...(settings || {}) };
  const providerPreset = LOCAL_PROVIDERS[merged.provider] || LOCAL_PROVIDERS[LOCAL_DEFAULTS.provider];
  return {
    ...merged,
    endpoint: providerPreset?.endpoint || merged.endpoint,
    apiKey: providerPreset?.apiKey || merged.apiKey,
    providerHeaders: providerPreset?.headers || {}
  };
}

async function saveSettings(nextSettings) {
  const merged = { ...(await getSettings()), ...nextSettings };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

async function getAvailableModels() {
  const settings = await getSettings();
  if (!settings.endpoint) throw new Error('Endpoint belum diisi');
  if (!settings.apiKey) throw new Error('API key belum diisi');

  const url = getModelsEndpoint(settings.endpoint);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
      ...(settings.providerHeaders || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Models error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const models = normalizeModelsResponse(data);
  return { models, url };
}

function getModelsEndpoint(endpoint) {
  const url = new URL(endpoint);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname
    .replace(/\/chat\/completions\/?$/, '/models')
    .replace(/\/responses\/?$/, '/models')
    .replace(/\/completions\/?$/, '/models');

  if (!url.pathname.endsWith('/models')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
  }

  return url.toString();
}

function normalizeModelsResponse(data) {
  const source = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return source
    .map((item) => (typeof item === 'string' ? item : item?.id || item?.name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function openIntentReply({ tweetId, reply = '', autoSubmit = false, meta = {} }, sourceTabId) {
  if (!tweetId) throw new Error('tweetId kosong untuk intent reply');
  if (!reply.trim()) throw new Error('reply kosong untuk intent reply');

  const pending = {
    tweetId,
    reply,
    autoSubmit: Boolean(autoSubmit),
    meta,
    sourceTabId,
    ts: Date.now()
  };
  const { pendingIntentReplies = {} } = await chrome.storage.local.get(['pendingIntentReplies']);
  await chrome.storage.local.set({
    pendingIntentReplies: {
      ...pendingIntentReplies,
      [tweetId]: pending
    }
  });

  const url = `https://x.com/intent/tweet?in_reply_to=${encodeURIComponent(tweetId)}&text=${encodeURIComponent(reply)}`;
  const createOptions = { url, active: false };
  if (sourceTabId) createOptions.openerTabId = sourceTabId;
  const tab = await chrome.tabs.create(createOptions);
  return { tabId: tab.id, url };
}

async function getPendingIntentReply(tweetId) {
  if (!tweetId) return null;
  const { pendingIntentReplies = {} } = await chrome.storage.local.get(['pendingIntentReplies']);
  return pendingIntentReplies[tweetId] || null;
}

async function clearPendingIntentReply(tweetId) {
  if (!tweetId) return;
  const { pendingIntentReplies = {} } = await chrome.storage.local.get(['pendingIntentReplies']);
  const pending = pendingIntentReplies[tweetId];
  if (!pending) return;
  const next = { ...pendingIntentReplies };
  delete next[tweetId];
  await chrome.storage.local.set({ pendingIntentReplies: next });
  if (pending.sourceTabId) {
    await chrome.tabs.sendMessage(pending.sourceTabId, {
      type: 'INTENT_REPLY_DONE',
      payload: { tweetId }
    }).catch(() => {});
  }
}

async function closeIntentTab(tabId) {
  if (!tabId) return;
  await chrome.tabs.remove(tabId).catch(() => {});
}

async function shouldProcessTweet({ tweetId, text = '', authorHandle = '', currentHandle = '', isPromoted = false, isLiked = false, isReply = false, tweetTs = 0, forceRetry = false, forceReply = false }) {
  const settings = await getSettings();
  const now = Date.now();
  const { replyHistory = [] } = await chrome.storage.local.get(['replyHistory']);
  const history = pruneHistory(replyHistory, now);
  const recentCount = history.filter((item) => now - item.ts < 3600_000 && item.status === 'submitted').length;
  const normalizedAuthor = normalizeHandle(authorHandle);
  const normalizedCurrent = normalizeHandle(currentHandle);

  if (!settings.enabled) return { allow: false, reason: 'disabled' };

  // Global lock: kalau ada intent reply yang lagi pending, blokir semua tab
  await cleanupStalePending(); // otomatis bersihkan lock yang nyangkut
  const { pendingIntentReplies = {} } = await chrome.storage.local.get(['pendingIntentReplies']);
  if (Object.keys(pendingIntentReplies).length > 0) return { allow: false, reason: 'intent-pending' };

  if (!tweetId || !text.trim()) return { allow: false, reason: 'missing-data' };
  if (!forceReply && settings.replyLanguageMode === 'english' && !looksEnglishTweet(text)) {
    return { allow: false, reason: 'non-english' };
  }
  if (!forceReply && tweetTs) {
    const tweetDate = new Date(Number(tweetTs));
    const nowDate = new Date(now);
    
    // Syarat 1: Maksimal 5 jam
    const maxTweetAgeMs = 5 * 3600_000; // Hardcode max 5 hours
    if (now - tweetDate.getTime() > maxTweetAgeMs) {
      return { allow: false, reason: 'too-old' };
    }
    
    // Syarat 2: Harus hari yang sama (tanggalnya sama persis)
    if (tweetDate.toDateString() !== nowDate.toDateString()) {
      return { allow: false, reason: 'too-old-diff-date' };
    }
  } else if (!forceReply) {
    // Kalau gagal baca timestamp, mending ditolak daripada kebablasan reply tweet lama
    return { allow: false, reason: 'missing-timestamp' };
  }
  if (!forceReply && settings.skipPromoted && isPromoted) return { allow: false, reason: 'promoted' };
  if (!forceReply && isReply) return { allow: false, reason: 'reply-post' };
  if (!forceReply && isLiked) return { allow: false, reason: 'already-liked' };
  if (!forceReply && text.trim().length < Number(settings.minTweetLength || 0)) return { allow: false, reason: 'too-short' };
  const alreadyProcessed = history.some((item) => {
    if (item.tweetId !== tweetId) return false;
    if (forceReply) return false;
    if (!forceRetry) return true;
    return item.status === 'submitted' || item.status === 'drafted';
  });
  if (alreadyProcessed) return { allow: false, reason: 'already-processed' };
  if (recentCount >= Number(settings.maxRepliesPerHour || 0)) return { allow: false, reason: 'hourly-limit' };

  if (!forceReply && settings.skipOwnAccount && normalizedAuthor && normalizedCurrent && normalizedAuthor === normalizedCurrent) {
    return { allow: false, reason: 'own-account' };
  }

  const whitelist = String(settings.whitelistAccounts || '')
    .split(/[\n,]/)
    .map((item) => normalizeHandle(item))
    .filter(Boolean);
  if (!forceReply && settings.whitelistEnabled && whitelist.length > 0 && (!normalizedAuthor || !whitelist.includes(normalizedAuthor))) {
    return { allow: false, reason: 'not-whitelisted' };
  }

  const lastSuccess = [...history].reverse().find((item) => item.status === 'submitted');
  if (lastSuccess && now - lastSuccess.ts < Number(settings.cooldownSec || 0) * 1000) {
    const retryAt = lastSuccess.ts + Number(settings.cooldownSec || 0) * 1000;
    return {
      allow: false,
      reason: 'cooldown',
      retryAt,
      cooldownRemainingMs: Math.max(0, retryAt - now)
    };
  }

  const blacklist = String(settings.blacklistKeywords || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const lower = text.toLowerCase();
  const matched = blacklist.find((keyword) => lower.includes(keyword));
  if (!forceReply && matched) return { allow: false, reason: `blacklist:${matched}` };

  return { allow: true, reason: 'ok' };
}

async function generateReply({ text = '', author = '', authorHandle = '', url = '' }) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error('API key belum diisi di options');
  if (!settings.endpoint) throw new Error('Endpoint belum diisi di options');
  const languageRule = detectReplyLanguageRule(text);

  const prompt = [
    `Tweet handle: ${authorHandle || 'unknown'}`,
    `Tweet author: ${author || 'unknown'}`,
    `Tweet URL: ${url || 'unknown'}`,
    languageRule,
    '',
    'Balas tweet berikut dengan satu reply saja.',
    'Bahasa reply WAJIB mengikuti bahasa tweet target.',
    `CRITICAL RULE: Panjang jawaban mutlak TIDAK BOLEH lebih dari ${settings.maxReplyLength} karakter (termasuk spasi).`,
    `Jika lebih dari ${settings.maxReplyLength} karakter, jawabanmu akan error. Buatlah padat dan singkat!`,
    'Output harus isi reply final saja. Jangan sertakan Reason, Result, explanation, markdown, label, atau tag <think>.',
    'Jangan pakai pembuka seperti "Tentu" atau "Berikut".',
    'Jangan pakai tanda kutip pembuka/penutup.',
    'Jangan mention banyak akun.',
    'Kalau tweet sensitif/ambigu, jawab netral singkat atau bilang skip dengan token [SKIP].',
    '',
    text
  ].join('\n');

  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(settings.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
          ...(settings.providerHeaders || {})
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.8,
          messages: [
            { role: 'system', content: buildSystemPrompt(settings, text) },
            { role: 'user', content: prompt }
          ]
        }),
        keepalive: true
      }, 25000);

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          // Error yang bisa dicoba ulang (Rate limit atau Server sibuk)
          lastError = new Error(`HTTP ${response.status}`);
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000 * attempt)); // Exponential backoff
            continue;
          }
        }
        const body = await response.text();
        throw new Error(`LLM error ${response.status}: ${body.slice(0, 400)}`);
      }

      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content?.trim() || '';
      const content = sanitizeReply(raw, Number(settings.maxReplyLength || 220), Boolean(settings.postProcessReply));

      if (!content || content.toUpperCase() === '[SKIP]') {
        return { skip: true, reply: '', raw };
      }

      return { skip: false, reply: content, raw };

    } catch (err) {
      lastError = err;
      const message = err?.message || String(err);
      
      // Kalau timeout atau putus koneksi jaringan, coba ulang
      if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network')) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError;
}

function fetchWithTimeout(url, options, timeoutMs) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`LLM timeout setelah ${Math.round(timeoutMs / 1000)} detik`)), timeoutMs);
    })
  ]);
}

function sanitizeReply(input, maxLen, postProcess = false) {
  let text = extractReplyResult(input)
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (postProcess) text = normalizeReplyOutput(text);
  if (!text) return '';
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, Math.max(0, postProcess ? maxLen : maxLen - 3)).trimEnd();
  return postProcess ? normalizeReplyOutput(truncated) : `${truncated}...`;
}

function normalizeReplyOutput(value = '') {
  return String(value || '')
    .replace(/^['"`\u201c\u201d\u2018\u2019]+|['"`\u201c\u201d\u2018\u2019]+$/g, '')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]+/g, ',')
    .replace(/\b(?!(?:on-chain|off-chain|low-latency|high-latency|real-world|long-term|short-term)\b)([a-z0-9]+)-([a-z0-9]+)\b/gi, '$1 $2')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/g, '')
    .toLowerCase();
}

function postProcessReplyText(value = '') {
  return String(value || '')
    .replace(/^['"`“”‘’]+|['"`“”‘’]+$/g, '')
    .replace(/[‘’']/g, '')
    .replace(/[–—]+/g, ',')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/g, '')
    .toLowerCase();
}

function extractReplyResult(input) {
  let text = String(input || '').trim();
  if (!text) return '';

  text = text
    .replace(/^```(?:json|text|markdown)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .replace(/^\s*<think>[\s\S]*$/i, '')
    .trim();

  const resultMatch = text.match(/(?:^|\n)\s*(?:result|reply|final(?: answer)?|jawaban|hasil|answer)\s*:\s*([\s\S]+)$/i);
  if (resultMatch?.[1]) {
    text = resultMatch[1].trim();
  } else {
    text = text.replace(/(?:^|\n)\s*(?:reason|reasoning|thought|explanation|alasan|analysis)\s*:\s*[\s\S]*?(?=\n\s*(?:result|reply|final(?: answer)?|jawaban|hasil|answer)\s*:|$)/gi, '').trim();
  }

  return text
    .replace(/(?:^|\n)\s*(?:reason|reasoning|thought|explanation|alasan|analysis)\s*:\s*[\s\S]*$/i, '')
    .replace(/^\s*(?:result|reply|final(?: answer)?|jawaban|hasil|answer)\s*:\s*/i, '')
    .trim();
}

function buildSystemPrompt(settings, tweetText = '') {
  const mode = PERSONA_MODES[settings.personaMode] || PERSONA_MODES.balanced;
  const style = PERSONA_STYLES[settings.personaStyle] || PERSONA_STYLES.natural;
  const languageRule = detectReplyLanguageRule(tweetText);
  return [
    'Kamu operator akun X yang bikin reply singkat, relevan, dan natural.',
    mode,
    style,
    languageRule,
    settings.personaPrompt || ''
  ]
    .filter(Boolean)
    .join(' ');
}

function detectReplyLanguageRule(tweetText = '') {
  const text = ` ${String(tweetText || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const indoMarkers = [
    ' yang ', ' dan ', ' nggak ', ' ngga ', ' gak ', ' ga ', ' aja ', ' banget ', ' buat ', ' sama ', ' kamu ', ' aku ', ' gue ', ' gua ', ' gw ', ' lo ', ' lu ', ' kita ', ' mereka ', ' ini ', ' itu ', ' kalau ', ' kalo ', ' biar ', ' udah ', ' sudah ', ' belum ', ' masih ', ' karena ', ' dengan ', ' untuk ', ' dari ', ' jadi ', ' nih ', ' dong ', ' sih ', ' kok ', ' deh ', ' tuh ', ' ya ', ' iya ', ' bener ', ' emang ', ' cuma ', ' tapi ', ' atau ', ' bisa ', ' jangan ', ' kayak ', ' kaya ', ' soal ', ' orang ', ' banget.'
  ];

  let score = 0;
  for (const marker of indoMarkers) {
    if (text.includes(marker)) score += 1;
  }

  const looksIndonesian = score >= 1 || /\b(apa|siapa|kenapa|mengapa|gimana|bagaimana|dimana|kapan|bagus|murah|mahal|cepat|lambat|wkwk|anjir|mantap|setuju|makasih|terima kasih)\b/.test(text);

  if (looksIndonesian) {
    return 'CRITICAL LANGUAGE RULE: TARGET tweet is Indonesian. Reply entirely in Indonesian casual/natural. Do not use English.';
  }

  return 'CRITICAL LANGUAGE RULE: TARGET tweet is English or non-Indonesian. Reply entirely in English. Do not use Indonesian.';
}

function normalizeHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

function looksEnglishTweet(value = '') {
  const text = String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[@#][\w_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!text) return false;

  const letters = text.match(/[a-z]/g)?.length || 0;
  const nonAsciiLetters = text.match(/[^\x00-\x7F]/g)?.length || 0;
  if (letters < 3 || nonAsciiLetters > Math.max(2, letters * 0.15)) return false;

  const indoMarkers = /\b(yang|dan|nggak|gak|ga|aja|banget|buat|sama|kamu|aku|gue|gw|lu|lo|kita|mereka|ini|itu|kalau|kalo|biar|udah|sudah|belum|masih|karena|dengan|untuk|dari|jadi|nih|dong|sih|kok|gimana|kenapa)\b/i;
  if (indoMarkers.test(text)) return false;

  return true;
}

async function recordResult(payload) {
  const now = Date.now();
  const { replyHistory = [], logs = [] } = await chrome.storage.local.get(['replyHistory', 'logs']);
  const nextEntry = { ...payload, ts: now };
  const nextHistory = pruneHistory([...replyHistory, nextEntry], now);
  const nextLogs = [...logs, nextEntry].slice(-200);
  await chrome.storage.local.set({ replyHistory: nextHistory, logs: nextLogs });
}

function pruneHistory(history, now = Date.now()) {
  return history.filter((item) => now - Number(item.ts || 0) < 24 * 3600_000);
}

async function getStats() {
  const now = Date.now();
  const { replyHistory = [] } = await chrome.storage.local.get(['replyHistory']);
  const history = pruneHistory(replyHistory, now);
  const byStatus = history.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    last24h: history.length,
    submittedLastHour: history.filter((item) => now - item.ts < 3600_000 && item.status === 'submitted').length,
    lastItem: history[history.length - 1] || null,
    byStatus
  };
}
async function cleanupStalePending() {
  const { pendingIntentReplies = {} } = await chrome.storage.local.get(['pendingIntentReplies']);
  const now = Date.now();
  let changed = false;
  let count = 0;
  for (const [id, pending] of Object.entries(pendingIntentReplies)) {
    if (now - pending.ts > 120_000) { // older than 2 minutes
      delete pendingIntentReplies[id];
      changed = true;
      count++;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ pendingIntentReplies });
  }
  return count;
}

async function pingProvider() {
  const settings = await getSettings();
  if (!settings.apiKey) return { ok: false, error: 'no-api-key' };
  
  try {
    const url = settings.endpoint || 'https://integrate.api.nvidia.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
        ...(settings.providerHeaders || {})
      },
      body: JSON.stringify({
        model: settings.model || 'stepfun-ai/step-3.5-flash',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      })
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
