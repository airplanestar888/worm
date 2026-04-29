const SESSION_KEY = 'worm.activeSession';
const THEME_KEY = 'worm.theme';
const body = document.body;
const msgsScroll = document.getElementById('msgsScroll');
const messagesEl = document.getElementById('messages');
const modelSelect = document.getElementById('modelSelect');
const modeSelect = document.getElementById('modeSelect');
const providerSelect = document.getElementById('providerSelect');
const surfaceModeSelect = document.getElementById('surfaceModeSelect');
const workspaceSelect = document.getElementById('workspaceSelect');
const workspaceTitleSide = document.getElementById('workspaceTitleSide');
const messageInput = document.getElementById('messageInput');
const healthText = document.getElementById('healthText');
const healthTextMobile = document.getElementById('healthTextMobile');
const statusDot = document.getElementById('statusDot');
const statusDotMobile = document.getElementById('statusDotMobile');
const sidebarScrim = document.getElementById('sidebarScrim');
const chatList = document.getElementById('chatList');
const sendBtn = document.getElementById('sendBtn');
const selectionToast = document.getElementById('selectionToast');
const composerSettings = document.getElementById('composerSettings');
const composerSettingsToggle = document.getElementById('composerSettingsToggle');
const composerSettingsPanel = document.getElementById('composerSettingsPanel');
const composerSettingsValue = document.getElementById('composerSettingsValue');
const sessionSetupModal = document.getElementById('sessionSetupModal');
const sessionSetupProvider = document.getElementById('sessionSetupProvider');
const sessionSetupModel = document.getElementById('sessionSetupModel');
const sessionSetupOk = document.getElementById('sessionSetupOk');
const sessionSetupCancel = document.getElementById('sessionSetupCancel');
const sessionSetupStatus = document.getElementById('sessionSetupStatus');
const loadingModal = document.getElementById('loadingModal');
const loadingTitle = document.getElementById('loadingTitle');
const loadingMsg = document.getElementById('loadingMsg');
const themeLightBtn = document.getElementById('themeLightBtn');
const themeNightBtn = document.getElementById('themeNightBtn');
const DEFAULT_SURFACE_MODE = 'deep_surf';

let activeSession = null;
let sessionSetupPromise = null;
let selectionToastTimer = null;
let currentSurfaceMode = DEFAULT_SURFACE_MODE;
let startupGatewayActive = true;
let startupActivationPromise = null;

function setStatusUi(className, text) {
  [statusDot, statusDotMobile].filter(Boolean).forEach((el) => { el.className = className; });
  [healthText, healthTextMobile].filter(Boolean).forEach((el) => { el.textContent = text; });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineFormat(line) {
  line = escapeHtml(line);
  line = line.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  line = line.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  line = line.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return line;
}

function mergeOrderedListDescriptions(text = '') {
  const lines = String(text || '').split('\n');
  const merged = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1] || '';
    const currentIsOrdered = /^\s*\d+\.\s+\S/.test(current);
    const nextIsBullet = /^\s*[-*]\s+\S/.test(next);

    if (currentIsOrdered && nextIsBullet) {
      merged.push(`${current} — ${next.replace(/^\s*[-*]\s+/, '')}`);
      index += 1;
      continue;
    }

    merged.push(current);
  }

  return merged.join('\n');
}

