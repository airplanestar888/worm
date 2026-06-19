const { buildCurrentTimeSystemLine, needsCurrentTimeTool, runCurrentTimeTool } = require("../tools/time-tool");
const { needsDexscreenerLookup, runDexscreenerLookup } = require("../tools/dexscreener-tool");
const { classifyLiveIntent, needsWebLiveLookup, runWebLiveLookup } = require("../tools/web-live-tool");
const { needsServerDiagnostic, runServerDiagnostic } = require("../tools/server-tool");
const { needsNetworkDiagnostic, runNetworkDiagnostic } = require("../tools/network-tool");
const {
  defaultModelFor,
  isProviderConfigured,
  streamHermesChat,
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
  "stock",
  "technology_news",
  "sports_news",
  "economy_news",
  "general_news",
  "office",
  "person_relation",
  "count",
  "server_status",
  "network"
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
    case "dexscreener.lookup":
      return "data live Dexscreener";
    case "server.status":
      return "status server";
    case "network.check":
      return "diagnostik jaringan";
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
    case "dexscreener.lookup":
      return "Saya belum bisa mengambil data Dexscreener sekarang.";
    default:
      return `Saya belum bisa mengambil ${friendlyToolLabel(name)} sekarang.`;
  }
}

function normalizeOrchestratorDecision(raw = {}) {
  const mode = String(raw?.mode || "").trim().toLowerCase();
  const tool = String(raw?.tool || "").trim().toLowerCase();
  const categoryHint = String(raw?.categoryHint || "").trim().toLowerCase();
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence || 0)));
  const query = String(raw?.query || "").trim();
  const validTools = ["web.live", "time.now", "dexscreener.lookup", "server.status", "network.check", "none"];

  return {
    mode: mode === "live" ? "live" : mode === "local" ? "local" : mode === "diagnostic" ? "diagnostic" : "",
    tool: validTools.includes(tool) ? tool : "",
    categoryHint: ORCHESTRATOR_CATEGORY_HINTS.includes(categoryHint) ? categoryHint : "",
    query,
    confidence,
    reason: String(raw?.reason || "").trim()
  };
}

