const { buildCurrentTimeSystemLine, needsCurrentTimeTool, runCurrentTimeTool } = require("../tools/time-tool");
const { classifyLiveIntent, needsWebLiveLookup, runWebLiveLookup } = require("../tools/web-live-tool");
const {
  defaultModelFor,
  isProviderConfigured,
  streamNvidiaChat,
  streamOllamaChat
} = require("./provider-service");

const ORCHESTRATOR_CATEGORY_HINTS = [
  "crypto_price",
  "crypto_price_historical",
  "gold_price",
  "staple_price",
  "forex_price",
  "general_price",
  "technology_news",
  "sports_news",
  "economy_news",
  "general_news",
  "office",
  "person_relation",
  "count"
];

function isAffirmativeFollowup(message = "") {
  const text = String(message || "").trim().toLowerCase();
  return /^(ok|oke|ya|yap|iya|iyah|yup|yes|lanjut|lanjutkan|go ahead|please do|silakan|gas|boleh)$/i.test(text);
}

function isRetryFollowup(message = "") {
  const text = String(message || "").trim().toLowerCase();
  return /^(coba lagi|coba ulang|coba sekali lagi|ulang|ulangi|retry|try again|cari lagi|cek lagi)$/i.test(text);
}

function isAmbiguousShortFollowup(message = "") {
  const text = String(message || "").trim().toLowerCase();
  return /^(siapa|who|siapa\?|who\?)$/i.test(text);
}

function isInconclusiveWebReply(message = "") {
  const text = String(message || "").trim();
  return /Mau saya cari di sumber lain\?/i.test(text)
    || /Saya sudah cek Google News search lanjutan, tapi/i.test(text)
    || /hasil Google News search yang saya dapatkan belum cukup jelas/i.test(text)
    || /hasilnya masih belum cukup jelas/i.test(text);
}

function getLastCompletedTurn(session) {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  let assistantIndex = messages.length - 1;
  while (assistantIndex >= 0 && messages[assistantIndex]?.role !== "assistant") {
    assistantIndex -= 1;
  }
  if (assistantIndex < 1) return null;
  let userIndex = assistantIndex - 1;
  while (userIndex >= 0 && messages[userIndex]?.role !== "user") {
    userIndex -= 1;
  }
  if (userIndex < 0) return null;
  const lastAssistant = messages[assistantIndex];
  const previousUser = messages[userIndex];
  if (lastAssistant?.role !== "assistant" || previousUser?.role !== "user") return null;
  return { lastAssistant, previousUser };
}

function getPendingWebFollowup(session) {
  const lastTurn = getLastCompletedTurn(session);
  if (!lastTurn) return null;
  const { lastAssistant, previousUser } = lastTurn;
  if (!isInconclusiveWebReply(lastAssistant.content || "")) return null;

  if (isAmbiguousShortFollowup(previousUser.content || "") || isRetryFollowup(previousUser.content || "")) {
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;
      const content = String(message.content || "").trim();
      if (!content || isAffirmativeFollowup(content) || isRetryFollowup(content) || isAmbiguousShortFollowup(content)) continue;
      if (classifyLiveIntent(content) === "office" || needsWebLiveLookup(content)) {
        return { originalMessage: content };
      }
    }
  }

  return {
    originalMessage: String(previousUser.content || "").trim()
  };
}

function extractOfficeRoleSequence(message = "") {
  const text = String(message || "").toLowerCase();
  const patterns = [
    { label: "presiden", regex: /\b(president|presiden)\b/g },
    { label: "wakil presiden", regex: /\b(vice president|wakil presiden|vp|wakil)\b/g },
    { label: "perdana menteri", regex: /\b(prime minister|perdana menteri|pm)\b/g },
    { label: "gubernur", regex: /\b(governor|gubernur)\b/g },
    { label: "ceo", regex: /\bceo\b/g },
    { label: "ratu", regex: /\b(queen|ratu)\b/g },
    { label: "raja", regex: /\b(king|raja)\b/g }
  ];
  const matches = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      matches.push({ label: pattern.label, index: match.index ?? 0 });
    }
  }
  return [...new Set(matches.sort((a, b) => a.index - b.index).map((item) => item.label))];
}