function renderMarkdown(raw) {
  if (!raw) return '';
  const cb = [];
  let text = String(raw).replace(/```([\w.-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    const i = cb.length;
    const label = escapeHtml(lang.trim()) || 'text';
    cb.push(`<div class="code-block"><div class="code-lang">${label}</div><code>${escapeHtml(code.replace(/\n$/, ''))}</code></div>`);
    return `\x00CB${i}\x00`;
  });
  text = mergeOrderedListDescriptions(renumberRepeatedOrderedItems(text));
  const lines = text.split('\n');
  const out = [];
  let inUl = false;
  let inOl = false;
  let para = [];
  const flushParagraph = () => {
    if (!para.length) return;
    out.push(`<p>${para.join('<br>')}</p>`);
    para = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3}) (.+)/);
    const ulMatch = line.match(/^[-*] (.+)/);
    const olMatch = line.match(/^\d+\. (.+)/);
    const isCodeBlock = line.includes('\x00CB');

    if (headingMatch) {
      flushParagraph();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push(`<h${headingMatch[1].length}>${inlineFormat(headingMatch[2])}</h${headingMatch[1].length}>`);
      continue;
    }

    if (ulMatch) {
      flushParagraph();
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    if (olMatch) {
      flushParagraph();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
    if (isCodeBlock) {
      flushParagraph();
      out.push(line);
    } else {
      para.push(inlineFormat(line));
    }
  }

  flushParagraph();
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  let html = out.join('\n');
  html = html.replace(/\x00CB(\d+)\x00/g, (_, i) => cb[Number(i)]);
  return html || `<p>${escapeHtml(raw)}</p>`;
}

function renumberRepeatedOrderedItems(text = '') {
  const lines = String(text || '').split('\n');
  const numberedIndexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*\d+\.\s+\S/.test(lines[index])) numberedIndexes.push(index);
  }
  if (numberedIndexes.length < 2) return String(text || '');

  const numbers = numberedIndexes.map((index) => Number(lines[index].match(/^\s*(\d+)\./)?.[1] || 0));
  const allOne = numbers.every((number) => number === 1);
  const alreadySequential = numbers.every((number, index) => number === index + 1);
  if (!allOne || alreadySequential) return String(text || '');

  numberedIndexes.forEach((lineIndex, itemIndex) => {
    lines[lineIndex] = lines[lineIndex].replace(/^\s*\d+\./, `${itemIndex + 1}.`);
  });
  return lines.join('\n');
}

function normalizeFeatureLikeList(text = '') {
  const lines = String(text || '').split('\n');
  const candidateIndexes = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[-*]\s+/.test(trimmed)) continue;
    if (/^\d+(?:\.0)?\.\s+/.test(trimmed)) {
      candidateIndexes.push(index);
      continue;
    }
    if (/^[\p{L}][\p{L}\s/&()-]{2,42}\s+-\s+\S/u.test(trimmed)) {
      candidateIndexes.push(index);
    }
  }

  if (candidateIndexes.length < 2) {
    return lines.map((line) => line.replace(/^(\s*)\d+\.0\.\s+/, '$1')).join('\n');
  }

  candidateIndexes.forEach((lineIndex, itemIndex) => {
    const trimmed = lines[lineIndex].trim();
    const withoutNumber = trimmed.replace(/^\d+(?:\.0)?\.\s+/, '');
    lines[lineIndex] = `${itemIndex + 1}. ${withoutNumber}`;
  });

  return lines.join('\n');
}

function extractThinkBlocks(raw = '') {
  const text = String(raw || '')
    .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, ' ')
    .replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, ' ')
    .replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, ' ')
    .replace(/<\/?(minimax:tool_call|invoke|parameter)\b[^>]*>/gi, ' ');
  const matches = [...text.matchAll(/<think>([\s\S]*?)<\/think>/gi)];
  const reasoning = matches.map((m) => String(m[1] || '').trim()).filter(Boolean).join('\n\n');
  const content = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\n{3,}/g, '\n\n').trim();
  return { content, reasoning };
}

function extractAnswerSource(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return { content: '', source: '' };

  const match = text.match(/([\s\S]*?)(?:\n{1,2}|\s+)Sumber:\s*([^\n.]+)\.?$/i)
    || text.match(/([\s\S]*?)(?:\n{1,2}|\s+)Source:\s*([^\n.]+)\.?$/i);

  if (!match) return { content: text, source: '' };

  return {
    content: String(match[1] || '').trim(),
    source: normalizeAnswerSource(match[2] || '')
  };
}

function normalizeAnswerSource(source = '') {
  const value = String(source || '').trim();
  if (!value) return '';
  if (/^(google\s+news|google\s+rss|web\s+search|search\s+results?)$/i.test(value)) {
    return 'web';
  }
  return value;
}

function normalizeDisplayAnswer(raw = '') {
  const codeBlocks = [];
  let text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  text = text.replace(/```([\w.-]*)\n([\s\S]*?)```/g, (match) => {
    const key = `\x00DISPLAY_CODE_${codeBlocks.length}\x00`;
    codeBlocks.push(match);
    return key;
  });

  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(\s*)\d+\.0\.\s+/gm, '$1')
    .replace(/\n+\s*(---+|___+|\*\*\*+)\s*\n+/g, '\n$1\n')
    .replace(/:\n{2,}(?=\S)/g, ':\n')
    .replace(/([^\n.!?:;])\n{2,}(?=(?:[-*] |\d+\. ))/g, '$1\n')
    .replace(/\n{2,}((?:[-*] |\d+\. ))/g, '\n$1')
    .replace(/((?:[-*] |\d+\. ).*)\n{2,}(?=(?:[-*] |\d+\. ))/g, '$1\n')
    .replace(/\n{2,}(Sumber:|Source:)/gi, '\n$1')
    .trim();

  text = text.replace(/\x00DISPLAY_CODE_(\d+)\x00/g, (_, index) => codeBlocks[Number(index)] || '');
  return normalizeFeatureLikeList(text);
}

function formatResponseTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 10000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 1000).toFixed(0)} s`;
}

function extractEvidenceLine(content = "") {
  const match = String(content || "").match(/(?:^|\n)Evidence:\s*(.+?)(?:\n|$)/i);
  return match ? match[1].trim() : "";
}

function extractEngineScore(content = "") {
  const match = String(content || "").match(/(?:^|\n)Score:\s*(\d{1,3})(?:\n|$)/i);
  return match ? Number(match[1]) : null;
}

function stripEvidenceAndScore(content = "") {
  return String(content || "")
    .replace(/(?:^|\n)Evidence:\s*.+?(?=\n|$)/gi, "")
    .replace(/(?:^|\n)Score:\s*\d{1,3}(?=\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildAnswerMeta(source = '', responseMs = null, score = null) {
  const items = [];
  if (source) {
    items.push(`<span class="answer-source">Sumber: ${escapeHtml(source)}</span>`);
  }
  const timing = formatResponseTime(responseMs);
  if (timing) {
    items.push(`<span class="answer-time">${escapeHtml(timing)}</span>`);
  }
  if (Number.isFinite(score)) {
    items.push(`<span class="answer-score">score ${escapeHtml(String(score))}</span>`);
  }
  if (!items.length) return '';
  return `<div class="answer-meta">${items.join('<span class="answer-meta-sep">·</span>')}</div>`;
}

function renderAnswerWithSource(raw = '', options = {}) {
  const { responseMs = null } = options;
  const parsed = extractAnswerSource(normalizeDisplayAnswer(raw));
  const evidence = extractEvidenceLine(parsed.content);
  const score = extractEngineScore(parsed.content);
  const cleanContent = stripEvidenceAndScore(parsed.content);
  const answerHtml = cleanContent
    ? renderMarkdown(cleanContent)
    : '';
  const evidenceHtml = evidence ? `<div class="answer-evidence">Evidence: ${escapeHtml(evidence)}</div>` : '';
  const metaHtml = buildAnswerMeta(parsed.source, responseMs, score);

  if (!answerHtml && !evidenceHtml && !metaHtml) {
    return '<div class="answer-block empty">No reply.</div>';
  }

  return `<div class="answer-block${!answerHtml ? ' empty' : ''}">${answerHtml || ''}${evidenceHtml}${metaHtml}</div>`;
}

function renderFriendlyError(target, message, responseMs = null) {
  if (!target) return;
  target.innerHTML = renderAnswerWithSource(message || 'Ada kendala saat memproses chat. Bisa coba kirim ulang?', { responseMs });
}

function customConfirm(msg) {
  return new Promise((resolve) => {
    document.getElementById('confirmMsg').textContent = msg;
    const overlay = document.getElementById('confirmModal');
    overlay.classList.add('open');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    const done = (value) => {
      overlay.classList.remove('open');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onNo);
      resolve(value);
    };
    const onOk = () => done(true);
    const onNo = () => done(false);
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onNo);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(false);
    }, { once: true });
  });
}

