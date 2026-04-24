require("dotenv").config();
const express = require("express");
const path = require("path");

const { PORT, PROVIDER_DEFAULTS, STATIC_DIR } = require("./config");
const { describeError } = require("./utils/errors");
const { handleChatStream } = require("./services/chat-service");
const { startTelegramBot } = require("./services/telegram-service");
const {
  defaultModelFor,
  getOllamaModels,
  getNvidiaModels,
  getProviderModels
} = require("./services/provider-service");
const { closeSessionStream } = require("./services/stream-registry");
const {
  createSession,
  ensureSessionStore,
  readIndex,
  readSession,
  removeSession,
  setLastActiveSession,
  toSessionSummary,
  verifySession,
  writeIndex,
  writeSession,
  updateSessionIndex
} = require("./store/session-store");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(STATIC_DIR));

app.get("/api/health", async (_req, res) => {
  const providers = [];

  try {
    const ollamaModels = await getOllamaModels();
    providers.push({ id: "ollama", ok: true, defaultModel: defaultModelFor("ollama"), models: ollamaModels });
  } catch (err) {
    providers.push({
      id: "ollama",
      ok: false,
      defaultModel: defaultModelFor("ollama"),
      error: describeError(err),
      models: [defaultModelFor("ollama")]
    });
  }

  if (process.env.NVIDIA_API_KEY) {
    try {
      const nvidiaModels = await getNvidiaModels();
      providers.push({ id: "nvidia", ok: true, defaultModel: defaultModelFor("nvidia"), models: nvidiaModels });
    } catch (err) {
      providers.push({
        id: "nvidia",
        ok: false,
        defaultModel: defaultModelFor("nvidia"),
        error: describeError(err),
        models: [defaultModelFor("nvidia")]
      });
    }
  }

  const ok = providers.some((provider) => provider.ok);
  res.status(ok ? 200 : 500).json({ ok, app: "worm", port: PORT, providers });
});

app.get("/api/models", async (req, res) => {
  const provider = String(req.query?.provider || "ollama").trim().toLowerCase();
  const resolvedProvider = PROVIDER_DEFAULTS[provider] ? provider : "ollama";
  const defaultModel = defaultModelFor(resolvedProvider);

  try {
    const models = await getProviderModels(resolvedProvider);
    res.json({ ok: true, provider: resolvedProvider, models, defaultModel });
  } catch (err) {
    res.status(500).json({
      ok: false,
      provider: resolvedProvider,
      error: describeError(err),
      models: [defaultModel],
      defaultModel
    });
  }
});

app.get("/api/sessions", (_req, res) => {
  const index = readIndex();
  res.json({ ok: true, sessions: index.sessions, lastActiveSessionId: index.lastActiveSessionId });
});

app.post("/api/sessions", (req, res) => {
  const provider = String(req.body?.provider || "ollama").trim().toLowerCase();
  const session = createSession({
    workspace: req.body?.workspace || "Home",
    provider,
    model: req.body?.model || PROVIDER_DEFAULTS[provider] || defaultModelFor("ollama"),
    surfaceMode: req.body?.surfaceMode || "deep_surf"
  });
  res.json({ ok: true, session });
});

app.post("/api/sessions/resume", (req, res) => {
  const sessionId = String(req.body?.sessionId || "").trim();
  const token = String(req.body?.token || "").trim();
  const session = verifySession(sessionId, token);
  if (!session) return res.status(404).json({ ok: false, error: "Session not found." });
  setLastActiveSession(session.id);
  res.json({ ok: true, session });
});

app.post("/api/streams/close", (req, res) => {
  const sessionId = String(req.body?.sessionId || "").trim();
  const token = String(req.body?.token || "").trim();
  if (!sessionId || !token) return res.json({ ok: true, closed: false });

  const session = verifySession(sessionId, token);
  if (!session) return res.json({ ok: true, closed: false });

  const closed = closeSessionStream(sessionId);
  res.json({ ok: true, closed });
});

app.get("/api/sessions/:id", (req, res) => {
  const sessionId = String(req.params.id || "").trim();
  const token = String(req.query.token || "").trim();
  const session = verifySession(sessionId, token);
  if (!session) return res.status(404).json({ ok: false, error: "Session not found." });
  setLastActiveSession(session.id);
  res.json({ ok: true, session });
});

app.patch("/api/sessions/:id", (req, res) => {
  const sessionId = String(req.params.id || "").trim();
  const token = String(req.body?.token || "").trim();
  const title = String(req.body?.title || "").trim();
  const surfaceMode = String(req.body?.surfaceMode || "").trim().toLowerCase();
  const session = verifySession(sessionId, token);
  if (!session) return res.status(404).json({ ok: false, error: "Session not found." });
  if (!title && !surfaceMode) return res.status(400).json({ ok: false, error: "No session changes provided." });
  if (title) session.title = title.slice(0, 80);
  if (surfaceMode) session.surfaceMode = surfaceMode === "deep_surf" ? "deep_surf" : "local";
  session.updatedAt = new Date().toISOString();
  writeSession(session);
  updateSessionIndex(session);
  res.json({ ok: true, session });
});

app.delete("/api/sessions/:id", (req, res) => {
  const sessionId = String(req.params.id || "").trim();
  const token = String(req.query.token || "").trim();
  const session = verifySession(sessionId, token);
  if (!session) return res.status(404).json({ ok: false, error: "Session not found." });

  const index = readIndex();
  closeSessionStream(sessionId);
  removeSession(sessionId);
  index.sessions = index.sessions.filter((item) => item.id !== sessionId);
  if (index.lastActiveSessionId === sessionId) {
    index.lastActiveSessionId = index.sessions[0]?.id || null;
  }
  writeIndex(index);
  const nextSession = index.lastActiveSessionId ? readSession(index.lastActiveSessionId) : null;
  res.json({ ok: true, deleted: true, nextSession: nextSession ? toSessionSummary(nextSession) : null });
});

app.post("/api/chat/stream", handleChatStream);

app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "worm.html"));
});

ensureSessionStore();
const server = app.listen(PORT, () => {
  console.log(`worm listening on http://localhost:${PORT}`);
  startTelegramBot();
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`Worm is already running or port ${PORT} is in use.`);
    console.error(`Open http://localhost:${PORT} or close the existing gateway before starting again.`);
    process.exit(1);
  }
  console.error(describeError(err, "Worm server failed to start"));
  process.exit(1);
});
