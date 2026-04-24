const {
  CONTEXT_TOKEN_RESERVE,
  HOME_WORKSPACE,
  NVIDIA_CONTEXT_TOKENS,
  OLLAMA_CONTEXT_TOKENS,
  PROVIDER_DEFAULTS
} = require("../config");
const { describeError } = require("../utils/errors");
const {
  createSession,
  updateSessionIndex,
  verifySession,
  writeSession
} = require("../store/session-store");
const { readSoulPrompt } = require("../soul");
const { buildCurrentTimeSystemLine, resolveToolContext } = require("./tool-service");
const {
  isProviderConfigured,
  streamNvidiaChat,
  streamOllamaChat
} = require("./provider-service");
const { registerSessionStream } = require("./stream-registry");

function buildSystem(mode, toolContext = "") {
  return [
    readSoulPrompt(),
    buildCurrentTimeSystemLine(),
    toolContext,
    `Reasoning effort: ${mode || "low"}.`
  ].filter(Boolean).join("\n\n");
}

function estimateTokens(text) {
  const value = String(text || "");
  return Math.max(1, Math.ceil(value.length / 4));
}

function providerContextBudget(provider) {
  const base = provider === "nvidia" ? NVIDIA_CONTEXT_TOKENS : OLLAMA_CONTEXT_TOKENS;
  return Math.max(1024, base - CONTEXT_TOKEN_RESERVE);
}

function buildProviderMessages(session, systemText, provider) {
  const budget = providerContextBudget(provider);
  const history = (session.messages || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content || "") }));

  const selected = [];
  let used = estimateTokens(systemText);

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    const cost = estimateTokens(message.content);

    if (selected.length > 0 && used + cost > budget) continue;

    selected.unshift(message);
    used += cost;

    if (used >= budget) break;
  }

  return [{ role: "system", content: systemText }, ...selected];
}

function trailingTagPrefixLength(text, tag) {
  const max = Math.min(text.length, tag.length - 1);
  for (let len = max; len > 0; len -= 1) {
    if (text.slice(-len) === tag.slice(0, len)) return len;
  }
  return 0;
}

function createThinkParser() {
  return {
    inThink: false,
    pending: ""
  };
}

function consumeThinkTaggedText(parser, chunk) {
  const openTag = "<think>";
  const closeTag = "</think>";
  parser.pending += String(chunk || "");

  let content = "";
  let reasoning = "";
  let text = parser.pending;

  while (text) {
    if (parser.inThink) {
      const closeIndex = text.indexOf(closeTag);
      if (closeIndex >= 0) {
        reasoning += text.slice(0, closeIndex);
        text = text.slice(closeIndex + closeTag.length);
        parser.inThink = false;
        continue;
      }
      const keep = trailingTagPrefixLength(text, closeTag);
      reasoning += text.slice(0, text.length - keep);
      parser.pending = text.slice(text.length - keep);
      return { content, reasoning };
    }

    const openIndex = text.indexOf(openTag);
    if (openIndex >= 0) {
      content += text.slice(0, openIndex);
      text = text.slice(openIndex + openTag.length);
      parser.inThink = true;
      continue;
    }

    const keep = trailingTagPrefixLength(text, openTag);
    content += text.slice(0, text.length - keep);
    parser.pending = text.slice(text.length - keep);
    return { content, reasoning };
  }

  parser.pending = "";
  return { content, reasoning };
}

function flushThinkParser(parser) {
  const rest = String(parser.pending || "");
  parser.pending = "";
  if (!rest) return { content: "", reasoning: "" };
  return parser.inThink ? { content: "", reasoning: rest } : { content: rest, reasoning: "" };
}

function stripAssistantArtifacts(text) {
  return String(text || "")
    .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, " ")
    .replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, " ")
    .replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, " ")
    .replace(/<\/?(minimax:tool_call|invoke|parameter)\b[^>]*>/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeProvider(provider) {
  return PROVIDER_DEFAULTS[provider] ? provider : "ollama";
}

function initializeStream(res, session) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  res.write(`data: ${JSON.stringify({ sessionId: session.id, sessionToken: session.token })}\n\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableProviderError(err) {
  const status = Number(err?.response?.status || err?.status || 0);
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

  const code = String(err?.code || "").toUpperCase();
  if (["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "ENOTFOUND", "EPIPE"].includes(code)) {
    return true;
  }

  const message = String(err?.message || "").toLowerCase();
  return /\b(timeout|network|socket hang up|connection|stream reset|temporar)/.test(message);
}

async function openProviderStreamWithRetry({ provider, model, messages, mode, attempts = 3 }) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return provider === "nvidia"
        ? await streamNvidiaChat({ model, messages, mode })
        : await streamOllamaChat({ model, messages, mode });
    } catch (err) {
      lastError = err;
      const detail = describeError(err, `${provider.toUpperCase()} request failed for ${model}`);
      console.warn(`[chat-request:${provider}] attempt ${attempt}/${attempts}: ${detail}`);
      if (attempt >= attempts || !isRetryableProviderError(err)) break;
      await sleep(450 * attempt);
    }
  }

  throw lastError;
}

function writeChatError(res, message, extra = {}) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ error: message, ...extra })}\n\n`);
  res.end();
}