function customPrompt(title, def = '') {
  return new Promise((resolve) => {
    document.getElementById('promptTitle').textContent = title;
    const input = document.getElementById('promptInput');
    input.value = def;
    const overlay = document.getElementById('promptModal');
    overlay.classList.add('open');
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    const ok = document.getElementById('promptOk');
    const cancel = document.getElementById('promptCancel');
    const done = (value) => {
      overlay.classList.remove('open');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onNo);
      input.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onOk = () => done(input.value.trim() || null);
    const onNo = () => done(null);
    const onKey = (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onNo();
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onNo);
    input.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) onNo();
    }, { once: true });
  });
}

function setLoadingDialog(open, title = 'Connecting', message = 'Please wait...') {
  if (open) {
    loadingTitle.textContent = title;
    loadingMsg.textContent = message;
    loadingModal.classList.add('open');
    return;
  }
  loadingModal.classList.remove('open');
}

function startDelayedLoading(title, message, delay = 350) {
  let opened = false;
  const timer = setTimeout(() => {
    opened = true;
    setLoadingDialog(true, title, message);
  }, delay);
  return () => {
    clearTimeout(timer);
    if (opened) setLoadingDialog(false);
  };
}

function showSelectionToast(message) {
  if (!message) return;
  selectionToast.textContent = message;
  selectionToast.classList.add('open');
  clearTimeout(selectionToastTimer);
  selectionToastTimer = setTimeout(() => {
    selectionToast.classList.remove('open');
  }, 1800);
}

function formatModelLabel(model = '') {
  const value = String(model || '').trim();
  if (!value) return 'Select model';
  return value.replace(/^[^/]+\//, '');
}

function updateComposerSettingsSummary() {
  if (!composerSettingsValue) return;
  composerSettingsValue.textContent = formatModelLabel(modelSelect.value);
}

function setComposerSettingsOpen(open) {
  if (!composerSettings || !composerSettingsToggle || !composerSettingsPanel) return;
  composerSettings.classList.toggle('open', open);
  composerSettingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  composerSettingsPanel.hidden = !open;
}

async function populateModelSelect(provider, targetSelect, preferredModel = '', options = {}) {
  const {
    showLoading = false,
    loadingTitleText = 'Loading models',
    loadingMessage = 'Trying to fetch available models...'
  } = options;

  if (showLoading) {
    setLoadingDialog(true, loadingTitleText, loadingMessage);
  }

  try {
    const res = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
    const data = await res.json();
    const fallbackModel = provider === 'nvidia' ? 'stepfun-ai/step-3.5-flash' : 'qwen2.5-coder:3b';
    const models = Array.isArray(data.models) && data.models.length ? data.models : [data.defaultModel || fallbackModel];
    targetSelect.innerHTML = '';

    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = formatModelLabel(model);
      if (model === (preferredModel || data.defaultModel)) option.selected = true;
      targetSelect.appendChild(option);
    });

    if (preferredModel && !models.includes(preferredModel)) {
      const option = document.createElement('option');
      option.value = preferredModel;
      option.textContent = formatModelLabel(preferredModel);
      option.selected = true;
      targetSelect.appendChild(option);
    }
  } catch {
    const fallbackModel = provider === 'nvidia' ? 'stepfun-ai/step-3.5-flash' : 'qwen2.5-coder:3b';
    targetSelect.innerHTML = `<option value="${fallbackModel}">${formatModelLabel(fallbackModel)}</option>`;
    if (preferredModel && preferredModel !== fallbackModel) {
      const option = document.createElement('option');
      option.value = preferredModel;
      option.textContent = formatModelLabel(preferredModel);
      option.selected = true;
      targetSelect.appendChild(option);
    } else {
      targetSelect.value = preferredModel || fallbackModel;
    }
  } finally {
    if (targetSelect === modelSelect) updateComposerSettingsSummary();
    if (showLoading) {
      setLoadingDialog(false);
    }
  }
}

