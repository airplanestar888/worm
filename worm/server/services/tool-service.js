const { buildCurrentTimeSystemLine, needsCurrentTimeTool, runCurrentTimeTool } = require("../tools/time-tool");
const { classifyLiveIntent, needsWebLiveLookup, runWebLiveLookup } = require("../tools/web-live-tool");

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
    ...results.map((result) => `- [${result.name}] ${result.summary}`),
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
  const directResults = results.filter((result) => result.directReply);
  if (!directResults.length) return "";
  const webLiveResult = directResults.find((result) => result.name === "web.live");
  if (webLiveResult) return webLiveResult.directReply;
  const timeResult = directResults.find((result) => result.name === "time.now");
  if (timeResult) return timeResult.directReply;
  return directResults[0].directReply;
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
  const tasks = [];
  const directToolIntents = [];
  const plainTimeRequest = isPlainTimeRequest(effectiveMessage);
  const needsLiveWeb = needsWebLiveLookup(effectiveMessage) && !plainTimeRequest;
  const shouldRunTimeTool = needsCurrentTimeTool(effectiveMessage) && (plainTimeRequest || !(surfaceMode === "deep_surf" && needsLiveWeb));

  if (surfaceMode === "local" && needsLiveWeb) {
    return {
      toolResults: [{
        name: "web.live",
        summary: "Live web lookup tersedia di Deep Search Beta.",
        directReply: "Untuk data live seperti ini, pindah ke Deep Search Beta dulu ya."
      }],
      toolContext: "",
      directReply: "Untuk data live seperti ini, pindah ke Deep Search Beta dulu ya."
    };
  }

  if (shouldRunTimeTool) {
    directToolIntents.push("time.now");
    tasks.push(Promise.resolve(runCurrentTimeTool(effectiveMessage)));
  }
  if (surfaceMode === "deep_surf" && needsLiveWeb) {
    directToolIntents.push("web.live");
    tasks.push(runWebLiveLookup(effectiveMessage, { secondHop: true, synthesisOnly: true }));
  }

  const settled = await Promise.allSettled(tasks);
  const toolResults = settled.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    const targetName = directToolIntents[index] || `tool.error.${index + 1}`;
    return {
      name: targetName,
      summary: `${friendlyToolLabel(targetName)} tidak tersedia untuk giliran ini.`,
      directReply: targetName === "web.live" && surfaceMode === "deep_surf"
        ? ""
        : directToolIntents.includes(targetName)
        ? friendlyToolFailureReply(targetName)
        : ""
    };
  });

  const directReply = buildDirectToolReply(toolResults);
  const adjustedDirectReply = surfaceMode === "deep_surf" && isRetryFollowup(message)
    ? String(directReply || "").replace(
      /^Saya sudah cek Google News search lanjutan/i,
      "Saya sudah coba cek ulang Google News search lanjutan"
    )
    : directReply;

  return {
    toolResults,
    toolContext: formatToolContext(toolResults),
    directReply: adjustedDirectReply
  };
}

module.exports = {
  buildCurrentTimeSystemLine,
  resolveToolContext
};