function buildDeepSurfInstruction(surfaceMode) {
  return surfaceMode === "deep_surf"
    ? [
        "You are in Deep Surf Beta mode.",
        "First decide whether the user asks for stable knowledge or current/live information.",
        "For current facts, prices, leaders, news, or market data, use the web search results from this turn as evidence.",
        "Compare the search results with your knowledge and answer only what is supported.",
        "For current office holders or leaders, never answer from memory if the web evidence does not support the name.",
        "For public-person family or relationship facts such as spouse, children, parents, or family, never invent names; answer only from evidence in the web results or say the result is not clear.",
        "If your memory conflicts with current-date evidence, prefer the current-date evidence.",
        "If the search results are weak, conflicting, or unrelated, say that the current data is not clear and avoid inventing numbers or names.",
        "Do not mention Google News, Google RSS, or internal query providers in the final answer.",
        "Only include a source line if the search result text clearly names a concrete publisher or official source."
      ].join("\n")
    : "";
}

function collectProviderStream(streamResponse, provider, model) {
  return new Promise((resolve, reject) => {
    const providerStream = streamResponse.data;
    const isSse = provider === "nvidia";
    let buffer = "";
    let fullReply = "";
    let fullReasoning = "";
    let settled = false;
    const thinkParser = createThinkParser();

    const finish = (doneModel = model) => {
      if (settled) return;
      settled = true;
      const leftover = flushThinkParser(thinkParser);
      if (leftover.reasoning) fullReasoning += leftover.reasoning;
      if (leftover.content) fullReply += leftover.content;
      resolve({
        content: stripAssistantArtifacts(fullReply),
        reasoning: stripAssistantArtifacts(fullReasoning),
        model: doneModel
      });
    };

    providerStream.on("data", (chunk) => {
      buffer += chunk.toString();
      const parts = isSse ? buffer.split("\n\n") : buffer.split("\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = isSse
          ? part.split("\n").find((entry) => entry.startsWith("data: "))
          : part;
        if (!line) continue;
        const raw = isSse ? line.slice(6).trim() : line.trim();
        if (!raw || raw === "[DONE]") continue;

        try {
          const parsed = JSON.parse(raw);
          const delta = isSse ? parsed?.choices?.[0]?.delta || {} : null;
          const reasoningChunk = isSse ? delta.reasoning_content || "" : "";
          const tokenChunk = isSse ? delta.content || "" : parsed?.message?.content || "";
          const parsedToken = tokenChunk ? consumeThinkTaggedText(thinkParser, tokenChunk) : { content: "", reasoning: "" };

          if (reasoningChunk) fullReasoning += reasoningChunk;
          if (parsedToken.reasoning) fullReasoning += parsedToken.reasoning;
          if (parsedToken.content) fullReply += parsedToken.content;

          const finished = isSse ? parsed?.choices?.[0]?.finish_reason : parsed?.done;
          if (finished) finish(parsed.model || model);
        } catch (_err) {}
      }
    });

    providerStream.on("end", () => finish(model));
    providerStream.on("error", reject);
  });
}