function customSessionSetup({ allowCancel = true } = {}) {
  if (sessionSetupPromise) return sessionSetupPromise;

  sessionSetupPromise = new Promise((resolve) => {
    modeSelect.value = 'medium';
    sessionSetupProvider.value = providerSelect.value || 'ollama';
    sessionSetupCancel.style.display = allowCancel ? '' : 'none';
    sessionSetupStatus.textContent = '';
    sessionSetupModal.classList.add('open');

    let settled = false;

    const cleanup = () => {
      sessionSetupModal.classList.remove('open');
      sessionSetupProvider.removeEventListener('change', onProviderChange);
      sessionSetupOk.removeEventListener('click', onOk);
      sessionSetupCancel.removeEventListener('click', onCancel);
      sessionSetupModal.removeEventListener('click', onOverlayClick);
      sessionSetupPromise = null;
    };

    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const onProviderChange = async () => {
      sessionSetupStatus.textContent = 'Loading models...';
      await populateModelSelect(sessionSetupProvider.value, sessionSetupModel, '', {
        showLoading: true,
        loadingTitleText: 'Loading models',
        loadingMessage: `Fetching models for ${sessionSetupProvider.value}...`
      });
      sessionSetupStatus.textContent = '';
    };

    const onCancel = () => finish(null);
    const onOverlayClick = (e) => {
      if (allowCancel && e.target === sessionSetupModal) onCancel();
    };

    const onOk = async () => {
      sessionSetupOk.disabled = true;
      sessionSetupCancel.disabled = true;
      sessionSetupProvider.disabled = true;
      sessionSetupModel.disabled = true;
      sessionSetupOk.textContent = 'Connecting...';
      sessionSetupStatus.textContent = 'Trying to connect...';
      setLoadingDialog(true, 'Trying to connect', 'Creating chat session and preparing the selected model...');
      modeSelect.value = 'medium';
      providerSelect.value = sessionSetupProvider.value;
      await loadModels(sessionSetupModel.value);
      modelSelect.value = sessionSetupModel.value;
      try {
        await createSession({
          provider: sessionSetupProvider.value,
          model: sessionSetupModel.value,
          silentLoading: true
        });
        finish({ provider: sessionSetupProvider.value, model: sessionSetupModel.value });
      } finally {
        setLoadingDialog(false);
        sessionSetupOk.disabled = false;
        sessionSetupCancel.disabled = false;
        sessionSetupProvider.disabled = false;
        sessionSetupModel.disabled = false;
        sessionSetupOk.textContent = 'OK';
        sessionSetupStatus.textContent = '';
      }
    };

    sessionSetupProvider.addEventListener('change', onProviderChange);
    sessionSetupOk.addEventListener('click', onOk);
    sessionSetupCancel.addEventListener('click', onCancel);
    sessionSetupModal.addEventListener('click', onOverlayClick);

    sessionSetupStatus.textContent = 'Loading models...';
    populateModelSelect(sessionSetupProvider.value, sessionSetupModel, modelSelect.value || '', {
      showLoading: true,
      loadingTitleText: 'Loading models',
      loadingMessage: `Fetching models for ${sessionSetupProvider.value}...`
    }).then(() => {
      sessionSetupStatus.textContent = '';
      sessionSetupModel.focus();
    });
  });

  return sessionSetupPromise;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    msgsScroll.scrollTo({ top: msgsScroll.scrollHeight, behavior: 'smooth' });
  });
}

function formatSurfaceMode(mode) {
  return mode === 'deep_surf' ? 'Deep Search Beta' : 'Local Mode';
}

