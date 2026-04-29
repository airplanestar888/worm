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
  createSession,
  updateSessionIndex,
  verifySession,
  writeSession
} = require("../store/session-store");

const TELEGRAM_INDEX_FILE = path.join(DATA_DIR, "..", "telegram-sessions.json");
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

function getTelegramPreferences(chatId) {
  const { record } = getTelegramChatRecord(chatId);
  const provider = record.provider || resolveTelegramProvider();
  const model = record.model || resolveTelegramModel(provider);
  return { provider, model };
}

function setTelegramPreferences(chatId, preferences = {}) {
  return updateTelegramChatRecord(chatId, (record) => ({
    ...record,
    ...(preferences.provider ? { provider: preferences.provider } : {}),
    ...(preferences.model ? { model: preferences.model } : {}),
    updatedAt: new Date().toISOString()
  }));
}

function setTelegramSession(chatId, session) {
  updateTelegramChatRecord(chatId, (record) => ({
    ...record,
    sessionId: session.id,
    token: session.token,
    updatedAt: new Date().toISOString()
  }));
}

function clearTelegramSession(chatId) {
  updateTelegramChatRecord(chatId, (record) => {
    delete record.sessionId;
    delete record.token;
    record.updatedAt = new Date().toISOString();
    return record;
  });
}

function getTelegramSession(chatId) {
  const { key, record: saved } = getTelegramChatRecord(chatId);
  const preferences = getTelegramPreferences(chatId);
  let session = saved ? verifySession(saved.sessionId, saved.token) : null;

  if (session && (session.provider !== preferences.provider || session.model !== preferences.model)) {
    session = null;
  }

  if (!session) {
    session = createSession({
      workspace: "Telegram",
      provider: preferences.provider,
      model: preferences.model,
      surfaceMode: TELEGRAM_SURFACE_MODE
    });
    session.title = `Telegram ${key}`;
    writeSession(session);
    updateSessionIndex(session);
  }

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

async function sendTelegramMessage(chatId, text) {
  const chunks = splitTelegramText(text || "No reply.");
  for (const chunk of chunks) {
    await telegramPost("sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true
    });
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
  if (!TELEGRAM_INCLUDE_REASONING || !reasoning) return content;
  return [`Thinking:\n${reasoning}`, content].join("\n\n---\n\n");
}

async function sendProviderMenu(chatId) {
  const { provider, model } = getTelegramPreferences(chatId);
  await sendTelegramMenu(
    chatId,
    `Provider aktif: ${providerKeyToLabel(provider)}\nModel aktif: ${model}\n\nPilih provider:`,
    [["Local", "Cloud"]]
  );
}

async function sendModelMenu(chatId) {
  const { provider, model } = getTelegramPreferences(chatId);
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
  setTelegramPreferences(chatId, { provider, model });
  clearTelegramSession(chatId);
  await sendTelegramMessage(chatId, `Sip, provider Telegram sekarang ${providerKeyToLabel(provider)}. Model default: ${model}.`);
  await sendModelMenu(chatId);
  return true;
}

async function tryHandleTelegramModelSelection(chatId, text) {
  const value = String(text || "").trim();
  if (!value || value.startsWith("/")) return false;
  const { provider } = getTelegramPreferences(chatId);
  const models = await getProviderModels(provider).catch(() => []);
  const available = new Set((models.length ? models : [defaultModelFor(provider)]).map((item) => String(item).trim()));
  if (!available.has(value)) return false;
  setTelegramPreferences(chatId, { model: value });
  clearTelegramSession(chatId);
  await sendTelegramMessage(chatId, `Oke, model Telegram sekarang ${value} (${providerKeyToLabel(provider)}).`);
  return true;
}

async function handleTelegramMessage(message) {
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!chatId || !text) return;

  if (text === "/start") {
    await sendTelegramMessage(chatId, "Halo, saya Worm. Kirim pesan apa saja, nanti saya jawab lewat mode Telegram.");
    return;
  }

  if (text === "/reset") {
    clearTelegramSession(chatId);
    await sendTelegramMessage(chatId, "Session Telegram Worm sudah direset.");
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
    const { provider, model } = getTelegramPreferences(chatId);
    await sendTelegramMessage(chatId, `Telegram sekarang pakai ${providerKeyToLabel(provider)} · ${model}`);
    return;
  }

  if (await tryHandleTelegramProviderSelection(chatId, text)) return;
  if (await tryHandleTelegramModelSelection(chatId, text)) return;

  const { provider, model } = getTelegramPreferences(chatId);
  const session = getTelegramSession(chatId);
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
      surfaceMode: TELEGRAM_SURFACE_MODE,
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
  const res = await telegramPost("getUpdates", {
    offset: state.offset,
    timeout: 25,
    allowed_updates: ["message"]
  });

  const updates = Array.isArray(res.result) ? res.result : [];
  for (const update of updates) {
    state.offset = Math.max(state.offset, Number(update.update_id || 0) + 1);
    await handleTelegramMessage(update.message);
  }
}

function startTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("telegram bot disabled (TELEGRAM_BOT_TOKEN is empty)");
    return null;
  }

  const state = { offset: 0, stopped: false };
  const loop = async () => {
    while (!state.stopped) {
      try {
        await pollTelegramUpdates(state);
      } catch (err) {
        console.error("[telegram] polling:", describeError(err, "Telegram polling failed"));
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  };

  loop();
  console.log("telegram bot polling enabled");
  return {
    stop() {
      state.stopped = true;
    }
  };
}

module.exports = {
  startTelegramBot
};
