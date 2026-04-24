const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  DATA_DIR,
  INDEX_FILE,
  HOME_WORKSPACE,
  OLLAMA_MODEL,
  PROVIDER_DEFAULTS
} = require("../config");

function ensureSessionStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify({ sessions: [], lastActiveSessionId: null }, null, 2));
  }
}

function readIndex() {
  ensureSessionStore();
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
}

function writeIndex(data) {
  ensureSessionStore();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2));
}

function sessionFile(sessionId) {
  return path.join(DATA_DIR, `${sessionId}.json`);
}

function readSession(sessionId) {
  const file = sessionFile(sessionId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeSession(session) {
  ensureSessionStore();
  fs.writeFileSync(sessionFile(session.id), JSON.stringify(session, null, 2));
}

function removeSession(sessionId) {
  const file = sessionFile(sessionId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function summarizePreview(session) {
  const last = (session.messages || []).slice().reverse().find((m) => m.role === "user" || m.role === "assistant");
  const text = last?.content || last?.reasoning || "No messages yet";
  return text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
}

function nextDefaultTitle(existingSessions) {
  let counter = 1;
  const titles = new Set((existingSessions || []).map((s) => String(s.title || "").trim().toLowerCase()));
  while (titles.has(`new ${counter}`)) counter += 1;
  return `New ${counter}`;
}

function toSessionSummary(session) {
  return {
    id: session.id,
    title: session.title,
    workspace: session.workspace,
    provider: session.provider,
    model: session.model,
    surfaceMode: session.surfaceMode || "local",
    updatedAt: session.updatedAt,
    preview: summarizePreview(session),
    token: session.token
  };
}

function updateSessionIndex(session) {
  const index = readIndex();
  index.sessions = [
    toSessionSummary(session),
    ...index.sessions.filter((item) => item.id !== session.id)
  ];
  index.lastActiveSessionId = session.id;
  writeIndex(index);
}

function setLastActiveSession(sessionId) {
  const index = readIndex();
  index.lastActiveSessionId = sessionId || null;
  writeIndex(index);
}

function createSession({ workspace = HOME_WORKSPACE, provider = "ollama", model, surfaceMode = "deep_surf" } = {}) {
  const now = new Date().toISOString();
  const id = `sess_${crypto.randomBytes(8).toString("hex")}`;
  const token = crypto.randomBytes(16).toString("hex");
  const index = readIndex();
  const title = nextDefaultTitle(index.sessions);
  const resolvedProvider = PROVIDER_DEFAULTS[provider] ? provider : "ollama";
  const resolvedModel = model || PROVIDER_DEFAULTS[resolvedProvider] || OLLAMA_MODEL;
  const session = {
    id,
    token,
    title,
    workspace,
    provider: resolvedProvider,
    model: resolvedModel,
    surfaceMode: surfaceMode === "deep_surf" ? "deep_surf" : "local",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  writeSession(session);
  updateSessionIndex(session);
  return session;
}

function verifySession(sessionId, token) {
  const session = readSession(sessionId);
  if (!session) return null;
  if (session.token !== token) return null;
  return session;
}

function resetSession(session) {
  session.messages = [];
  session.updatedAt = new Date().toISOString();
  writeSession(session);
  updateSessionIndex(session);
  return session;
}

module.exports = {
  ensureSessionStore,
  readIndex,
  writeIndex,
  readSession,
  writeSession,
  removeSession,
  toSessionSummary,
  createSession,
  updateSessionIndex,
  setLastActiveSession,
  verifySession,
  resetSession
};