async function persistSurfaceMode(mode) {
  if (!activeSession?.id || !activeSession?.token) return;
  const res = await fetch(`/api/sessions/${encodeURIComponent(activeSession.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: activeSession.token, surfaceMode: mode })
  });
  const data = await res.json();
  if (data.ok) {
    activeSession = data.session;
    await refreshSessionList();
  }
}

function applySurfaceMode(mode = 'local', options = {}) {
  currentSurfaceMode = mode === 'deep_surf' ? 'deep_surf' : 'local';
  if (surfaceModeSelect) surfaceModeSelect.value = currentSurfaceMode;
  if (activeSession) {
    activeSession.surfaceMode = currentSurfaceMode;
  }
  if (!options.silent) {
    showSelectionToast(`Mode set to ${formatSurfaceMode(currentSurfaceMode)}.`);
  }
}

function applyTheme(theme = 'light', options = {}) {
  const resolvedTheme = theme === 'night' ? 'night' : 'light';
  body.classList.toggle('theme-night', resolvedTheme === 'night');
  themeLightBtn?.classList.toggle('active', resolvedTheme === 'light');
  themeNightBtn?.classList.toggle('active', resolvedTheme === 'night');
  localStorage.setItem(THEME_KEY, resolvedTheme);
  if (!options.silent) {
    showSelectionToast(`Theme set to ${resolvedTheme === 'night' ? 'Night Mode' : 'Light Mode'}.`);
  }
}

function loadStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'light';
  } catch {
    return 'light';
  }
}

function saveActiveSession() {
  if (activeSession?.id && activeSession?.token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId: activeSession.id, token: activeSession.token }));
  }
}

function loadStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

async function closeStoredStreamOnStartup() {
  const stored = loadStoredSession();
  if (!stored?.sessionId || !stored?.token) return;
  try {
    await fetch('/api/streams/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stored)
    });
  } catch {}
}

function toggleSidebar(force) {
  if (window.innerWidth <= 780) {
    body.classList.toggle('sidebar-open', force ?? !body.classList.contains('sidebar-open'));
    return;
  }
  body.classList.toggle('sidebar-collapsed', force ?? !body.classList.contains('sidebar-collapsed'));
  syncCollapsedNewBtn();
}

function syncCollapsedNewBtn() {
  const collapsed = body.classList.contains('sidebar-collapsed');
  document.getElementById('newChatBtn').style.display = collapsed ? 'none' : '';
  document.getElementById('newChatBtnCollapsed').style.display = collapsed ? '' : 'none';
}

function renderAssistantMessage(content = '', reasoning = '', responseMs = null) {
  const parsed = extractThinkBlocks(content);
  const mergedReasoning = [reasoning, parsed.reasoning].filter(Boolean).join('\n\n').trim();
  const safeReasoning = mergedReasoning
    ? `<div class="reasoning-block"><div class="reasoning-label">Thinking</div><div class="reasoning-text">${escapeHtml(mergedReasoning)}</div></div>`
    : '';
  const safeAnswer = parsed.content
    ? renderAnswerWithSource(parsed.content, { responseMs })
    : (mergedReasoning ? '' : '<div class="answer-block empty">No reply.</div>');
  return `${safeReasoning}${safeAnswer}`;
}

function addMessage(role, message) {
  const item = document.createElement('div');
  item.className = `msg ${role}`;
  const content = typeof message === 'string' ? message : String(message?.content || '');
  const reasoning = role === 'assistant' ? String(message?.reasoning || '') : '';
  const responseMs = role === 'assistant' ? message?.responseMs : null;
  const safe = role === 'assistant' ? renderAssistantMessage(content, reasoning, responseMs) : escapeHtml(content);
  item.innerHTML = `<div class="msg-who">${role === 'user' ? 'You' : 'Worm'}</div><div class="msg-body">${safe}</div>`;
  messagesEl.appendChild(item);
  requestAnimationFrame(() => scrollToBottom());
  return item;
}

function renderMessages(session) {
  messagesEl.innerHTML = '';
  const list = Array.isArray(session?.messages) && session.messages.length ? session.messages : [];
  list.forEach((message) => addMessage(message.role, message));
}

let openDropdown = null;

function closeDropdown() {
  if (openDropdown) {
    openDropdown.el.remove();
    openDropdown.item.classList.remove('menu-open');
    openDropdown = null;
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.chat-dropdown') && !e.target.closest('.chat-menu-btn')) closeDropdown();
});

function showChatDropdown(btn, item, session) {
  closeDropdown();
  item.classList.add('menu-open');
  const dropdown = document.createElement('div');
  dropdown.className = 'chat-dropdown';
  dropdown.innerHTML = `
    <div class="dd-item" data-a="rename">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
      Rename
    </div>
    <div class="dd-item danger" data-a="delete">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/></svg>
      Delete
    </div>`;

  const rect = btn.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 5}px`;
  dropdown.style.left = `${Math.max(4, rect.right - 148)}px`;
  dropdown.querySelectorAll('.dd-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      if (el.dataset.a === 'rename') renameSession(session.id);
      if (el.dataset.a === 'delete') deleteSession(session.id);
    });
  });
  document.body.appendChild(dropdown);
  openDropdown = { el: dropdown, item };
}

function renderSessionList(sessions) {
  chatList.innerHTML = '';
  sessions.forEach((session) => {
    const item = document.createElement('div');
    item.className = `chat-item${activeSession?.id === session.id ? ' active' : ''}`;
    item.dataset.sessionId = session.id;
    item.dataset.token = session.token || '';
    item.title = session.title || 'Chat';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = (session.title || 'C').trim()[0].toUpperCase();
    avatar.addEventListener('click', () => {
      closeDropdown();
      loadSession(session.id);
    });

    const info = document.createElement('div');
    info.className = 'chat-info';
    info.innerHTML = `<div class="chat-t">${escapeHtml(session.title || 'Chat')}</div><div class="chat-p">${escapeHtml(session.preview || '\u2014')}</div>`;
    info.addEventListener('click', () => {
      closeDropdown();
      loadSession(session.id);
    });

    const menuBtn = document.createElement('button');
    menuBtn.className = 'chat-menu-btn';
    menuBtn.title = 'Options';
    menuBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12" cy="8" r="1.3"/></svg>`;
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showChatDropdown(menuBtn, item, session);
    });

    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(menuBtn);
    chatList.appendChild(item);
  });
}

async function refreshSessionList() {
  const res = await fetch('/api/sessions');
  const data = await res.json();
  renderSessionList(data.sessions || []);
  return data;
}

function clearActiveSession() {
  activeSession = null;
  modeSelect.value = 'medium';
  applySurfaceMode(DEFAULT_SURFACE_MODE, { silent: true });
  localStorage.removeItem(SESSION_KEY);
  renderMessages(null);
  scrollToBottom();
}

