const fs = require("fs");
const path = require("path");
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
const { defaultModelFor } = require("./provider-service");
const { generateAssistantReply } = require("./chat-service");
const {
  createSession,
  updateSessionIndex,
  verifySession,
  writeSession
} = require("../store/session-store");

const TELEGRAM_INDEX_FILE = path.join(DATA_DIR, "..", "telegram-sessions.json");

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

function resolveTelegramModel(provider) {
  return TELEGRAM_MODEL || defaultModelFor(provider);
}

function setTelegramSession(chatId, session) {
  const index = readTelegramIndex();
  index.chats[String(chatId)] = {
    sessionId: session.id,
    token: session.token,
    updatedAt: new Date().toISOString()
  };
  writeTelegramIndex(index);
}

function clearTelegramSession(chatId) {
  const index = readTelegramIndex();
  delete index.chats[String(chatId)];
  writeTelegramIndex(index);
}

function getTelegramSession(chatId) {
  const key = String(chatId);
  const index = readTelegramIndex();
  const saved = index.chats[key];
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

async function telegramPost(method, data) {
  const res = await axios.post(telegramApiUrl(method), data, {
    timeout: 30000,
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

async function sendTyping(chatId) {
  try {
    await telegramPost("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch (_err) {}
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

  const provider = resolveTelegramProvider();
  const model = resolveTelegramModel(provider);
  const session = getTelegramSession(chatId);
  await sendTyping(chatId);

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
    await sendTelegramMessage(chatId, buildTelegramReply(reply));
  } catch (err) {
    console.error(`[telegram] chat ${chatId}:`, describeError(err, "Telegram reply failed"));
    await sendTelegramMessage(chatId, "Ada kendala saat memproses pesan. Bisa coba kirim ulang?");
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