function isShortContextualFollowup(message = "") {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;
  if (needsWebLiveLookup(text)) return false;
  return /^(?:(?:kalo|kalau|bagaimana kalau|how about|what about)\s+)?[\p{L}\s.'-]{2,40}\??$/iu.test(text);
}

function cleanContextFollowupSubject(message = "") {
  return String(message || "")
    .trim()
    .replace(/^(kalo|kalau|bagaimana kalau|how about|what about)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getContextualOfficeFollowup(session, message = "") {
  if (!isShortContextualFollowup(message)) return null;
  const lastTurn = getLastCompletedTurn(session);
  if (!lastTurn) return null;
  const previousUserMessage = String(lastTurn.previousUser.content || "").trim();
  if (classifyLiveIntent(previousUserMessage) !== "office") return null;
  const roles = extractOfficeRoleSequence(previousUserMessage);
  const subject = cleanContextFollowupSubject(message);
  if (!roles.length || !subject) return null;
  return {
    originalMessage: `siapa ${roles.join(" dan ")} ${subject}`.trim()
  };
}

function formatToolContext(results) {
  if (!results.length) return "";

  const lines = [
    "Fresh tool results for this turn:",
    ...results.flatMap((result) => {
      const engineBits = [];
      if (Number.isFinite(result?.engine?.score)) engineBits.push(`score=${result.engine.score}`);
      if (Array.isArray(result?.engine?.evidence) && result.engine.evidence.length) engineBits.push(`evidence=${result.engine.evidence.map((item) => `${item.sourceLabel}:${item.confidence}`).join(", ")}`);
      const suffix = engineBits.length ? ` [${engineBits.join(" | ")}]` : "";
      const blocks = [`- [${result.name}] ${result.summary}${suffix}`];
      if (result?.contextText) {
        blocks.push(`Context from ${result.name}:\n${String(result.contextText).trim()}`);
      }
      return blocks;
    }),
    "Use these results when relevant. If a tool failed, mention the limitation briefly instead of inventing data."
  ];

  return lines.join("\n");
}

function friendlyToolLabel(name) {
  switch (name) {
    case "time.now":
      return "waktu saat ini";
    case "web.live":
      return "data live dari web";
    default:
      return "data live";
  }
}

function friendlyToolFailureReply(name) {
  switch (name) {
    case "web.live":
      return "Saya belum bisa mengambil hasil Google News search sekarang.";
    case "time.now":
      return "Saya belum bisa mengambil waktu saat ini sekarang.";
    default:
      return `Saya belum bisa mengambil ${friendlyToolLabel(name)} sekarang.`;
  }
}

function isPlainTimeRequest(message = "") {
  const text = String(message || "").toLowerCase();
  if (!needsCurrentTimeTool(text)) return false;
  return !/\b(harga|price|rate|kurs|siapa|who|jumlah|count|total|news|berita|status|saham|stock|cuaca|weather|score|skor|link|streaming|siaran langsung|nonton|jadwal|schedule|persib|persija|liga)\b/i.test(text);
}

function buildDirectToolReply(results) {
  const directResults = results.filter((result) => result.directReply && !result.passToModel);
  if (!directResults.length) return "";
  const webLiveResult = directResults.find((result) => result.name === "web.live");
  if (webLiveResult) return webLiveResult.directReply;
  const timeResult = directResults.find((result) => result.name === "time.now");
  if (timeResult) return timeResult.directReply;
  return directResults[0].directReply;
}

function normalizeOrchestratorDecision(raw = {}) {
  const mode = String(raw?.mode || "").trim().toLowerCase();
  const tool = String(raw?.tool || "").trim().toLowerCase();
  const categoryHint = String(raw?.categoryHint || "").trim().toLowerCase();
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence || 0)));
  const query = String(raw?.query || "").trim();

  return {
    mode: mode === "live" ? "live" : mode === "local" ? "local" : "",
    tool: ["web.live", "time.now", "none"].includes(tool) ? tool : "",
    categoryHint: ORCHESTRATOR_CATEGORY_HINTS.includes(categoryHint) ? categoryHint : "",
    query,
    confidence,
    reason: String(raw?.reason || "").trim()
  };
}

function shouldPromoteOrchestratorToLive(message, decision = null) {
  if (!decision?.categoryHint || decision?.tool === "time.now") return false;
  const text = String(message || "").toLowerCase();
  return /\b(harga|price|berita|news|siapa|who|status|kurs|rate|berapa|terbaru|terkini|update|sekarang|hari ini)\b/.test(text);
}