async function syncSessionControls(session) {
  workspaceSelect.value = session?.workspace || 'Home';
  providerSelect.value = session?.provider || 'ollama';
  workspaceTitleSide.textContent = session?.workspace || 'Home';
  applySurfaceMode(session?.surfaceMode || currentSurfaceMode || DEFAULT_SURFACE_MODE, { silent: true });
  if (session?.model && ![...modelSelect.options].some((option) => option.value === session.model)) {
    const option = document.createElement('option');
    option.value = session.model;
    option.textContent = formatModelLabel(session.model);
    modelSelect.appendChild(option);
  }
  if (session?.model) modelSelect.value = session.model;
  updateComposerSettingsSummary();
}

function refreshSessionControlsBackground(session) {
  loadModels(session?.model || '')
    .catch(() => {})
    .finally(() => loadHealth());
}

async function createSession(options = {}) {
  const stopLoading = options.silentLoading
    ? () => {}
    : startDelayedLoading('Creating chat', 'Preparing a new session...');
  const workspace = options.workspace || workspaceSelect.value;
  const provider = options.provider || providerSelect.value;
  const model = options.model || modelSelect.value || undefined;
  const surfaceMode = options.surfaceMode || currentSurfaceMode;
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace, provider, model, surfaceMode })
    });
    const data = await res.json();
    activeSession = data.session;
    syncSessionControls(activeSession);
    saveActiveSession();
    renderMessages(activeSession);
    scrollToBottom();
    refreshSessionControlsBackground(activeSession);
    refreshSessionList();
  } finally {
    stopLoading();
  }
}

async function loadSession(sessionId) {
  if (activeSession?.id !== sessionId) abortActiveStream();
  const stopLoading = startDelayedLoading('Loading chat', 'Restoring session from backend...');
  const stored = loadStoredSession();
  const el = [...chatList.children].find((entry) => entry.dataset.sessionId === sessionId);
  const token = activeSession?.id === sessionId
    ? activeSession.token
    : (el?.dataset?.token || stored?.token || '');
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!data.ok) return;
    activeSession = data.session;
    syncSessionControls(activeSession);
    saveActiveSession();
    renderMessages(activeSession);
    scrollToBottom();
    refreshSessionControlsBackground(activeSession);
    refreshSessionList();
  } finally {
    stopLoading();
  }
}

async function renameSession(sessionId) {
  const target = activeSession?.id === sessionId ? activeSession : null;
  const el = [...chatList.children].find((entry) => entry.dataset.sessionId === sessionId);
  const token = target?.token || el?.dataset?.token || loadStoredSession()?.token;
  const currentTitle = target?.title || el?.querySelector('.chat-t')?.textContent || 'Chat';
  const nextTitle = await customPrompt('Rename chat', currentTitle);
  if (!nextTitle?.trim()) return;
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, title: nextTitle.trim() })
  });
  const data = await res.json();
  if (!data.ok) return;
  if (activeSession?.id === sessionId) activeSession = data.session;
  await refreshSessionList();
}

async function deleteSession(sessionId) {
  if (!await customConfirm('Delete this chat?')) return;
  if (activeSession?.id === sessionId) abortActiveStream();
  const target = activeSession?.id === sessionId ? activeSession : null;
  const el = [...chatList.children].find((entry) => entry.dataset.sessionId === sessionId);
  const token = target?.token || el?.dataset?.token || loadStoredSession()?.token;
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token || '')}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) return;
  if (activeSession?.id === sessionId) clearActiveSession();
  const sessionsData = await refreshSessionList();
  if (!sessionsData.sessions?.length) {
    await customSessionSetup();
  }
}

async function bootstrapSession() {
  const stopLoading = startDelayedLoading('Continuing session', 'Checking saved session...');
  const sessionsData = await refreshSessionList();
  const stored = loadStoredSession();
  try {
    if (stored?.sessionId && stored?.token) {
      const res = await fetch('/api/sessions/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stored)
      });
      const data = await res.json();
      if (data.ok) {
        activeSession = data.session;
        syncSessionControls(activeSession);
        renderMessages(activeSession);
        refreshSessionControlsBackground(activeSession);
        return;
      }
      localStorage.removeItem(SESSION_KEY);
    }
    const lastSessionId = sessionsData.lastActiveSessionId || sessionsData.sessions?.[0]?.id;
    if (lastSessionId) {
      stopLoading();
      await loadSession(lastSessionId);
      return;
    }
    clearActiveSession();
    await customSessionSetup();
  } finally {
    stopLoading();
  }
}

function enterStartupGateway() {
  startupGatewayActive = true;
  activeSession = null;
  abortActiveStream();
  closeStoredStreamOnStartup();
  setStatusUi('status-dot idle', 'Idle');
}

async function activateStartupGateway() {
  if (!startupGatewayActive && !startupActivationPromise) return;
  if (!startupActivationPromise) {
    startupGatewayActive = false;
    const stopLoading = startDelayedLoading('Starting Worm', 'Preparing controls and sessions...', 500);
    startupActivationPromise = (async () => {
      await Promise.allSettled([
        refreshSessionList(),
        loadHealth(),
        loadModels()
      ]);
    })().finally(() => {
      stopLoading();
      startupActivationPromise = null;
    });
  }
  await startupActivationPromise;
}

function formatProviderLabel(provider) {
  return provider === 'nvidia' ? 'NVIDIA' : 'Ollama';
}

function buildRunLabel(provider, model, mode) {
  if (currentSurfaceMode === 'deep_surf') {
    return ['Deep Search Beta', 'web'].join(' · ');
  }
  const parts = [formatSurfaceMode(currentSurfaceMode), formatProviderLabel(provider)];
  if (model) parts.push(model);
  if (mode) parts.push(`Think ${String(mode).replace(/^./, (c) => c.toUpperCase())}`);
  return parts.join(' · ');
}

