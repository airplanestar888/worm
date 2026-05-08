const axios = require("axios");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
const DEXSCREENER_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json"
};

const DEX_TRIGGER_PATTERN = /\b(dexscreener|dex screener|shady tokens?|top boosted|boosted tokens?|cek token|check token|token address|contract address|pair address)\b/i;
const EVM_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}\b/;
const SOLANA_ADDRESS_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

function normalizeText(message = "") {
  return String(message || "").trim().replace(/\s+/g, " ");
}

function looksLikeDexscreenerUrl(message = "") {
  return /https?:\/\/(?:www\.)?dexscreener\.com\//i.test(String(message || ""));
}

function looksLikeAddress(value = "") {
  const text = String(value || "").trim();
  return EVM_ADDRESS_PATTERN.test(text) || SOLANA_ADDRESS_PATTERN.test(text);
}

function extractDexscreenerPathToken(message = "") {
  const match = String(message || "").match(/https?:\/\/(?:www\.)?dexscreener\.com\/[^\s?#]+/i);
  if (!match) return "";
  const url = match[0];
  const parts = url.split("/").filter(Boolean);
  return String(parts[parts.length - 1] || "").trim();
}

function extractAddress(message = "") {
  const pathToken = extractDexscreenerPathToken(message);
  if (looksLikeAddress(pathToken)) return pathToken;
  const text = String(message || "");
  return text.match(EVM_ADDRESS_PATTERN)?.[0]
    || text.match(SOLANA_ADDRESS_PATTERN)?.[0]
    || "";
}

function extractSearchTerm(message = "") {
  const text = normalizeText(message)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(dexscreener|dex screener|shady tokens?|top boosted|boosted tokens?|cek|check|token|coin|pair|contract|address|on)\b/gi, " ")
    .replace(/[?.,!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function wantsTopBoosted(message = "") {
  return /\b(shady tokens?|top boosted|boosted tokens?|boost scanner|boost check)\b/i.test(String(message || ""));
}

function needsDexscreenerLookup(message = "") {
  const text = String(message || "");
  if (!text.trim()) return false;
  if (looksLikeDexscreenerUrl(text)) return true;
  if (DEX_TRIGGER_PATTERN.test(text)) return true;
  const hasAddress = looksLikeAddress(extractAddress(text));
  const hasContext = /\b(token|coin|pair|contract|ca|address)\b/i.test(text);
  return hasAddress && hasContext;
}

function classifyDexscreenerRequest(message = "") {
  const address = extractAddress(message);
  if (address) return { mode: "token", query: address };
  if (wantsTopBoosted(message)) return { mode: "boosted", query: "" };
  const searchTerm = extractSearchTerm(message);
  if (searchTerm) return { mode: "search", query: searchTerm };
  return { mode: "boosted", query: "" };
}

function formatCompactNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "n/a";
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toFixed(num >= 100 ? 0 : 2)}`;
}

function formatHours(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "n/a";
  if (num < 1) return `${Math.max(1, Math.round(num * 60))}m`;
  return `${num.toFixed(num >= 10 ? 0 : 1)}h`;
}

function riskAssessment(meta = {}) {
  const reasons = [];
  let score = 0;

  if (Number(meta.boostAmount || 0) >= 200) {
    score += 1;
    reasons.push(`boost tinggi ${meta.boostAmount}`);
  }
  if (Number(meta.liquidityUsd || 0) < 10000) {
    score += 2;
    reasons.push("likuiditas tipis");
  } else if (Number(meta.liquidityUsd || 0) < 25000) {
    score += 1;
    reasons.push("likuiditas relatif tipis");
  }
  if (Number(meta.ageHours || 0) < 24) {
    score += 1;
    reasons.push("pair masih sangat baru");
  }
  if (Number(meta.fdvLiquidityRatio || 0) > 8) {
    score += 1;
    reasons.push("FDV/liquidity tinggi");
  }
  if (Number(meta.volumeLiquidityRatio || 0) > 3) {
    score += 1;
    reasons.push("volume/liquidity ekstrem");
  }

  const level = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
  return { score, level, reasons };
}

function hydratePair(pair = {}, boostAmount = 0) {
  const liquidityUsd = Number(pair?.liquidity?.usd || 0);
  const fdv = Number(pair?.fdv || 0);
  const marketCap = Number(pair?.marketCap || 0);
  const volume24h = Number(pair?.volume?.h24 || 0);
  const pairCreatedAt = Number(pair?.pairCreatedAt || 0);
  const ageHours = pairCreatedAt > 0 ? (Date.now() - pairCreatedAt) / 36e5 : 0;
  const fdvLiquidityRatio = liquidityUsd > 0 ? fdv / liquidityUsd : 0;
  const volumeLiquidityRatio = liquidityUsd > 0 ? volume24h / liquidityUsd : 0;
  const risk = riskAssessment({ boostAmount, liquidityUsd, ageHours, fdvLiquidityRatio, volumeLiquidityRatio });

  return {
    chainId: pair?.chainId || "",
    dexId: pair?.dexId || "",
    url: pair?.url || "",
    pairAddress: pair?.pairAddress || "",
    tokenAddress: pair?.baseToken?.address || "",
    symbol: pair?.baseToken?.symbol || "",
    name: pair?.baseToken?.name || "",
    priceUsd: pair?.priceUsd || "",
    liquidityUsd,
    fdv,
    marketCap,
    volume24h,
    buys24h: Number(pair?.txns?.h24?.buys || 0),
    sells24h: Number(pair?.txns?.h24?.sells || 0),
    ageHours,
    boostAmount,
    fdvLiquidityRatio,
    volumeLiquidityRatio,
    risk
  };
}

function buildUrl(path, params = undefined) {
  const url = new URL(`${DEXSCREENER_API_BASE_URL}${path}`);
  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fetchJson(path, params = undefined) {
  const url = buildUrl(path, params);
  try {
    const response = await axios.get(url, {
      timeout: 12000,
      proxy: false,
      headers: DEXSCREENER_HEADERS
    });
    return response.data;
  } catch (error) {
    const { stdout } = await execFileAsync("curl", [
      "-4",
      "-sS",
      "-L",
      "--max-time",
      "20",
      "-A",
      "Mozilla/5.0",
      "-H",
      "Accept: application/json",
      url
    ], { maxBuffer: 3 * 1024 * 1024 });
    return JSON.parse(String(stdout || "null"));
  }
}

function bestPairFromPayload(payload = {}) {
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  return pairs
    .slice()
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0] || null;
}

async function lookupSpecificToken(message = "") {
  const request = classifyDexscreenerRequest(message);
  const payload = request.mode === "token"
    ? await fetchJson(`/latest/dex/tokens/${encodeURIComponent(request.query)}`)
    : await fetchJson("/latest/dex/search", { q: request.query });
  const pair = bestPairFromPayload(payload);
  if (!pair) {
    return {
      name: "dexscreener.lookup",
      summary: "Dexscreener tidak menemukan pair yang cocok.",
      contextText: `Mode: ${request.mode}\nQuery: ${request.query || "n/a"}\nHasil: tidak ada pair yang cocok di Dexscreener.`
    };
  }

  const token = hydratePair(pair, 0);
  const reasons = token.risk.reasons.length ? token.risk.reasons.join(", ") : "tidak ada red flag besar dari rule sederhana";
  return {
    name: "dexscreener.lookup",
    summary: `Dexscreener menemukan ${token.symbol || token.name || token.tokenAddress} di ${token.chainId}; risk ${token.risk.level}.`,
    contextText: [
      `Mode: ${request.mode}`,
      `Query: ${request.query || "n/a"}`,
      `Token: ${token.name || "n/a"} (${token.symbol || "n/a"})`,
      `Chain/Dex: ${token.chainId || "n/a"} / ${token.dexId || "n/a"}`,
      `Token address: ${token.tokenAddress || "n/a"}`,
      `Pair address: ${token.pairAddress || "n/a"}`,
      `Price: ${token.priceUsd ? `$${token.priceUsd}` : "n/a"}`,
      `Liquidity: ${formatCompactNumber(token.liquidityUsd)}`,
      `FDV: ${formatCompactNumber(token.fdv)}`,
      `Market cap: ${formatCompactNumber(token.marketCap)}`,
      `Volume 24h: ${formatCompactNumber(token.volume24h)}`,
      `Age: ${formatHours(token.ageHours)}`,
      `Buys/Sells 24h: ${token.buys24h}/${token.sells24h}`,
      `Risk: ${token.risk.level} (${token.risk.score}) — ${reasons}`,
      `Link: ${token.url || "n/a"}`
    ].join("\n")
  };
}

async function lookupTopBoosted() {
  const boosts = await fetchJson("/token-boosts/top/v1");
  const entries = Array.isArray(boosts) ? boosts.slice(0, 6) : [];
  const results = [];

  for (const entry of entries) {
    try {
      const payload = await fetchJson(`/latest/dex/tokens/${encodeURIComponent(entry.tokenAddress)}`);
      const pair = bestPairFromPayload(payload);
      if (!pair) continue;
      results.push(hydratePair(pair, Number(entry?.totalAmount || 0)));
    } catch (_err) {
      // skip partial failures
    }
  }

  const ranked = results
    .sort((a, b) => {
      if (b.risk.score !== a.risk.score) return b.risk.score - a.risk.score;
      if (b.boostAmount !== a.boostAmount) return b.boostAmount - a.boostAmount;
      return a.liquidityUsd - b.liquidityUsd;
    })
    .slice(0, 5);

  const riskyCount = ranked.filter((item) => item.risk.level !== "low").length;
  return {
    name: "dexscreener.lookup",
    summary: `Dexscreener scan selesai: ${riskyCount} kandidat boosted berisiko dari ${ranked.length || results.length || entries.length} pair teratas.`,
    contextText: [
      "Mode: boosted_scan",
      "Source: Dexscreener top boosts API",
      ...ranked.map((item, index) => `${index + 1}. ${item.symbol || item.name || item.tokenAddress} — risk ${item.risk.level} (${item.risk.score}); chain ${item.chainId}; boost ${item.boostAmount}; liq ${formatCompactNumber(item.liquidityUsd)}; fdv ${formatCompactNumber(item.fdv)}; vol24h ${formatCompactNumber(item.volume24h)}; age ${formatHours(item.ageHours)}; reasons: ${item.risk.reasons.join(", ") || "none"}; link ${item.url}`)
    ].join("\n")
  };
}

async function runDexscreenerLookup(message = "") {
  const request = classifyDexscreenerRequest(message);
  if (request.mode === "boosted") return lookupTopBoosted();
  return lookupSpecificToken(message);
}

module.exports = {
  needsDexscreenerLookup,
  runDexscreenerLookup
};