async function runRoutingOrchestrator(message, options = {}) {
  const provider = String(options.session?.provider || options.provider || "ollama").trim().toLowerCase();
  const model = String(options.session?.model || options.model || defaultModelFor(provider)).trim();
  if (!isProviderConfigured(provider)) return null;

  const currentYear = new Date().getFullYear();
  const system = [
    "Route the user request for Worm. Return JSON only — no markdown, no explanation.",
    `{"mode":"local|live","tool":"none|web.live|time.now","query":"optimized search query in user language (include year ${currentYear} for price/news queries)","categoryHint":"crypto_price|crypto_price_historical|gold_price|staple_price|forex_price|general_price|technology_news|sports_news|economy_news|general_news|office|person_relation|count","confidence":0.0,"reason":"short"}`,
    "Current facts/prices/news/leaders/status => live + web.live.",
    "Historical crypto price questions (e.g. bitcoin 3 days ago) => live + web.live, never time.now.",
    "User includes a URL to read/check/summarize => live + web.live.",
    "Time-only questions (jam, waktu, tanggal) => live + time.now.",
    "Stable knowledge/math/language/chat => local + none, query can be empty.",
    `For query field: write a clean, specific search query. Include '${currentYear}' for price/news. Use Indonesian if user speaks Indonesian.`,
    "telur/cabai/bawang/beras/sembako/sayur => staple_price.",
    "emas/antam/gold => gold_price.",
    "btc/bitcoin/crypto => crypto_price."
  ].join("\n");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: String(message || "") }
  ];

  const raw = await new Promise(async (resolve, reject) => {
    let streamResponse;
    try {
      streamResponse = provider === "nvidia"
        ? await streamNvidiaChat({ model, messages, mode: "low" })
        : await streamOllamaChat({ model, messages, mode: "low" });
    } catch (error) {
      reject(error);
      return;
    }

    const stream = streamResponse.data;
    const isSse = provider === "nvidia";
    let buffer = "";
    let fullText = "";

    const cleanup = () => {
      stream.removeAllListeners("data");
      stream.removeAllListeners("end");
      stream.removeAllListeners("error");
    };

    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const parts = isSse ? buffer.split("\n\n") : buffer.split("\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = isSse
          ? part.split("\n").find((entry) => entry.startsWith("data: "))
          : part.trim();
        if (!line) continue;
        const rawLine = isSse ? line.slice(6).trim() : line.trim();
        if (!rawLine || rawLine === "[DONE]") continue;

        try {
          const parsed = JSON.parse(rawLine);
          const token = isSse
            ? parsed?.choices?.[0]?.delta?.content || ""
            : parsed?.message?.content || "";
          if (token) fullText += token;
        } catch {
          // ignore partial lines
        }
      }
    });

    stream.on("end", () => {
      cleanup();
      resolve(String(fullText || buffer || "").trim());
    });

    stream.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });

  try {
    return normalizeOrchestratorDecision(JSON.parse(raw));
  } catch {
    const match = String(raw || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return normalizeOrchestratorDecision(JSON.parse(match[0]));
    } catch {
      return null;
    }
  }
}

async function resolveToolContext(message, options = {}) {
  const surfaceMode = options.surfaceMode === "deep_surf" ? "deep_surf" : "local";
  const followup = surfaceMode === "deep_surf" && (isAffirmativeFollowup(message) || isRetryFollowup(message))
    ? getPendingWebFollowup(options.session)
    : null;
  const contextualOfficeFollowup = surfaceMode === "deep_surf" && !followup
    ? getContextualOfficeFollowup(options.session, message)
    : null;
  const effectiveMessage = followup?.originalMessage || contextualOfficeFollowup?.originalMessage || message;

  // --- PASS 1: LLM routing orchestrator (authoritative) ---
  const orchestratorDecision = surfaceMode === "deep_surf"
    ? await runRoutingOrchestrator(effectiveMessage, options).catch(() => null)
    : null;

  // LLM is authoritative; regex heuristics only as fallback when LLM unavailable
  const orchestratorNeedsLiveWeb = orchestratorDecision
    ? (orchestratorDecision.mode === "live" && orchestratorDecision.tool === "web.live")
    : needsWebLiveLookup(effectiveMessage);
  const orchestratorNeedsTime = orchestratorDecision
    ? (orchestratorDecision.tool === "time.now")
    : needsCurrentTimeTool(effectiveMessage);

  // Always include current time alongside web search
  const needsLiveWeb = orchestratorNeedsLiveWeb;
  const shouldRunTimeTool = orchestratorNeedsTime || needsLiveWeb; // time always useful with web

  // Block live web in local surface mode
  if (surfaceMode === "local" && needsLiveWeb) {
    return {
      toolResults: [],
      toolContext: "",
      directReply: "Untuk data live seperti ini, pindah ke Deep Search Beta dulu ya."
    };
  }

  // --- PASS 2: Execute tools in parallel ---
  const tasks = [];
  const directToolIntents = [];

  if (shouldRunTimeTool) {
    directToolIntents.push("time.now");
    tasks.push(Promise.resolve(runCurrentTimeTool(effectiveMessage)));
  }
  if (surfaceMode === "deep_surf" && needsLiveWeb) {
    directToolIntents.push("web.live");
    tasks.push(runWebLiveLookup(effectiveMessage, {
      secondHop: true,
      synthesisOnly: true,
      forceLookup: orchestratorNeedsLiveWeb,
      categoryHint: orchestratorDecision?.categoryHint || "",
      overrideQuery: orchestratorDecision?.query || ""   // LLM-generated query
    }));
  }

  const settled = await Promise.allSettled(tasks);
  const toolResults = settled.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    const targetName = directToolIntents[index] || `tool.error.${index + 1}`;
    return {
      name: targetName,
      summary: `${friendlyToolLabel(targetName)} tidak tersedia untuk giliran ini.`,
      directReply: ""   // errors become toolContext, not bypassing LLM
    };
  });

  // All results go through LLM — no directReply bypass for tool results
  return {
    toolResults,
    toolContext: formatToolContext(toolResults),
    directReply: "",
    orchestratorDecision
  };
}

module.exports = {
  buildCurrentTimeSystemLine,
  resolveToolContext
};