async function loadHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const selectedProvider = providerSelect.value || activeSession?.provider || 'ollama';
    const selectedState = Array.isArray(data.providers)
      ? data.providers.find((provider) => provider.id === selectedProvider)
      : null;
    if (selectedState?.ok) {
      setStatusUi('status-dot', `${formatProviderLabel(selectedProvider)} ready`);
    } else if (data.ok) {
      setStatusUi('status-dot idle', `${formatProviderLabel(selectedProvider)} unavailable`);
    } else {
      setStatusUi('status-dot err', `${formatProviderLabel(selectedProvider)} error`);
    }
  } catch {
    setStatusUi('status-dot err', 'Offline');
  }
}

async function loadModels(preferredModel = '') {
  await populateModelSelect(providerSelect.value, modelSelect, preferredModel);
}

const ICON_SEND = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="12" x2="7" y2="2"/><polyline points="3,6 7,2 11,6"/></svg>`;
const ICON_STOP = `<svg viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1"/></svg>`;
let isStreaming = false;
let abortCtrl = null;

function abortActiveStream() {
  if (!abortCtrl) return;
  abortCtrl.abort();
}

function stopActiveStreamForControlChange(message = 'Stream dihentikan karena pengaturan diganti.') {
  if (!isStreaming || !abortCtrl) return false;
  abortActiveStream();
  showSelectionToast(message);
  return true;
}

function setSendState(streaming) {
  isStreaming = streaming;
  if (streaming) {
    sendBtn.innerHTML = ICON_STOP;
    sendBtn.classList.add('stop');
    sendBtn.title = 'Stop';
    return;
  }
  sendBtn.innerHTML = ICON_SEND;
  sendBtn.classList.remove('stop');
  sendBtn.title = 'Send (Enter)';
}

async function sendMessage() {
  if (isStreaming) return;
  const message = messageInput.value.trim();
  if (!message) return;
  await activateStartupGateway();
  if (!activeSession?.id || !activeSession?.token) {
    await bootstrapSession();
    if (!activeSession?.id || !activeSession?.token) return;
  }
  const model = modelSelect.value;
  const mode = modeSelect.value;

  addMessage('user', message);
  messageInput.value = '';
  messageInput.style.height = 'auto';

  const pending = document.createElement('div');
  pending.className = 'msg assistant';
  pending.innerHTML = `<div class="msg-who">Worm</div><div class="msg-body"><div class="msg-meta">Using ${escapeHtml(buildRunLabel(providerSelect.value, model, mode))}</div><div class="reasoning-block" style="display:none"><div class="reasoning-label">Thinking</div><div class="reasoning-text"></div></div><div class="answer-block"><span class="thinking"><span class="td"></span><span class="td"></span><span class="td"></span></span></div></div>`;
  messagesEl.appendChild(pending);
  scrollToBottom();
  const pendingBody = pending.querySelector('.msg-body');
  const pendingMeta = pending.querySelector('.msg-meta');
  const runLabel = buildRunLabel(providerSelect.value, model, mode);
  const requestStartedAt = performance.now();
  const pendingTimer = setInterval(() => {
    if (!pendingMeta) return;
    pendingMeta.textContent = `Using ${runLabel} · ${formatResponseTime(performance.now() - requestStartedAt)}`;
  }, 120);

  abortCtrl = new AbortController();
  setSendState(true);

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortCtrl.signal,
      body: JSON.stringify({
        message,
        model,
        mode,
        provider: providerSelect.value,
        workspace: workspaceSelect.value,
        surfaceMode: activeSession?.surfaceMode || currentSurfaceMode,
        sessionId: activeSession.id,
        token: activeSession.token
      })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let fullReasoning = '';
    let rawText = '';
    const reasoningBox = pendingBody.querySelector('.reasoning-block');
    const reasoningText = pendingBody.querySelector('.reasoning-text');
    const answerBox = pendingBody.querySelector('.answer-block');

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6));

        if (payload.sessionId && payload.sessionToken && !payload.done && !payload.error) {
          activeSession = {
            ...(activeSession || {}),
            id: payload.sessionId,
            token: payload.sessionToken,
            workspace: workspaceSelect.value,
            provider: providerSelect.value,
            model,
            surfaceMode: activeSession?.surfaceMode || currentSurfaceMode
          };
          saveActiveSession();
          continue;
        }

        if (payload.error) {
          if (payload.sessionId && payload.sessionToken) {
            activeSession = {
              ...(activeSession || {}),
              id: payload.sessionId,
              token: payload.sessionToken,
              workspace: workspaceSelect.value,
              provider: providerSelect.value,
              model,
              surfaceMode: activeSession?.surfaceMode || currentSurfaceMode
            };
            saveActiveSession();
          }
          renderFriendlyError(pendingBody, payload.error, performance.now() - requestStartedAt);
          return;
        }

        if (typeof payload.reasoning === 'string') {
          fullReasoning += payload.reasoning;
          if (reasoningBox) reasoningBox.style.display = 'block';
          if (reasoningText) reasoningText.textContent = fullReasoning;
          scrollToBottom();
        }

        if (typeof payload.token === 'string') {
          rawText += payload.token;
          const parsed = extractThinkBlocks(rawText);
          fullText = parsed.content;
          const mergedReasoning = [fullReasoning, parsed.reasoning].filter(Boolean).join('\n\n').trim();
          if (reasoningBox) reasoningBox.style.display = mergedReasoning ? 'block' : 'none';
          if (reasoningText) reasoningText.textContent = mergedReasoning;
          if (answerBox) answerBox.innerHTML = renderAnswerWithSource(fullText).replace(/^<div class="answer-block(?: empty)?">|<\/div>$/g, '');
          else pendingBody.textContent = fullText;
          scrollToBottom();
        }

        if (payload.done) {
          if (typeof payload.content === 'string' && payload.content.trim()) {
            rawText = payload.content;
            const parsed = extractThinkBlocks(rawText);
            fullText = parsed.content;
            const doneReasoning = fullReasoning || payload.reasoning || '';
            const mergedReasoning = [doneReasoning, parsed.reasoning].filter(Boolean).join('\n\n').trim();
            if (reasoningBox) reasoningBox.style.display = mergedReasoning ? 'block' : 'none';
            if (reasoningText) reasoningText.textContent = mergedReasoning;
            if (answerBox) answerBox.innerHTML = renderAnswerWithSource(fullText).replace(/^<div class="answer-block(?: empty)?">|<\/div>$/g, '');
            else pendingBody.textContent = fullText;
          }
          if (pendingMeta) {
            pendingMeta.textContent = `Using ${runLabel} · ${formatResponseTime(payload.responseMs ?? (performance.now() - requestStartedAt))}`;
          }
          await loadSession(payload.sessionId || activeSession.id);
        }
      }
    }

    if (!fullText.trim() && !fullReasoning.trim()) {
      if (answerBox) answerBox.textContent = 'No reply';
      else pendingBody.textContent = 'No reply';
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      renderFriendlyError(pendingBody, 'Dihentikan.', performance.now() - requestStartedAt);
    } else {
      renderFriendlyError(pendingBody, 'Ada kendala saat mengirim chat. Bisa coba kirim ulang?', performance.now() - requestStartedAt);
    }
  } finally {
    clearInterval(pendingTimer);
    setSendState(false);
    abortCtrl = null;
  }
}