async function generateAssistantReply({
  message,
  provider = "ollama",
  model,
  mode = "medium",
  surfaceMode = "deep_surf",
  workspace = HOME_WORKSPACE,
  sessionId = "",
  token = ""
} = {}) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) throw new Error("Message is required.");

  const resolvedProvider = normalizeProvider(String(provider || "ollama").trim().toLowerCase());
  const resolvedModel = String(model || PROVIDER_DEFAULTS[resolvedProvider]).trim();
  const resolvedMode = String(mode || "medium").trim();
  const resolvedSurfaceMode = String(surfaceMode || "local").trim().toLowerCase() === "deep_surf" ? "deep_surf" : "local";

  let session = verifySession(String(sessionId || "").trim(), String(token || "").trim());
  if (!session) {
    session = createSession({ workspace, provider: resolvedProvider, model: resolvedModel, surfaceMode: resolvedSurfaceMode });
  }

  const now = new Date().toISOString();
  session.workspace = workspace;
  session.provider = resolvedProvider;
  session.model = resolvedModel;
  session.surfaceMode = resolvedSurfaceMode;
  session.updatedAt = now;
  session.messages.push({ role: "user", content: cleanMessage, at: now });
  writeSession(session);
  updateSessionIndex(session);

  const responseStartedAt = Date.now();
  const { toolContext, directReply } = await resolveToolContext(cleanMessage, { surfaceMode: resolvedSurfaceMode, session });
  if (directReply) {
    const doneAt = new Date().toISOString();
    const responseMs = Math.max(0, Date.now() - responseStartedAt);
    session.updatedAt = doneAt;
    session.messages.push({ role: "assistant", content: directReply, responseMs, at: doneAt });
    writeSession(session);
    updateSessionIndex(session);
    return { content: directReply, reasoning: "", session, responseMs, model: resolvedModel };
  }

  if (!isProviderConfigured(resolvedProvider)) {
    throw new Error("Provider belum siap. Cek konfigurasi koneksi model lalu coba lagi.");
  }

  const systemText = buildSystem(
    resolvedMode,
    [buildDeepSurfInstruction(resolvedSurfaceMode), toolContext].filter(Boolean).join("\n\n")
  );
  const providerMessages = buildProviderMessages(session, systemText, resolvedProvider);
  const streamResponse = await openProviderStreamWithRetry({
    provider: resolvedProvider,
    model: resolvedModel,
    messages: providerMessages,
    mode: resolvedMode,
    attempts: 3
  });
  const reply = await collectProviderStream(streamResponse, resolvedProvider, resolvedModel);
  const doneAt = new Date().toISOString();
  const responseMs = Math.max(0, Date.now() - responseStartedAt);
  session.updatedAt = doneAt;
  session.messages.push({
    role: "assistant",
    content: reply.content || "",
    ...(reply.reasoning ? { reasoning: reply.reasoning } : {}),
    responseMs,
    at: doneAt
  });
  writeSession(session);
  updateSessionIndex(session);
  return { ...reply, session, responseMs };
}

