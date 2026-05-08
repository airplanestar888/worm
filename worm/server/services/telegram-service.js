const fs = require("fs");
const path = require("path");
const https = require("https");
const axios = require("axios");

const {
  DATA_DIR,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_INCLUDE_REASONING,
  TELEGRAM_MODE,
  TELEGRAM_MODEL,
  TELEGRAM_PROVIDER,
  TELEGRAM_SURFACE_MODE
} = require("../config");
const { describeError } = require("../utils/errors");
const { defaultModelFor, getProviderModels, isProviderConfigured } = require("./provider-service");
const { generateAssistantReply } = require("./chat-service");
const {
  verifySession,
  createSession,
  writeSession,
  updateSessionIndex
} = require("../store/session-store");

const TELEGRAM_INDEX_FILE = path.join(DATA_DIR, "..", "telegram-sessions.json");
const TELEGRAM_LOCK_FILE = path.join(DATA_DIR, "..", "telegram-bot.lock");
const TELEGRAM_STATUS_FILE = path.join(DATA_DIR, "..", "telegram-polling-status.json");
const telegramHttpsAgent = new https.Agent({ keepAlive: false });

function telegramApiUrl(method) {
  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

function ensureTelegramIndex() {
  fs.mkdirSync(path.dirname(TELEGRAM_INDEX_FILE), { recursive: true });
  if (!fs.existsSync(TELEGRAM_INDEX_FILE)) {
    fs.writeFileSync(TELEGRAM_INDEX_FILE, JSON.stringify({ chats: {} }, null, 2));
  }
}

function readTelegramIndex() {
  ensureTelegramIndex();
  return JSON.parse(fs.readFileSync(TELEGRAM_INDEX_FILE, "utf8"));
}

function writeTelegramIndex(index) {
  ensureTelegramIndex();
  fs.writeFileSync(TELEGRAM_INDEX_FILE, JSON.stringify(index, null, 2));
}

function writeTelegramPollingStatus(status = {}) {
  try {
    fs.mkdirSync(path.dirname(TELEGRAM_STATUS_FILE), { recursive: true });
    const previous = fs.existsSync(TELEGRAM_STATUS_FILE)
      ? JSON.parse(fs.readFileSync(TELEGRAM_STATUS_FILE, "utf8"))
      : {};
    fs.writeFileSync(TELEGRAM_STATUS_FILE, JSON.stringify({
      ...previous,
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      ...status
    }, null, 2));
  } catch (_err) {}
}

function isProcessAlive(pid) {
  const value = Number(pid);
  if (!Number.isFinite(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireTelegramPollingLock() {
  fs.mkdirSync(path.dirname(TELEGRAM_LOCK_FILE), { recursive: true });

  if (fs.existsSync(TELEGRAM_LOCK_FILE)) {
    const existingPid = Number(fs.readFileSync(TELEGRAM_LOCK_FILE, "utf8").trim());
    if (existingPid && existingPid !== process.pid && isProcessAlive(existingPid)) {
      console.warn(`telegram bot polling skipped; another Worm process is active (pid ${existingPid})`);
      return null;
    }
  }

  fs.writeFileSync(TELEGRAM_LOCK_FILE, String(process.pid));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const currentPid = fs.existsSync(TELEGRAM_LOCK_FILE)
        ? Number(fs.readFileSync(TELEGRAM_LOCK_FILE, "utf8").trim())
        : 0;
      if (currentPid === process.pid) fs.unlinkSync(TELEGRAM_LOCK_FILE);
    } catch (_err) {}
  };
}

function resolveTelegramProvider() {
  return TELEGRAM_PROVIDER === "nvidia" ? "nvidia" : "ollama";
}

function providerLabelToKey(label = "") {
  const text = String(label || "").trim().toLowerCase();
  if (text === "cloud") return "nvidia";
  if (text === "local") return "ollama";
  return "";
}

function providerKeyToLabel(provider = "") {
  return provider === "nvidia" ? "Cloud" : "Local";
}

function resolveTelegramModel(provider) {
  return TELEGRAM_MODEL || defaultModelFor(provider);
}

function getTelegramChatRecord(chatId) {
  const index = readTelegramIndex();
  const key = String(chatId);
  return {
    index,
    key,
    record: index.chats[key] || {}
  };
}

function updateTelegramChatRecord(chatId, updater) {
  const { index, key, record } = getTelegramChatRecord(chatId);
  index.chats[key] = updater({ ...record }) || record;
  writeTelegramIndex(index);
  return index.chats[key];
}

function setTelegramSession(chatId, session) {
  updateTelegramChatRecord(chatId, () => ({
    sessionId: session.id,
    token: session.token,
    updatedAt: new Date().toISOString()
  }));
}

function clearTelegramSession(chatId) {
  updateTelegramChatRecord(chatId, (record) => {
    delete record.sessionId;
    delete record.token;
    delete record.provider;
    delete record.model;
    record.updatedAt = new Date().toISOString();
    return record;
  });
}

function getTelegramSession(chatId) {
  const { key, record: saved } = getTelegramChatRecord(chatId);
  let session = saved ? verifySession(saved.sessionId, saved.token) : null;

  if (!session) {
    const provider = resolveTelegramProvider();
    session = createSession({
      workspace: "Telegram",
      provider,
      model: resolveTelegramModel(provider),
      surfaceMode: TELEGRAM_SURFACE_MODE
    });
    session.title = `Telegram ${key}`;
    writeSession(session);
    updateSessionIndex(session);
  }

  setTelegramSession(chatId, session);
  return session;
}

function updateTelegramSessionRuntime(chatId, changes = {}) {
  const session = getTelegramSession(chatId);
  const provider = changes.provider || session.provider;
  const model = changes.model || (changes.provider ? defaultModelFor(provider) : session.model);
  session.provider = provider;
  session.model = model;
  session.updatedAt = new Date().toISOString();
  writeSession(session);
  updateSessionIndex(session);
  setTelegramSession(chatId, session);
  return session;
}

async function telegramPost(method, data) {
  const res = await axios.post(telegramApiUrl(method), data, {
    timeout: 30000,
    httpsAgent: telegramHttpsAgent,
    proxy: false
  });
  return res.data;
}

async function sendTelegramMessage(chatId, text, options = {}) {
  const chunks = splitTelegramText(sanitizeTelegramOutgoingText(text || "No reply."));
  for (let i = 0; i < chunks.length; i += 1) {
    const isLast = i === chunks.length - 1;
    const payload = {
      chat_id: chatId,
      text: chunks[i],
      disable_web_page_preview: true
    };
    if (isLast && options.removeKeyboard) {
      payload.reply_markup = { remove_keyboard: true };
    }
    await telegramPost("sendMessage", payload);
  }
}

async function sendTelegramMenu(chatId, text, keyboardRows = []) {
  await telegramPost("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: {
      keyboard: keyboardRows.map((row) => row.map((label) => ({ text: label }))),
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

async function sendTyping(chatId) {
  try {
    await telegramPost("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch (_err) {}
}

function startTypingKeepalive(chatId, options = {}) {
  const intervalMs = Math.max(3000, Number(options.intervalMs || 4500));
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    await sendTyping(chatId);
  };

  tick();
  timer = setInterval(() => {
    tick();
  }, intervalMs);

  return () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function splitTelegramText(text) {
  const value = String(text || "");
  if (value.length <= 3900) return [value];
  const chunks = [];
  let rest = value;
  while (rest.length > 3900) {
    const cut = Math.max(rest.lastIndexOf("\n", 3900), rest.lastIndexOf(" ", 3900), 3000);
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function buildTelegramReply(reply) {
  const content = String(reply?.content || "").trim() || "No reply.";
  const reasoning = String(reply?.reasoning || "").trim();
  if (isInternalProviderErrorText(content)) {
    return "Ada kendala saat memproses pesan. Bisa coba kirim ulang?";
  }
  const safeReasoning = isInternalProviderErrorText(reasoning) ? "" : reasoning;
  if (!TELEGRAM_INCLUDE_REASONING || !safeReasoning) return content;
  return [`Thinking:\n${safeReasoning}`, content].join("\n\n---\n\n");
}

function isInternalProviderErrorText(text = "") {
  return /LLM request failed|provider rejected the request schema|tool payload|status code 400|status code 422/i.test(String(text || ""));
}

function sanitizeTelegramOutgoingText(text = "") {
  const value = String(text || "").trim();
  if (isInternalProviderErrorText(value)) {
    return "Ada kendala saat memproses pesan. Bisa coba kirim ulang?";
  }
  return value || "No reply.";
}

async function sendProviderMenu(chatId) {
  const { provider, model } = getTelegramSession(chatId);
  await sendTelegramMenu(
    chatId,
    `Provider aktif: ${providerKeyToLabel(provider)}\nModel aktif: ${model}\n\nPilih provider:`,
    [["Local", "Cloud"]]
  );
}

async function sendModelMenu(chatId) {
  const { provider, model } = getTelegramSession(chatId);
  if (!isProviderConfigured(provider)) {
    await sendTelegramMessage(chatId, `Provider ${providerKeyToLabel(provider)} belum siap.`);
    return;
  }

  const models = await getProviderModels(provider).catch(() => []);
  const available = models.length ? models : [defaultModelFor(provider)];
  const rows = [];
  for (let i = 0; i < available.length; i += 2) {
    rows.push(available.slice(i, i + 2));
  }
  await sendTelegramMenu(
    chatId,
    `Provider: ${providerKeyToLabel(provider)}\nModel aktif: ${model}\n\nPilih model:`,
    rows.slice(0, 12)
  );
}

async function tryHandleTelegramProviderSelection(chatId, text) {
  const provider = providerLabelToKey(text);
  if (!provider) return false;
  const model = defaultModelFor(provider);
  updateTelegramSessionRuntime(chatId, { provider, model });
  await sendTelegramMessage(chatId, `Sip, provider Telegram sekarang ${providerKeyToLabel(provider)}. Model default: ${model}.`, { removeKeyboard: true });
  await sendModelMenu(chatId);
  return true;
}

async function tryHandleTelegramModelSelection(chatId, text) {
  const value = String(text || "").trim();
  if (!value || value.startsWith("/")) return false;
  const { provider } = getTelegramSession(chatId);
  const models = await getProviderModels(provider).catch(() => []);
  const available = new Set((models.length ? models : [defaultModelFor(provider)]).map((item) => String(item).trim()));
  if (!available.has(value)) return false;
  updateTelegramSessionRuntime(chatId, { model: value });
  await sendTelegramMessage(chatId, `Oke, model Telegram sekarang ${value} (${providerKeyToLabel(provider)}).`, { removeKeyboard: true });
  return true;
}

async function handleTelegramMessage(message) {
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!chatId || !text) return;

  if (text === "/start") {
    await sendTelegramMessage(chatId, "Halo, saya Worm. Kirim pesan apa saja, nanti saya jawab lewat mode Telegram.", { removeKeyboard: true });
    return;
  }

  if (text === "/reset") {
    clearTelegramSession(chatId);
    await sendTelegramMessage(chatId, "Session Telegram Worm sudah direset.", { removeKeyboard: true });
    return;
  }

  if (text === "/provider") {
    await sendProviderMenu(chatId);
    return;
  }

  if (text === "/model") {
    await sendModelMenu(chatId);
    return;
  }

  if (text === "/status") {
    const { provider, model } = getTelegramSession(chatId);
    await sendTelegramMessage(chatId, `Telegram sekarang pakai ${providerKeyToLabel(provider)} · ${model}`);
    return;
  }

  if (await tryHandleTelegramProviderSelection(chatId, text)) return;
  if (await tryHandleTelegramModelSelection(chatId, text)) return;

  const session = getTelegramSession(chatId);
  const { provider, model } = session;
  const isReasoningFlow = String(TELEGRAM_SURFACE_MODE || "").trim().toLowerCase() === "deep_surf";
  const stopTyping = isReasoningFlow
    ? startTypingKeepalive(chatId)
    : (() => {
        sendTyping(chatId);
        return () => {};
      })();

  try {
    const reply = await generateAssistantReply({
      message: text,
      provider,
      model,
      mode: TELEGRAM_MODE,
      surfaceMode: session.surfaceMode || TELEGRAM_SURFACE_MODE,
      workspace: "Telegram",
      sessionId: session.id,
      token: session.token
    });
    setTelegramSession(chatId, reply.session);
    stopTyping();
    await sendTelegramMessage(chatId, buildTelegramReply(reply));
  } catch (err) {
    stopTyping();
    console.error(`[telegram] chat ${chatId}:`, describeError(err, "Telegram reply failed"));
    await sendTelegramMessage(chatId, "Ada kendala saat memproses pesan. Bisa coba kirim ulang?");
  } finally {
    stopTyping();
  }
}

async function pollTelegramUpdates(state) {
  writeTelegramPollingStatus({ state: "polling", lastPollAt: new Date().toISOString() });
  const res = await telegramPost("getUpdates", {
    offset: state.offset,
    timeout: 0,
    allowed_updates: ["message"]
  });

  const updates = Array.isArray(res.result) ? res.result : [];
  writeTelegramPollingStatus({
    state: "ok",
    lastSuccessAt: new Date().toISOString(),
    lastUpdateCount: updates.length,
    conflictCount: 0,
    lastError: ""
  });
  for (const update of updates) {
    state.offset = Math.max(state.offset, Number(update.update_id || 0) + 1);
    writeTelegramPollingStatus({ lastHandledUpdateId: update.update_id, lastUpdateAt: new Date().toISOString() });
    await handleTelegramMessage(update.message);
  }
}

function startTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("telegram bot disabled (TELEGRAM_BOT_TOKEN is empty)");
    return null;
  }

  const releaseLock = acquireTelegramPollingLock();
  if (!releaseLock) return null;

  const state = { offset: 0, stopped: false };
  writeTelegramPollingStatus({ state: "starting", startedAt: new Date().toISOString(), conflictCount: 0 });
  process.once("exit", releaseLock);
  process.once("SIGINT", () => {
    releaseLock();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    releaseLock();
    process.exit(0);
  });

  const loop = async () => {
    // Clear any stale webhook before starting long-poll
    try {
      await telegramPost("deleteWebhook", { drop_pending_updates: false });
    } catch (_) {}

    let consecutive409 = 0;
    while (!state.stopped) {
      try {
        await pollTelegramUpdates(state);
        consecutive409 = 0; // reset on success
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        const status = err?.response?.status;
        if (status === 409) {
          consecutive409 += 1;
          writeTelegramPollingStatus({
            state: "conflict",
            conflictCount: consecutive409,
            lastError: describeError(err, "Telegram polling conflict")
          });
          console.warn(`[telegram] polling: 409 conflict (${consecutive409}/10) — waiting 12s for old session to expire`);
          if (consecutive409 >= 10) {
            console.warn("[telegram] polling: conflict persists; keeping retry loop alive.");
          }
          await new Promise((resolve) => setTimeout(resolve, 12000));
        } else {
          writeTelegramPollingStatus({
            state: "error",
            lastError: describeError(err, "Telegram polling failed")
          });
          console.error("[telegram] polling:", describeError(err, "Telegram polling failed"));
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
  };

  loop();
  console.log("telegram bot polling enabled");
  return {
    stop() {
      state.stopped = true;
      releaseLock();
    }
  };
}

module.exports = {
  startTelegramBot
};