async function handleNewChatRequest() {
  await activateStartupGateway();
  const sessionsData = await refreshSessionList();
  if (!sessionsData.sessions?.length) {
    await customSessionSetup();
    return;
  }
  await createSession();
}

document.getElementById('collapseBtn').addEventListener('click', () => toggleSidebar());
document.getElementById('mobileMenuBtn').addEventListener('click', () => toggleSidebar(true));
sidebarScrim?.addEventListener('click', () => toggleSidebar(false));
document.getElementById('newChatBtn').addEventListener('click', handleNewChatRequest);
document.getElementById('newChatBtnCollapsed').addEventListener('click', handleNewChatRequest);
themeLightBtn?.addEventListener('click', () => applyTheme('light'));
themeNightBtn?.addEventListener('click', () => applyTheme('night'));
surfaceModeSelect.addEventListener('change', async () => {
  stopActiveStreamForControlChange('Stream dihentikan karena mode diganti.');
  await activateStartupGateway();
  applySurfaceMode(surfaceModeSelect.value);
  await persistSurfaceMode(surfaceModeSelect.value);
});
sendBtn.addEventListener('click', () => {
  if (isStreaming && abortCtrl) abortCtrl.abort();
  else sendMessage();
});

workspaceSelect.addEventListener('change', () => {
  workspaceTitleSide.textContent = workspaceSelect.value;
});

providerSelect.addEventListener('change', async () => {
  stopActiveStreamForControlChange('Stream dihentikan karena provider diganti.');
  updateComposerSettingsSummary();
  await activateStartupGateway();
  await loadModels();
  setStatusUi('status-dot idle', `Checking ${formatProviderLabel(providerSelect.value)}...`);
  showSelectionToast(`Provider set to ${formatProviderLabel(providerSelect.value)}.`);
  setTimeout(() => loadHealth(), 300);
});

modelSelect.addEventListener('change', () => {
  if (!modelSelect.value) return;
  updateComposerSettingsSummary();
  stopActiveStreamForControlChange('Stream dihentikan karena model diganti.');
  showSelectionToast(`Model set to ${formatModelLabel(modelSelect.value)}.`);
});

modeSelect.addEventListener('change', () => {
  stopActiveStreamForControlChange('Stream dihentikan karena think level diganti.');
});

composerSettingsToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  setComposerSettingsOpen(composerSettingsPanel.hidden);
});

composerSettingsPanel?.addEventListener('click', (e) => {
  e.stopPropagation();
});

document.addEventListener('pointerdown', (e) => {
  if (!composerSettings?.contains(e.target)) setComposerSettingsOpen(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setComposerSettingsOpen(false);
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener('input', () => {
  activateStartupGateway();
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
});

syncCollapsedNewBtn();
updateComposerSettingsSummary();
applyTheme(loadStoredTheme(), { silent: true });
applySurfaceMode(DEFAULT_SURFACE_MODE, { silent: true });
enterStartupGateway();
window.addEventListener('pointerdown', () => activateStartupGateway(), { once: true, capture: true });
window.addEventListener('keydown', () => activateStartupGateway(), { once: true, capture: true });
window.addEventListener('resize', () => {
  if (window.innerWidth > 780) body.classList.remove('sidebar-open');
});