async function runRoutingOrchestrator(message, options = {}) {
  const provider = String(options.session?.provider || options.provider || "ollama").trim().toLowerCase();
  const model = String(options.session?.model || options.model || defaultModelFor(provider)).trim();
  if (!isProviderConfigured(provider)) return null;

  const currentYear = new Date().getFullYear();
  const heuristicHint = String(options.heuristicHint || "").trim();
  const heuristicLine = heuristicHint === "live"
    ? "Heuristic pre-analysis detected this may need live data. Trust your own judgment but consider this signal."
    : "Heuristic pre-analysis suggests this may be local knowledge. Override if you see live-data intent.";

  const system = [
    "You are a tool-calling router for Worm. Analyze the user message and decide which tool to call.",
    "Return exactly this JSON structure with these keys: mode, tool, query, categoryHint, confidence, reason.",
    "",
    "## mode",
    "- `live` = needs real-time/external data (prices, news, facts, URLs, current info)",
    "- `local` = answerable from model knowledge (math, language, opinion, creative, general chat)",
    "- `diagnostic` = server or network diagnostic (always runs locally on the server)",
    "",
    "## tool",
    "- `none` = no tool needed (local knowledge is sufficient)",
    "- `web.live` = web search for current info (news, prices, facts, people, events, URLs)",
    "- `time.now` = ONLY for pure time/date questions (jam berapa, tanggal berapa, what time)",
    "- `dexscreener.lookup` = specific Solana/ERC20 token or meme coin lookup on Dexscreener",
    "- `server.status` = server diagnostics (CPU, RAM, disk, uptime, processes, open ports)",
    "- `network.check` = network diagnostics (ping, DNS lookup, HTTP check, port check, traceroute, SSL, WHOIS)",
    "",
    "## categoryHint (required when tool != none)",
    "crypto_price, crypto_price_historical, gold_price, staple_price, forex_price, general_price, stock, technology_news, sports_news, economy_news, general_news, office, person_relation, count, server_status, network",
    "",
    "## Decision rules",
    "- IMPORTANT: Only use tools when the request is CLEAR and SPECIFIC. If ambiguous, return tool=none and let the main LLM ask for clarification.",
    "- Ambiguous requests that should return tool=none: 'ping' (no host), 'cek' (no target), 'berapa harga' (no asset), 'bisa ping?' (question, not request).",
    "- Clear requests that should trigger tools: 'ping google.com', 'harga bitcoin', 'cek status server', 'ip address facebook.com'.",
    "",
    "- When in doubt between live and local, prefer live — better to fetch and not need than to miss current data.",
    "- Any question about current prices, rates, news, status, leaders, schedules, scores => live + web.live.",
    "- Historical crypto price (e.g. bitcoin 3 days ago) => live + web.live, categoryHint=crypto_price_historical.",
    "- User includes a URL to read/check/summarize => live + web.live.",
    "- Specific Solana/ERC20 token, contract address, meme coin => live + dexscreener.lookup.",
    "- Pure time/date only (jam, waktu, tanggal) => live + time.now.",
    "- Server status, CPU, RAM, disk, uptime, processes, ports => diagnostic + server.status.",
    "- Network check WITH specific host/domain/IP => diagnostic + network.check.",
    "- Network check WITHOUT specific target => tool=none (let LLM ask for clarification).",
    "- Stable knowledge, math, language, opinion, creative writing, general chat => local + none.",
    "",
    "## query field",
    "- Write a clean, specific search query that will find the answer.",
    `- Include '${currentYear}' for prices, news, and current events.`,
    "- Use Indonesian if user speaks Indonesian, English otherwise.",
    "- For office/leader questions, simplify to role + country/entity (e.g. 'presiden amerika serikat').",
    "- For server/network questions, include the target host/domain/port if mentioned.",
    "- Empty string when tool=none.",
    "",
    "## Commodity hints",
    "telur/cabai/bawang/beras/sembako/sayur => staple_price.",
    "emas/antam/gold => gold_price.",
    "btc/bitcoin/ethereum/solana/crypto => crypto_price.",
    "saham/stock/IDX => stock.",
    "",
    heuristicLine
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
        : provider === "hermes"
          ? await streamHermesChat({ model, messages, mode: "low" })
          : await streamOllamaChat({ model, messages, mode: "low" });
    } catch (error) {
      reject(error);
      return;
    }

    const stream = streamResponse.data;
    const isSse = provider === "nvidia" || provider === "hermes";
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

  // --- Regex heuristics (used as hint for LLM, fallback when LLM unavailable) ---
  const heuristicNeedsLiveWeb = needsWebLiveLookup(effectiveMessage);
  const heuristicNeedsTime = needsCurrentTimeTool(effectiveMessage);
  const heuristicNeedsDexscreener = needsDexscreenerLookup(effectiveMessage);
  const heuristicNeedsServer = needsServerDiagnostic(effectiveMessage);
  const heuristicNeedsNetwork = needsNetworkDiagnostic(effectiveMessage);
  const heuristicSaysLive = heuristicNeedsLiveWeb || heuristicNeedsTime || heuristicNeedsDexscreener;
  const heuristicSaysDiagnostic = heuristicNeedsServer || heuristicNeedsNetwork;

  // --- PASS 1: LLM routing orchestrator (authoritative) ---
  // Always run LLM in deep_surf mode — heuristics are a hint, not a gate.
  const orchestratorDecision = surfaceMode === "deep_surf"
    ? await runRoutingOrchestrator(effectiveMessage, {
        ...options,
        heuristicHint: heuristicSaysLive ? "live" : heuristicSaysDiagnostic ? "diagnostic" : "local"
      }).catch(() => null)
    : null;

  if (orchestratorDecision) {
    console.log(`[orchestrator] tool=${orchestratorDecision.tool} mode=${orchestratorDecision.mode} cat=${orchestratorDecision.categoryHint} conf=${orchestratorDecision.confidence} q="${orchestratorDecision.query}"`);
  } else if (surfaceMode === "deep_surf") {
    console.log(`[orchestrator] LLM unavailable, falling back to regex heuristics`);
  }

  // LLM is authoritative; regex heuristics only as fallback when LLM unavailable
  const orchestratorNeedsLiveWeb = orchestratorDecision
    ? (orchestratorDecision.mode === "live" && orchestratorDecision.tool === "web.live")
    : heuristicNeedsLiveWeb;
  const orchestratorNeedsTime = orchestratorDecision
    ? (orchestratorDecision.tool === "time.now")
    : heuristicNeedsTime;
  const orchestratorNeedsDexscreener = orchestratorDecision
    ? (orchestratorDecision.mode === "live" && orchestratorDecision.tool === "dexscreener.lookup")
    : heuristicNeedsDexscreener;
  const orchestratorNeedsServer = orchestratorDecision
    ? (orchestratorDecision.tool === "server.status")
    : heuristicNeedsServer;
  const orchestratorNeedsNetwork = orchestratorDecision
    ? (orchestratorDecision.tool === "network.check")
    : heuristicNeedsNetwork;

  // Server and network diagnostics always work (no surface mode restriction)
  if (orchestratorNeedsServer || orchestratorNeedsNetwork) {
    const tasks = [];
    const directToolIntents = [];

    if (orchestratorNeedsServer) {
      directToolIntents.push("server.status");
      tasks.push(runServerDiagnostic(effectiveMessage));
    }
    if (orchestratorNeedsNetwork) {
      directToolIntents.push("network.check");
      tasks.push(runNetworkDiagnostic(effectiveMessage));
    }

    const settled = await Promise.allSettled(tasks);
    const toolResults = settled.map((entry, index) => {
      if (entry.status === "fulfilled") return entry.value;
      const targetName = directToolIntents[index] || `tool.error.${index + 1}`;
      const err = entry.status === "rejected" ? entry.reason : null;
      console.warn(`[orchestrator] tool ${targetName} failed: ${err?.message || err}`);
      return {
        name: targetName,
        summary: `${targetName} gagal.`,
        directReply: `Gagal menjalankan ${targetName}: ${err?.message || "Error tidak diketahui"}`
      };
    });

    console.log(`[orchestrator] diagnostic tools executed: [${directToolIntents.join(", ")}]`);

    // Diagnostic tools are always authoritative — bypass LLM
    const primaryResult = toolResults[0];
    return {
      toolResults,
      toolContext: "",
      directReply: primaryResult?.directReply || "",
      orchestratorDecision
    };
  }

  // LLM decided "local + none" and heuristics agree → skip tools entirely
  if (orchestratorDecision && orchestratorDecision.mode === "local" && orchestratorDecision.tool === "none" && !heuristicSaysLive && !heuristicSaysDiagnostic) {
    return {
      toolResults: [],
      toolContext: "",
      directReply: ""
    };
  }

  // No LLM decision and no heuristic signal → skip tools
  if (!orchestratorDecision && !heuristicSaysLive && !heuristicSaysDiagnostic && !followup && !contextualOfficeFollowup) {
    return {
      toolResults: [],
      toolContext: "",
      directReply: ""
    };
  }

  // Always include current time alongside external lookups
  const needsLiveWeb = orchestratorNeedsLiveWeb;
  const needsDexscreener = orchestratorNeedsDexscreener;
  const shouldRunTimeTool = orchestratorNeedsTime || needsLiveWeb || needsDexscreener;

  // Block live web in local surface mode
  if (surfaceMode === "local" && (needsLiveWeb || needsDexscreener)) {
    return {
      toolResults: [],
      toolContext: "",
      directReply: "Untuk data live seperti ini, pindah ke Deep Search Beta dulu ya."
    };
  }

  // Nothing to execute
  if (!shouldRunTimeTool && !needsDexscreener && !needsLiveWeb) {
    return {
      toolResults: [],
      toolContext: "",
      directReply: ""
    };
  }

  // --- PASS 2: Execute tools in parallel ---
  const tasks = [];
  const directToolIntents = [];

  if (shouldRunTimeTool) {
    directToolIntents.push("time.now");
    tasks.push(Promise.resolve(runCurrentTimeTool(effectiveMessage)));
  }
  if (surfaceMode === "deep_surf" && needsDexscreener) {
    directToolIntents.push("dexscreener.lookup");
    tasks.push(runDexscreenerLookup(effectiveMessage));
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
    const err = entry.status === "rejected" ? entry.reason : null;
    console.warn(`[orchestrator] tool ${targetName} failed: ${err?.message || err}`);
    return {
      name: targetName,
      summary: `${friendlyToolLabel(targetName)} tidak tersedia untuk giliran ini.`,
      directReply: ""   // errors become toolContext, not bypassing LLM
    };
  });

  console.log(`[orchestrator] tools executed: [${directToolIntents.join(", ")}] results: ${toolResults.length}`);

  // Check if any tool result has an authoritative directReply that should bypass LLM.
  // This handles cases where the tool already provides a definitive answer
  // (e.g. "season hasn't started", "price is X from CoinGecko").
  // The LLM would otherwise hedge or contradict the tool's authoritative data.
  const authoritativeResult = toolResults.find((result) => {
    if (!result?.directReply?.trim()) return false;
    const score = result?.engine?.score || 0;
    // High-confidence results (CoinGecko, PIHPS, etc.) always authoritative
    if (score >= 0.7) return true;
    // Medium-confidence results with definitive language are authoritative
    if (score >= 0.4 && /belum tersedia|belum dimulai|belum dirilis|tidak ditemukan/i.test(result.directReply)) return true;
    return false;
  });

  if (authoritativeResult) {
    return {
      toolResults,
      toolContext: "",
      directReply: authoritativeResult.directReply,
      orchestratorDecision
    };
  }

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