async function handleChatStream(req, res) {
  const responseStartedAt = Date.now();
  const provider = String(req.body?.provider || "ollama").trim().toLowerCase();
  const resolvedProvider = normalizeProvider(provider);
  const model = String(req.body?.model || PROVIDER_DEFAULTS[resolvedProvider]).trim();
  const mode = String(req.body?.mode || "low").trim();
  const surfaceMode = String(req.body?.surfaceMode || "local").trim().toLowerCase() === "deep_surf" ? "deep_surf" : "local";
  const workspace = String(req.body?.workspace || HOME_WORKSPACE).trim();
  const sessionId = String(req.body?.sessionId || "").trim();
  const token = String(req.body?.token || "").trim();
  const message = String(req.body?.message || "").trim();

  if (!message) {
    return res.status(400).json({ ok: false, error: "Message is required." });
  }

  let session = verifySession(sessionId, token);
  if (!session) {
    session = createSession({ workspace, provider: resolvedProvider, model, surfaceMode });
  }

  const now = new Date().toISOString();
  session.workspace = workspace;
  session.provider = resolvedProvider;
  session.model = model;
  session.surfaceMode = surfaceMode;
  session.updatedAt = now;
  session.messages.push({ role: "user", content: message, at: now });
  writeSession(session);
  updateSessionIndex(session);

  initializeStream(res, session);
  let cleanupActiveStream = () => {};
  let providerStream = null;
  let requestClosed = false;

  res.on("close", () => {
    requestClosed = true;
    cleanupActiveStream();
    providerStream?.destroy?.();
  });

  const finishSession = (fullReply, doneModel = model, reasoningReply = "") => {
    cleanupActiveStream();
    const doneAt = new Date().toISOString();
    const responseMs = Math.max(0, Date.now() - responseStartedAt);
    const sanitizedReply = stripAssistantArtifacts(fullReply);
    const sanitizedReasoning = stripAssistantArtifacts(reasoningReply);
    session.updatedAt = doneAt;
    session.messages.push({
      role: "assistant",
      content: sanitizedReply || "",
      ...(sanitizedReasoning ? { reasoning: sanitizedReasoning } : {}),
      responseMs,
      at: doneAt
    });
    writeSession(session);
    updateSessionIndex(session);
    res.write(`data: ${JSON.stringify({
      done: true,
      model: doneModel,
      sessionId: session.id,
      sessionToken: session.token,
      content: sanitizedReply || "",
      reasoning: sanitizedReasoning || "",
      responseMs
    })}\n\n`);
    res.end();
  };

  const { toolContext, directReply } = await resolveToolContext(message, { surfaceMode, session });
  if (directReply) {
    finishSession(directReply, model);
    return;
  }

  if (!isProviderConfigured(resolvedProvider)) {
    writeChatError(res, "Provider belum siap. Cek konfigurasi koneksi model lalu coba lagi.");
    return;
  }

  const deepSurfInstruction = buildDeepSurfInstruction(surfaceMode);
  const systemText = buildSystem(mode, [deepSurfInstruction, toolContext].filter(Boolean).join("\n\n"));
  const providerMessages = buildProviderMessages(session, systemText, resolvedProvider);

  try {
    const streamResponse = await openProviderStreamWithRetry({
      provider: resolvedProvider,
      model,
      messages: providerMessages,
      mode,
      attempts: 3
    });
    if (requestClosed || res.writableEnded) {
      streamResponse?.data?.destroy?.();
      return;
    }
    providerStream = streamResponse.data;
    cleanupActiveStream = registerSessionStream(session.id, { stream: providerStream });

    const isSse = resolvedProvider === "nvidia";
    let buffer = "";
    let fullReply = "";
    let fullReasoning = "";
    const thinkParser = createThinkParser();

    providerStream.on("data", (chunk) => {
      if (requestClosed || res.writableEnded) return;
      buffer += chunk.toString();
      const parts = isSse ? buffer.split("\n\n") : buffer.split("\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = isSse
          ? part.split("\n").find((entry) => entry.startsWith("data: "))
          : part;
        if (!line) continue;
        const raw = isSse ? line.slice(6).trim() : line.trim();
        if (!raw || raw === "[DONE]") continue;

        try {
          const parsed = JSON.parse(raw);
          const delta = isSse ? parsed?.choices?.[0]?.delta || {} : null;
          const reasoningChunk = isSse ? delta.reasoning_content || "" : "";
          const tokenChunk = isSse ? delta.content || "" : parsed?.message?.content || "";
          const parsedToken = tokenChunk ? consumeThinkTaggedText(thinkParser, tokenChunk) : { content: "", reasoning: "" };

          if (reasoningChunk) {
            fullReasoning += reasoningChunk;
            res.write(`data: ${JSON.stringify({ reasoning: reasoningChunk })}\n\n`);
          }
          if (parsedToken.reasoning) {
            fullReasoning += parsedToken.reasoning;
            res.write(`data: ${JSON.stringify({ reasoning: parsedToken.reasoning })}\n\n`);
          }
          if (parsedToken.content) {
            fullReply += parsedToken.content;
            res.write(`data: ${JSON.stringify({ token: parsedToken.content })}\n\n`);
          }

          const finished = isSse ? parsed?.choices?.[0]?.finish_reason : parsed?.done;
          if (finished && !res.writableEnded) {
            const leftover = flushThinkParser(thinkParser);
            if (leftover.reasoning) fullReasoning += leftover.reasoning;
            if (leftover.content) fullReply += leftover.content;
            finishSession(fullReply, parsed.model || model, fullReasoning);
          }
        } catch (_err) {}
      }
    });

    providerStream.on("end", () => {
      if (!res.writableEnded) {
        const leftover = flushThinkParser(thinkParser);
        if (leftover.reasoning) fullReasoning += leftover.reasoning;
        if (leftover.content) fullReply += leftover.content;
        finishSession(fullReply, model, fullReasoning);
      }
    });

    providerStream.on("error", (err) => {
      cleanupActiveStream();
      if (!res.writableEnded) {
        const detail = describeError(err, `${resolvedProvider.toUpperCase()} stream failed for ${model}`);
        console.error(`[chat-stream:${resolvedProvider}] ${model}:`, detail);
        writeChatError(res, "Stream model terputus. Bisa coba kirim ulang?");
      }
    });
  } catch (err) {
    cleanupActiveStream();
    const detail = describeError(err, `${resolvedProvider.toUpperCase()} request failed for ${model}`);
    console.error(`[chat-request:${resolvedProvider}] ${model}:`, detail);
    writeChatError(res, "Ada kendala saat menghubungi model. Bisa coba kirim ulang?", {
      sessionId: session.id,
      sessionToken: session.token
    });
  }
}

module.exports = {
  generateAssistantReply,
  handleChatStream
};
