const axios = require("axios");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  APP_LOCALE,
  COINGECKO_API_KEY,
  COINGECKO_SIMPLE_PRICE_URL,
  CRYPTO_RSS_URLS,
  GOOGLE_NEWS_RSS_URL,
  JINA_API_KEY,
  JINA_BASE_URL,
  LIVE_RSS_SOURCE_REGISTRY,
  LOGAM_MULIA_PRICE_URL,
  PANEL_HARGA_PANGAN_URL,
  PIHPS_CHART_URL,
  PIHPS_PAGE_URL,
  YAHOO_FINANCE_GOLD_URL
} = require("../config");
const { runCryptoNewsLookup } = require("./crypto-news-tool");
const { parseRelativeDateRequest } = require("./time-tool");
const {
  createSearchProvider,
  createDefaultSearchProviders,
  createDefaultXSearchProviders,
  createDefaultFetchProviders,
  searchWeb,
  xSearch,
  mergePayloads,
  fetchPage,
  extractFirstUrl: extractFirstUrlFromRouter
} = require("../services/web");

const execFileAsync = promisify(execFile);

const LIVE_TRIGGER_KEYWORDS_ID = [
  "terbaru",
  "terkini",
  "saat ini",
  "sekarang",
  "hari ini",
  "barusan",
  "update",
  "cek web",
  "cari di web",
  "cari online",
  "lihat web",
  "browsing",
  "telusuri",
  "berita terbaru",
  "info terbaru",
  "harga sekarang",
  "kondisi sekarang",
  "status terbaru"
];

const LIVE_TRIGGER_KEYWORDS_EN = [
  "latest",
  "current",
  "right now",
  "now",
  "today",
  "recent",
  "update",
  "web search",
  "search the web",
  "browse",
  "look it up",
  "online",
  "current status",
  "latest news",
  "live update",
  "real-time",
  "current price"
];

const LIVE_MODE_TRIGGER_PHRASES = [
  "cari di web",
  "cek web",
  "cari online",
  "lihat web",
  "telusuri",
  "web search",
  "search the web",
  "browse",
  "browsing",
  "look it up"
];

const DIRECT_URL_TRIGGER_PHRASES = [
  ...LIVE_MODE_TRIGGER_PHRASES,
  "cek",
  "lihat",
  "profil",
  "profile",
  "baca",
  "ringkas",
  "rangkum",
  "resume",
  "summarize",
  "summary",
  "analisa",
  "analisis",
  "review",
  "inspect",
  "open url",
  "buka url",
  "url ini",
  "halaman ini",
  "website ini",
  "isi halaman",
  "isi website"
];

const LIVE_TIME_TRIGGER_PHRASES = [
  "latest",
  "current",
  "today",
  "right now",
  "terbaru",
  "saat ini",
  "sekarang",
  "hari ini",
  "terkini",
  "barusan",
  "recent",
  "now",
  "real-time",
  "live update",
  "update"
];

const LIVE_DATA_KEYWORDS = [
  "price",
  "harga",
  "rate",
  "kurs",
  "berapa",
  "nilai",
  "value",
  "market cap",
  "marketcap",
  "volume",
  "news",
  "berita",
  "headline",
  "weather",
  "cuaca",
  "score",
  "skor",
  "status"
];

const LIVE_LINK_KEYWORDS = [
  "link",
  "sumber",
  "streaming",
  "live streaming",
  "siaran langsung",
  "nonton",
  "watch",
  "schedule",
  "jadwal",
  "kickoff",
  "kick-off"
];

const LIVE_PRICE_KEYWORDS = [
  "harga",
  "price",
  "rate",
  "kurs",
  "current price"
];

const LIVE_ENTITY_KEYWORDS = [
  "bitcoin",
  "btc",
  "ethereum",
  "etherium",
  "eth",
  "solana",
  "bnb",
  "xrp",
  "doge",
  "dogecoin",
  "cardano",
  "ada",
  "crypto",
  "coin",
  "gold",
  "emas",
  "xau",
  "usd",
  "idr",
  "rupiah",
  "dollar",
  "dolar",
  "stock",
  "saham",
  "forex"
];

const LIVE_SPORTS_KEYWORDS = [
  "persib",
  "persija",
  "persebaya",
  "arema",
  "bali united",
  "psm",
  "liga 1",
  "bri liga 1",
  "sepak bola",
  "football",
  "soccer"
];

const LIVE_SPORTS_SIGNAL_KEYWORDS = [
  "hasil pertandingan",
  "hasil laga",
  "jadwal",
  "schedule",
  "fixture",
  "kickoff",
  "kick-off",
  "score",
  "skor",
  "klasemen",
  "standings",
  "standing",
  "match"
];

const LIVE_PRODUCT_KEYWORDS = [
  "chatgpt",
  "openai",
  "plus",
  "pro",
  "business",
  "enterprise",
  "team",
  "go"
];

const LIVE_COMMODITY_KEYWORDS = [
  "tomat",
  "cabai",
  "cabe",
  "bawang",
  "bawang merah",
  "bawang putih",
  "beras",
  "telur",
  "ayam",
  "daging",
  "daging sapi",
  "daging ayam",
  "gula",
  "minyak",
  "minyak goreng",
  "sayur",
  "pangan",
  "sembako",
  "kentang",
  "wortel",
  "pertamax",
  "pertalite",
  "biosolar",
  "solar",
  "dexlite",
  "pertamax turbo",
  "pertamina",
  "bbm",
  "bensin"
];

const LIVE_VEHICLE_KEYWORDS = [
  "honda",
  "yamaha",
  "suzuki",
  "kawasaki",
  "toyota",
  "daihatsu",
  "mitsubishi",
  "hyundai",
  "wuling",
  "nissan",
  "beat",
  "beat street",
  "vario",
  "scoopy",
  "scopy",
  "pcx",
  "nmax",
  "aerox",
  "lexi",
  "avanza",
  "xenia",
  "brio",
  "mobil",
  "motor",
  "moge"
];

const LIVE_OFFICE_KEYWORDS = [
  "siapa",
  "who is",
  "wakil presiden",
  "vice president",
  "vp",
  "presiden",
  "president",
  "perdana menteri",
  "prime minister",
  "pm",
  "ceo",
  "governor",
  "gubernur",
  "menteri",
  "minister",
  "secretary",
  "sekretaris",
  "defense",
  "pertahanan",
  "perang",
  "ratu",
  "queen",
  "raja",
  "king",
  "monarch"
];

const LIVE_PERSON_RELATION_KEYWORDS = [
  "istri",
  "suami",
  "pasangan",
  "anak",
  "ayah",
  "ibu",
  "keluarga",
  "wife",
  "husband",
  "spouse",
  "partner",
  "children",
  "child",
  "father",
  "mother",
  "family"
];

const LIVE_COUNT_KEYWORDS = ["berapa jumlah", "jumlah", "how many", "count", "total"];
const LIVE_ADMIN_KEYWORDS = ["provinsi", "province", "state", "kabupaten", "regency", "kota", "city", "pulau", "island", "ministry", "kementerian"];
const CASUAL_FILLER_WORDS = [
  "bro",
  "bruh",
  "sis",
  "gan",
  "bang",
  "bos",
  "boss",
  "om",
  "min",
  "admin",
  "kak",
  "mas",
  "mbak",
  "pak",
  "bu",
  "ente",
  "antum",
  "ana",
  "gue",
  "gua",
  "lu",
  "lo",
  "dong",
  "nih",
  "ya",
  "yaudah",
  "tau",
  "tahu",
  "mau",
  "pengen",
  "pingin",
  "cek",
  "cari",
  "lihat",
  "tolong",
  "please",
  "pls"
];

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(text, phrase) {
  const pattern = new RegExp(`(^|\\b)${escapeRegex(phrase).replace(/\\ /g, "\\s+")}(\\b|$)`, "i");
  return pattern.test(text);
}

function hasAnyPhrase(text, phrases) {
  return phrases.some((phrase) => hasPhrase(text, phrase));
}

function stripPhrases(text, phrases) {
  let result = String(text || "");
  for (const phrase of phrases) {
    const pattern = new RegExp(`(^|\\b)${escapeRegex(phrase).replace(/\\ /g, "\\s+")}(\\b|$)`, "ig");
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

function stripCasualFillers(text) {
  let result = String(text || "");
  for (const word of CASUAL_FILLER_WORDS) {
    const pattern = new RegExp(`(^|[\\s,.;:!?\\\\])${escapeRegex(word)}(?=$|[\\s,.;:!?\\\\])`, "ig");
    result = result.replace(pattern, "$1");
  }
  return result
    .replace(/[\\]+$/g, "")
    .replace(/\s+([?!.])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeSearchQueryText(message) {
  const normalized = normalizeSearchText(message);
  const stripped = stripPhrases(normalized, [...LIVE_MODE_TRIGGER_PHRASES, ...LIVE_TIME_TRIGGER_PHRASES]);
  const casualStripped = stripCasualFillers(stripped.length >= 3 ? stripped : normalized);
  return (casualStripped.length >= 3 ? casualStripped : normalized).trim();
}

function isStockQuery(message) {
  const original = String(message || "");
  const lower = normalizeSearchText(message).toLowerCase();
  return /\b(saham|stock|ticker|idx)\b/.test(lower)
    || /\b([A-Z]{4,5})\b/.test(original)
    || (/\b[a-z]{4,5}\b/.test(lower) && /\b(itu saham apa|saham apa|kode saham apa|what stock)\b/.test(lower));
}

function normalizeSearchText(message) {
  return String(message || "")
    .trim()
    .replace(/\bchat\s*gpt\b/gi, "chatgpt")
    .replace(/\betherium\b/gi, "ethereum")
    .replace(/\bbtc\b/gi, "bitcoin")
    .replace(/\beth\b/gi, "ethereum")
    .replace(/\bmentri\b/gi, "menteri")
    .replace(/\bkabutpaten\b/gi, "kabupaten")
    .replace(/\bjawabarat\b/gi, "jawa barat")
    .replace(/\bjawatimur\b/gi, "jawa timur")
    .replace(/\bjawatengah\b/gi, "jawa tengah")
    .replace(/\bamerika\b(?!\s+serikat)/gi, "amerika serikat");
}

function extractFirstUrl(message = "") {
  return extractFirstUrlFromRouter(message);
}

function shouldFetchDirectUrl(message = "") {
  const text = normalizeSearchText(message).toLowerCase();
  const url = extractFirstUrl(message);
  if (!url) return false;
  return /^https?:\/\//i.test(String(message || "").trim()) || hasAnyPhrase(text, DIRECT_URL_TRIGGER_PHRASES);
}

function detectLiveIntent(message) {
  const text = normalizeSearchText(message).toLowerCase();
  if (!text) {
    return {
      shouldLookup: false,
      reason: "empty"
    };
  }

  const hasUrl = /https?:\/\//i.test(text);
  if (hasUrl) {
    return {
      shouldLookup: shouldFetchDirectUrl(message),
      reason: shouldFetchDirectUrl(message) ? "direct_url" : "url"
    };
  }

  const hasModeTrigger = hasAnyPhrase(text, LIVE_MODE_TRIGGER_PHRASES);
  const hasTemporalIntent = hasAnyPhrase(text, [...LIVE_TIME_TRIGGER_PHRASES, ...LIVE_TRIGGER_KEYWORDS_ID, ...LIVE_TRIGGER_KEYWORDS_EN]);
  const hasDataIntent = hasAnyPhrase(text, LIVE_DATA_KEYWORDS);
  const hasLinkIntent = hasAnyPhrase(text, LIVE_LINK_KEYWORDS);
  const hasPriceIntent = hasAnyPhrase(text, LIVE_PRICE_KEYWORDS);
  const hasEntity = hasAnyPhrase(text, [...LIVE_ENTITY_KEYWORDS, ...LIVE_PRODUCT_KEYWORDS]);
  const hasSportsEntity = hasAnyPhrase(text, LIVE_SPORTS_KEYWORDS);
  const hasCommodity = hasAnyPhrase(text, LIVE_COMMODITY_KEYWORDS);
  const hasVehicle = hasAnyPhrase(text, LIVE_VEHICLE_KEYWORDS);
  const hasSportsSignal = hasAnyPhrase(text, LIVE_SPORTS_SIGNAL_KEYWORDS)
    || /\b(hasil|laga|pertandingan|klasemen)\b/.test(text);
  const hasOfficeIntent = hasAnyPhrase(text, LIVE_OFFICE_KEYWORDS);
  const hasPersonRelationIntent = hasAnyPhrase(text, LIVE_PERSON_RELATION_KEYWORDS);
  const hasCountIntent = hasAnyPhrase(text, LIVE_COUNT_KEYWORDS);
  const hasAdminEntity = hasAnyPhrase(text, LIVE_ADMIN_KEYWORDS);
  const hasStockIntent = isStockQuery(message);
  const hasGoldIntent = isGoldQuery(message);
  const hasHistoricalCryptoIntent = isHistoricalCryptoPriceQuery(message);
  const queryKind = detectQueryKind(message);
  const hasNewsStyleIntent = ["sports", "technology_news", "economy_news", "general_news"].includes(queryKind);

  const shouldLookup = Boolean(
    hasHistoricalCryptoIntent
    || hasModeTrigger
    || hasLinkIntent
    || hasPriceIntent
    || hasGoldIntent
    || hasStockIntent
    || hasOfficeIntent
    || hasPersonRelationIntent
    || (hasCountIntent && hasAdminEntity)
    || (hasTemporalIntent && (hasDataIntent || hasLinkIntent || hasEntity || hasSportsEntity || hasCommodity || hasVehicle || hasAdminEntity))
    || (hasDataIntent && hasCommodity)
    || (hasDataIntent && hasVehicle)
    || (hasDataIntent && hasEntity)
    || (hasDataIntent && hasSportsEntity)
    || (hasSportsEntity && hasSportsSignal)
    || (hasNewsStyleIntent && (hasDataIntent || hasTemporalIntent || hasLinkIntent || hasSportsSignal))
  );

  return {
    shouldLookup,
    reason: shouldLookup ? "matched" : "no_match",
    flags: {
      hasModeTrigger,
      hasTemporalIntent,
      hasDataIntent,
      hasLinkIntent,
      hasPriceIntent,
      hasEntity,
      hasSportsEntity,
      hasSportsSignal,
      hasCommodity,
      hasVehicle,
      hasOfficeIntent,
      hasPersonRelationIntent,
      hasCountIntent,
      hasAdminEntity,
      hasStockIntent,
      hasGoldIntent,
      hasHistoricalCryptoIntent
    }
  };
}

function needsWebLiveLookup(message) {
  return detectLiveIntent(message).shouldLookup;
}

function isCryptoQuery(message) {
  const text = normalizeSearchText(message).toLowerCase();
  return /\b(bitcoin|ethereum|solana|bnb|xrp|doge|dogecoin|cardano|crypto|coin|btc|eth|ada)\b/.test(text);
}

function buildHistoricalDateContext(message, now = new Date()) {
  const relative = parseRelativeDateRequest(message, now);
  if (!relative || !Number.isFinite(relative.amount) || relative.amount >= 0) return null;

  const baseDate = relative.baseDate || now;
  const targetDate = new Date(baseDate.getTime() + relative.amount * 24 * 60 * 60 * 1000);
  if (Number.isNaN(targetDate.getTime())) return null;

  const idLabel = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(targetDate);
  const enLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(targetDate);
  const isoLabel = targetDate.toISOString().slice(0, 10);
  const day = String(targetDate.getUTCDate()).padStart(2, "0");
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const year = String(targetDate.getUTCFullYear());

  return {
    relative,
    targetDate,
    displayLabel: idLabel,
    searchTerms: [...new Set([
      idLabel,
      enLabel,
      isoLabel,
      `${day}-${month}-${year}`,
      `${month}/${day}/${year}`,
      `${day}/${month}/${year}`
    ])],
    coingeckoDate: `${day}-${month}-${year}`
  };
}

function isHistoricalCryptoPriceQuery(message) {
  return isCryptoQuery(message) && Boolean(buildHistoricalDateContext(message));
}

function hasHistoricalDateMatch(text, message) {
  const context = buildHistoricalDateContext(message);
  if (!context) return true;
  const haystack = normalizeSearchText(text).toLowerCase();
  return context.searchTerms.some((term) => haystack.includes(normalizeSearchText(term).toLowerCase()));
}

function isGoldQuery(message) {
  const text = normalizeSearchText(message).toLowerCase();
  return /\b(emas|gold|xau|antam|logam mulia)\b/.test(text);
}

function isStapleFoodQuery(message) {
  const text = normalizeSearchText(message).toLowerCase();
  return /\b(tomat|cabai|cabe|bawang|beras|telur|ayam|daging|gula|minyak|minyak goreng|sayur|sayuran|pangan|sembako|kentang|wortel)\b/.test(text);
}

const PIHPS_COMMODITY_DEFINITIONS = [
  { name: "Bawang Merah Ukuran Sedang", aliases: ["bawang merah", "bw merah"] },
  { name: "Bawang Putih Ukuran Sedang", aliases: ["bawang putih", "bw putih"] },
  { name: "Cabai Merah Keriting ", aliases: ["cabai", "cabe", "cabai merah", "cabai keriting", "cabe merah", "cabe keriting"] },
  { name: "Cabai Rawit Merah", aliases: ["cabai rawit", "cabe rawit", "rawit merah", "cabai rawit merah"] },
  { name: "Beras Kualitas Medium I", aliases: ["beras", "beras medium"] },
  { name: "Telur Ayam Ras Segar", aliases: ["telur", "telur ayam", "telor", "telor ayam"] },
  { name: "Daging Ayam Ras Segar", aliases: ["ayam", "daging ayam"] },
  { name: "Daging Sapi Kualitas 1", aliases: ["daging", "daging sapi", "sapi"] },
  { name: "Gula Pasir Lokal", aliases: ["gula", "gula pasir"] },
  { name: "Minyak Goreng Curah", aliases: ["minyak", "minyak goreng"] },
  { name: "Kentang", aliases: ["kentang"] },
  { name: "Wortel", aliases: ["wortel"] }
];

function detectPihpsCommodity(message) {
  const text = normalizeSearchText(message).toLowerCase();
  return PIHPS_COMMODITY_DEFINITIONS.find((item) => item.aliases.some((alias) => text.includes(alias))) || null;
}

const COINGECKO_ASSETS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", aliases: ["bitcoin", "btc"] },
  { id: "ethereum", symbol: "ETH", name: "Ethereum", aliases: ["ethereum", "etherium", "eth"] },
  { id: "solana", symbol: "SOL", name: "Solana", aliases: ["solana", "sol"] },
  { id: "binancecoin", symbol: "BNB", name: "BNB", aliases: ["bnb", "binance coin", "binancecoin"] },
  { id: "ripple", symbol: "XRP", name: "XRP", aliases: ["xrp", "ripple"] },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", aliases: ["doge", "dogecoin"] },
  { id: "cardano", symbol: "ADA", name: "Cardano", aliases: ["cardano", "ada"] },
  { id: "tether", symbol: "USDT", name: "Tether", aliases: ["tether", "usdt"] },
  { id: "usd-coin", symbol: "USDC", name: "USDC", aliases: ["usdc", "usd coin"] }
];

function detectCryptoAssets(message) {
  const text = normalizeSearchText(message).toLowerCase();
  const matches = [];
  for (const asset of COINGECKO_ASSETS) {
    if (asset.aliases.some((alias) => hasPhrase(text, alias))) {
      matches.push(asset);
    }
  }
  return [...new Map(matches.map((asset) => [asset.id, asset])).values()];
}

function detectCryptoCurrencies(message) {
  const text = normalizeSearchText(message).toLowerCase();
  const currencies = [];
  if (/\b(idr|rupiah|rp)\b/.test(text)) currencies.push("idr");
  if (/\b(usd|dollar|dolar)\b|\$/.test(text)) currencies.push("usd");
  if (!currencies.length) currencies.push("usd", "idr");
  if (!currencies.includes("usd")) currencies.push("usd");
  return [...new Set(currencies)];
}

function formatCryptoCurrency(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  const locale = currency === "idr" ? "id-ID" : "en-US";
  const options = {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: currency === "idr" ? 0 : amount >= 1 ? 2 : 6
  };
  return new Intl.NumberFormat(locale, options).format(amount);
}

function formatCryptoUpdatedAt(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.DateTimeFormat(APP_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value * 1000));
}

function formatCryptoPriceReply(lines, message) {
  const isIndonesian = /\b(harga|berapa|rupiah|hari ini|sekarang|saat ini)\b/i.test(message);
  const body = lines.map((line) => {
    const prices = line.prices.map((item) => item.text).filter(Boolean).join(" / ");
    const change = Number.isFinite(line.change24h)
      ? `, 24 jam ${line.change24h >= 0 ? "+" : ""}${line.change24h.toFixed(2)}%`
      : "";
    return `${line.name} (${line.symbol}) sekarang sekitar ${prices}${change}.`;
  }).join("\n");

  const updated = lines.find((line) => line.updatedAt)?.updatedAt || "";
  return isIndonesian
    ? `${body}${updated ? `\nSumber: CoinGecko, ${updated}.` : "\nSumber: CoinGecko."}`
    : `${body}${updated ? `\nSource: CoinGecko, ${updated}.` : "\nSource: CoinGecko."}`;
}

function formatHistoricalCryptoPriceReply(lines, message, context) {
  const isIndonesian = /\b(harga|berapa|rupiah|hari ini|sekarang|saat ini|lalu)\b/i.test(message);
  const body = lines.map((line) => {
    const prices = line.prices.map((item) => item.text).filter(Boolean).join(" / ");
    return `${line.name} (${line.symbol}) pada ${context.displayLabel} sekitar ${prices}.`;
  }).join("\n");

  return isIndonesian
    ? `${body}\nSumber: CoinGecko historical data, ${context.displayLabel}.`
    : `${body}\nSource: CoinGecko historical data for ${context.displayLabel}.`;
}

async function fetchCoinGeckoCryptoPrice(client, message) {
  const assets = detectCryptoAssets(message);
  if (!assets.length) return null;

  const currencies = detectCryptoCurrencies(message);
  const headers = { Accept: "application/json" };
  if (COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;

  const response = await client.get(COINGECKO_SIMPLE_PRICE_URL, {
    headers,
    params: {
      ids: assets.map((asset) => asset.id).join(","),
      vs_currencies: currencies.join(","),
      include_24hr_change: "true",
      include_last_updated_at: "true"
    }
  });

  const lines = assets
    .map((asset) => {
      const item = response.data?.[asset.id] || {};
      const prices = currencies
        .map((currency) => ({
          currency,
          text: formatCryptoCurrency(item[currency], currency)
        }))
        .filter((entry) => entry.text);

      if (!prices.length) return null;
      return {
        symbol: asset.symbol,
        name: asset.name,
        prices,
        change24h: Number(item[`${currencies[0]}_24h_change`]),
        updatedAt: formatCryptoUpdatedAt(item.last_updated_at)
      };
    })
    .filter(Boolean);

  if (!lines.length) return null;

  const directReply = formatCryptoPriceReply(lines, message);
  return {
    name: "web.live",
    summary: [
      "CoinGecko crypto price data:",
      ...lines.map((line) => {
        const prices = line.prices.map((item) => `${item.currency.toUpperCase()} ${item.text}`).join(", ");
        const change = Number.isFinite(line.change24h) ? `, 24h ${line.change24h.toFixed(2)}%` : "";
        return `${line.symbol} (${line.name}): ${prices}${change}${line.updatedAt ? `, updated ${line.updatedAt}` : ""}.`;
      })
    ].join("\n"),
    directReply
  };
}

async function fetchCoinGeckoHistoricalCryptoPrice(client, message) {
  const context = buildHistoricalDateContext(message);
  const assets = detectCryptoAssets(message);
  if (!context || !assets.length) return null;

  const currencies = detectCryptoCurrencies(message);
  const headers = { Accept: "application/json" };
  if (COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
  const baseUrl = String(COINGECKO_SIMPLE_PRICE_URL || "https://api.coingecko.com/api/v3/simple/price").replace(/\/simple\/price.*$/i, "");

  const settled = await Promise.allSettled(
    assets.map(async (asset) => {
      const response = await client.get(`${baseUrl}/coins/${asset.id}/history`, {
        headers,
        params: {
          date: context.coingeckoDate,
          localization: "false"
        }
      });
      return {
        asset,
        data: response.data || {}
      };
    })
  );

  const lines = settled
    .filter((entry) => entry.status === "fulfilled")
    .map((entry) => {
      const asset = entry.value.asset;
      const prices = currencies
        .map((currency) => ({
          currency,
          text: formatCryptoCurrency(entry.value.data?.market_data?.current_price?.[currency], currency)
        }))
        .filter((item) => item.text);

      if (!prices.length) return null;
      return {
        symbol: asset.symbol,
        name: asset.name,
        prices
      };
    })
    .filter(Boolean);

  if (!lines.length) return null;

  return {
    name: "web.live",
    summary: [
      `CoinGecko historical crypto price data for ${context.displayLabel}:`,
      ...lines.map((line) => {
        const prices = line.prices.map((item) => `${item.currency.toUpperCase()} ${item.text}`).join(", ");
        return `${line.symbol} (${line.name}): ${prices}.`;
      })
    ].join("\n"),
    directReply: formatHistoricalCryptoPriceReply(lines, message, context)
  };
}

function formatRupiahNumber(value = "") {
  const digits = String(value || "").replace(/[^\d]/g, "").trim();
  if (!digits) return "";
  return `Rp ${new Intl.NumberFormat("id-ID").format(Number(digits))}`;
}

function formatUsdNumber(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}

function formatPihpsDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(APP_LOCALE, { dateStyle: "medium" }).format(date);
}

function buildJinaUrl(url) {
  const normalizedBase = String(JINA_BASE_URL || "https://r.jina.ai/http://").trim();
  if (!url) return normalizedBase;
  if (/^https?:\/\//i.test(url)) {
    return `${normalizedBase}${url.replace(/^https?:\/\//i, "")}`;
  }
  return `${normalizedBase}${url}`;
}

async function fetchViaJina(url, { accept = "*/*" } = {}) {
  if (!JINA_API_KEY) {
    throw new Error("Jina API key not configured.");
  }
  const response = await axios.get(buildJinaUrl(url), {
    timeout: 20000,
    proxy: false,
    responseType: "text",
    headers: {
      Accept: accept || "*/*",
      Authorization: `Bearer ${JINA_API_KEY}`,
      "User-Agent": "Mozilla/5.0"
    }
  });
  return String(response?.data || "");
}

async function fetchWithCurl(url, { referer = "", accept = "*/*" } = {}) {
  const args = ["-sS", "-L", "--max-time", "20", "-A", "Mozilla/5.0", "-H", `Accept: ${accept}`];
  if (referer) {
    args.push("-e", referer);
  }
  args.push(url);
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 2 * 1024 * 1024 });
    return String(stdout || "");
  } catch (error) {
    if (!JINA_API_KEY) throw error;
    return fetchViaJina(url, { accept });
  }
}

function cleanFetchedUrlContent(raw = "") {
  return String(raw || "")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^Title:\s*/im, "Judul: ")
    .replace(/^URL Source:\s*/gim, "Sumber URL: ")
    .replace(/^Markdown Content:\s*$/gim, "")
    .replace(/^\s*\/html\b.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDirectUrlContext(raw = "") {
  const cleaned = cleanFetchedUrlContent(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Sumber URL:/i.test(line))
    .filter((line) => !/^!\[.*\]\(.*\)$/.test(line))
    .filter((line) => !/^\[!\[.*\]\(.*\)\]\(.*\)$/.test(line))
    .filter((line) => !/^blob:http/i.test(line));

  return cleaned.join("\n").slice(0, 5000).trim();
}

async function fetchDirectUrlContent(message = "") {
  const url = extractFirstUrl(message);
  if (!url) return null;
  const fetchProviders = createDefaultFetchProviders();
  const page = await fetchPage(url, {
    extractMode: "text",
    maxChars: 5000,
    cacheTtlMs: 15 * 60 * 1000,
    primaryProviders: fetchProviders.primaryProviders,
    fallbackProviders: fetchProviders.fallbackProviders
  });
  const host = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();
  const contextText = String(page?.content || "").trim();
  const errorCode = String(page?.error?.code || "").trim();
  return {
    name: "web.live",
    summary: contextText
      ? `Fetched direct URL via ${page.provider || "web"} for ${host}. Use the fetched page content to answer the user's actual request, not by echoing raw excerpts.`
      : `Direct URL fetch for ${host} did not return usable content${errorCode ? ` (${errorCode})` : ""}.`,
    contextText,
    directReply: contextText
      ? ""
      : errorCode === "BROWSER_REQUIRED"
        ? `Halaman ${host} kebaca JS-heavy / protected. Fetch biasa jangan dipaksa; perlu extractor lain atau browser flow.`
        : `Saya belum berhasil ambil isi dari ${host}.`,
    passToModel: Boolean(contextText),
    engine: { score: contextText ? 1 : 0, evidence: [{ sourceLabel: page.provider || "web", confidence: contextText ? 1 : 0.2 }] }
  };
}

async function fetchPihpsCommodityPrice(message) {
  const commodity = detectPihpsCommodity(message);
  if (!commodity) return null;

  const pageHtml = await fetchWithCurl(PIHPS_PAGE_URL, { referer: PIHPS_PAGE_URL, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" });
  const tempMatch = pageHtml.match(/id="temp_id"[^>]*value="([^"]+)"/i);
  const tempId = String(tempMatch?.[1] || "").trim();
  if (!tempId) return null;

  const chartUrl = `${PIHPS_CHART_URL}?tempId=${encodeURIComponent(tempId)}&comName=${encodeURIComponent(commodity.name)}`;
  const raw = await fetchWithCurl(chartUrl, { referer: PIHPS_PAGE_URL, accept: "application/json,text/plain,*/*" });
  const payload = JSON.parse(raw || "{}");
  const points = Array.isArray(payload?.data) ? payload.data : [];
  const latest = [...points].reverse().find((item) => Number.isFinite(Number(item?.nominal)));
  if (!latest) return null;

  const nominal = Number(latest.nominal);
  const unit = String(latest.denomination || "kg").trim();
  const formattedNominal = `Rp ${new Intl.NumberFormat("id-ID").format(nominal)}`;
  const formattedDate = formatPihpsDate(latest.date);
  const nationalLabel = /\b(di|daerah|provinsi|kota|kabupaten|bandung|jakarta|jabar|jatim|jateng|surabaya|bogor|depok|bekasi)\b/i.test(normalizeSearchText(message))
    ? "Saya baru nemu angka rata-rata nasional dari PIHPS, belum angka daerah spesifik."
    : "";

  return {
    name: "web.live",
    summary: [
      "Portal harga pangan resmi:",
      `PIHPS Nasional / BI ${commodity.name}: ${formattedNominal} per ${unit}${formattedDate ? `, data ${formattedDate}` : ""}.`,
      `Panel Harga Pangan tersedia sebagai fallback portal: ${PANEL_HARGA_PANGAN_URL}`,
      nationalLabel
    ].filter(Boolean).join("\n"),
    directReply: [
      `Harga ${commodity.name.toLowerCase()} sekarang sekitar ${formattedNominal}/${unit}.`,
      nationalLabel,
      `Sumber: PIHPS Nasional / BI${formattedDate ? `, ${formattedDate}` : ""}.`
    ].filter(Boolean).join(" ")
  };
}

async function fetchPanelHargaPanganPortal() {
  const html = await fetchWithCurl(PANEL_HARGA_PANGAN_URL, {
    referer: PANEL_HARGA_PANGAN_URL,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  }).catch(() => "");
  if (!/Panel Harga Pangan/i.test(html)) return null;
  return {
    name: "web.live",
    summary: `Portal fallback harga pangan tersedia: Panel Harga Pangan (${PANEL_HARGA_PANGAN_URL}).`,
    directReply: ""
  };
}

async function fetchLogamMuliaGoldPrice(client, message) {
  if (!isGoldQuery(message)) return null;

  const response = await client.get(LOGAM_MULIA_PRICE_URL);
  const html = String(response.data || "");
  const dateMatch = html.match(/Harga Emas Hari Ini,\s*([^<]+)/i);
  const updateMatch = html.match(/Harga di-update setiap hari[^<]+/i);
  const oneGramMatch = html.match(/<td>1 gr<\/td>[\s\S]{0,250}?<td[^>]*style="text-align:right;">([^<]+)<\/td>/i);
  const halfGramMatch = html.match(/<td>0\.5 gr<\/td>[\s\S]{0,250}?<td[^>]*style="text-align:right;">([^<]+)<\/td>/i);

  if (!oneGramMatch?.[1]) return null;

  const oneGram = formatRupiahNumber(oneGramMatch[1]);
  const halfGram = formatRupiahNumber(halfGramMatch?.[1] || "");
  const dateLabel = String(dateMatch?.[1] || "").trim();
  const updateLabel = String(updateMatch?.[0] || "").replace(/\s+/g, " ").trim();

  const directReply = [
    `Harga emas Antam 1 gram sekarang sekitar ${oneGram}.`,
    halfGram ? `Untuk 0,5 gram sekitar ${halfGram}.` : "",
    `Sumber: Logam Mulia${dateLabel ? `, ${dateLabel}` : ""}${updateLabel ? ` · ${updateLabel}` : ""}.`
  ].filter(Boolean).join(" ");

  return {
    name: "web.live",
    summary: [
      "Portal harga emas resmi:",
      `Logam Mulia Antam 1 gr: ${oneGram}${halfGram ? `, 0.5 gr: ${halfGram}` : ""}${dateLabel ? `, tanggal ${dateLabel}` : ""}${updateLabel ? `, ${updateLabel}` : ""}.`
    ].join("\n"),
    directReply
  };
}

async function fetchYahooFinanceGoldPrice(client, message) {
  if (!isGoldQuery(message)) return null;

  const response = await client.get(YAHOO_FINANCE_GOLD_URL, {
    headers: { Accept: "application/json" }
  });
  const meta = response.data?.chart?.result?.[0]?.meta || {};
  const price = formatUsdNumber(meta.regularMarketPrice);
  if (!price) return null;

  const updatedAt = Number(meta.regularMarketTime)
    ? new Intl.DateTimeFormat(APP_LOCALE, { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(meta.regularMarketTime) * 1000))
    : "";
  const symbol = meta.symbol || "GC=F";

  return {
    name: "web.live",
    summary: [
      "Portal harga market:",
      `Yahoo Finance ${symbol}: ${price}${updatedAt ? `, updated ${updatedAt}` : ""}.`
    ].join("\n"),
    directReply: `Harga gold futures sekarang sekitar ${price}.${updatedAt ? ` Sumber: Yahoo Finance, ${updatedAt}.` : " Sumber: Yahoo Finance."}`
  };
}

function cleanLiveQuery(message) {
  return sanitizeSearchQueryText(message);
}

function buildSearchQuery(message) {
  const queryText = cleanLiveQuery(message);
  const lower = queryText.toLowerCase();
  const commodity = extractCommodityLabel(message);
  const location = extractLocationLabel(message);
  const historicalContext = buildHistoricalDateContext(message);

  if (isHistoricalCryptoPriceQuery(message) && historicalContext) {
    const assetNames = detectCryptoAssets(message).map((asset) => asset.name).join(" ") || queryText;
    return `${assetNames} price ${historicalContext.displayLabel}`.trim();
  }

  if (/\b(vice president|wakil presiden|vp|president|presiden|prime minister|perdana menteri|ceo|governor|gubernur|minister|menteri|secretary|sekretaris|defense|pertahanan|perang|queen|ratu|king|raja|monarch)\b/.test(lower)) {
    return queryText.replace(/^\s*(siapa|who is)\s+/i, "").trim();
  }

  if (hasAnyPhrase(lower, LIVE_PERSON_RELATION_KEYWORDS)) {
    return queryText.replace(/^\s*(siapa|who is)\s+/i, "").trim();
  }

  if (/\b(berapa jumlah|jumlah|how many|count|total)\b/.test(lower) && /\b(provinsi|province|state|kabupaten|regency|kota|city|pulau|island)\b/.test(lower)) {
    return queryText;
  }

  if (/\b(bitcoin|ethereum|solana|bnb|xrp|doge|dogecoin|cardano|ada|crypto|coin)\b/.test(lower)) {
    return queryText;
  }

  if (/\b(gold|emas|xau)\b/.test(lower)) {
    return queryText;
  }

  if (/\b(usd|idr|rupiah|dollar|dolar|exchange)\b/.test(lower)) {
    return queryText;
  }

  if (/\b(chatgpt|openai)\b/.test(lower)) {
    if (/\bpro\b/.test(lower)) return "OpenAI ChatGPT Pro pricing";
    if (/\bplus\b/.test(lower)) return "OpenAI ChatGPT Plus pricing";
    if (/\bbusiness\b/.test(lower)) return "OpenAI ChatGPT Business pricing";
    if (/\benterprise\b/.test(lower)) return "OpenAI ChatGPT Enterprise pricing";
    if (/\bteam\b/.test(lower)) return "OpenAI ChatGPT Team pricing";
    if (/\bgo\b/.test(lower)) return "OpenAI ChatGPT Go pricing";
    return "OpenAI ChatGPT pricing";
  }

  if (commodity) {
    return ["harga", commodity, location].filter(Boolean).join(" ");
  }

  return queryText;
}

function buildFallbackSearchQuery(message, queryKind) {
  const normalized = normalizeSearchText(message);
  const lower = normalized.toLowerCase();
  const historicalContext = buildHistoricalDateContext(message);

  if (queryKind === "price" && isHistoricalCryptoPriceQuery(message) && historicalContext) {
    return `${normalized} historical price ${historicalContext.displayLabel}`;
  }

  if (queryKind === "office") {
    if (/\b(wakil presiden|vice president|vp)\b/.test(lower)) {
      return `${normalized} current holder`;
    }
    if (/\b(ratu|queen|raja|king|monarch)\b/.test(lower)) {
      return `${normalized} current holder`;
    }
    if (/\b(menteri|minister|secretary|sekretaris|defense|pertahanan|perang)\b/.test(lower)) {
      return `${normalized} current official`;
    }
    return `${normalized} current`;
  }

  if (queryKind === "person_relation") {
    return `${normalized} reliable source`;
  }

  if (queryKind === "count") {
    return `${normalized} current total`;
  }

  if (queryKind === "sports") {
    return `${normalized} skor jadwal hasil pertandingan`;
  }

  if (queryKind === "technology_news" || queryKind === "economy_news" || queryKind === "general_news") {
    return `${normalized} latest`;
  }

  return `${normalized} live current`;
}

function simplifyOfficeSearchQuery(message) {
  const normalized = normalizeSearchText(message)
    .replace(/\bsiapa\b/gi, " ")
    .replace(/\bwho is\b/gi, " ")
    .replace(/\bamerika serikat\b/gi, "united states")
    .replace(/\brepublik indonesia\b/gi, "indonesia")
    .replace(/\bri\b/gi, "indonesia")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function buildSecondHopSearchQueries(message, queryKind) {
  const primary = buildSearchQuery(message);
  const fallback = buildFallbackSearchQuery(message, queryKind);
  const queries = [];

  if (queryKind === "office") {
    const simplified = simplifyOfficeSearchQuery(message);
    const countrySimplified = simplified
      .replace(/\brepublik indonesia\b/gi, "indonesia")
      .replace(/\bri\b/gi, "indonesia")
      .replace(/\s+/g, " ")
      .trim();
    queries.push(countrySimplified);
    queries.push(`${countrySimplified} current`);
    queries.push(`${countrySimplified} official`);
    queries.push(simplified);
    queries.push(`${simplified} current`);
    queries.push(`${simplified} official`);
  } else if (queryKind === "person_relation") {
    const simplified = cleanLiveQuery(message);
    queries.push(`${simplified} reliable source`);
    queries.push(`${simplified} official biography`);
    queries.push(`${simplified} profile`);
  } else if (queryKind === "count") {
    const simplified = cleanLiveQuery(message);
    queries.push(`${simplified} official`);
    queries.push(`${simplified} current total`);
  } else if (queryKind === "sports") {
    const simplified = cleanLiveQuery(message);
    queries.push(`${simplified} skor`);
    queries.push(`${simplified} jadwal`);
    queries.push(`${simplified} hasil pertandingan`);
  } else if (queryKind === "technology_news" || queryKind === "economy_news" || queryKind === "general_news") {
    const simplified = cleanLiveQuery(message);
    queries.push(`${simplified} latest`);
    queries.push(`${simplified} terbaru`);
  } else if (queryKind === "price" || queryKind === "stock") {
    const simplified = cleanLiveQuery(message);
    const historicalContext = buildHistoricalDateContext(message);
    if (queryKind === "price" && isHistoricalCryptoPriceQuery(message) && historicalContext) {
      queries.push(`${simplified} historical price ${historicalContext.displayLabel}`);
      queries.push(`${simplified} ${historicalContext.displayLabel}`);
    } else {
      queries.push(`${simplified} official`);
      queries.push(`${simplified} resmi`);
    }
  }

  queries.push(primary, fallback);

  return [...new Set(queries.map((item) => String(item || "").trim()).filter(Boolean))];
}

function stripReplySource(text = "") {
  return String(text || "")
    .replace(/\s*(?:Sumber|Source):\s*[^\n.]+\.?$/i, "")
    .trim();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchResultsFromApi(payload) {
  const entity = Array.isArray(payload?.entities?.value) ? payload.entities.value[0] : null;
  const answerBox = payload?.answerBox || payload?.computation || payload?.factAnswer || null;
  const webResults = Array.isArray(payload?.webPages?.value)
    ? payload.webPages.value.map((item) => ({
        url: String(item?.url || item?.displayUrl || ""),
        title: stripHtml(item?.name || item?.headline || ""),
        snippet: stripHtml(item?.snippet || item?.description || item?.displayUrl || "")
      }))
    : [];
  const newsResults = Array.isArray(payload?.news?.value)
    ? payload.news.value.map((item) => ({
        url: String(item?.url || ""),
        title: stripHtml(item?.name || item?.headline || ""),
        snippet: stripHtml(item?.description || item?.snippet || "")
      }))
    : [];

  const entityTypeHints = Array.isArray(entity?.entityPresentationInfo?.entityTypeHints)
    ? entity.entityPresentationInfo.entityTypeHints.join(" · ")
    : "";
  const entityTitle = stripHtml(entity?.name || answerBox?.title || answerBox?.displayText || "");
  const entitySubtitle = stripHtml(
    [
      entityTypeHints,
      entity?.description,
      answerBox?.subtitle
    ].filter(Boolean).join(" ")
  );
  const instantAnswer = stripHtml(
    [
      answerBox?.title,
      answerBox?.displayText,
      answerBox?.snippet,
      answerBox?.description,
      answerBox?.expression,
      answerBox?.value
    ].filter(Boolean).join(" ")
  );
  const results = [...webResults, ...newsResults]
    .filter((item) => item.title || item.snippet || item.url)
    .slice(0, 5);
  const pageText = stripHtml(
    [
      entityTitle,
      entitySubtitle,
      instantAnswer,
      ...results.flatMap((result) => [result.title, result.snippet])
    ].filter(Boolean).join(" ")
  );

  if (entityTitle) {
    results.unshift({
      url: "",
      title: entityTitle,
      snippet: [entitySubtitle, instantAnswer].filter(Boolean).join(" ").trim()
    });
  }

  return {
    results: results.slice(0, 5),
    pageText,
    entityTitle,
    entitySubtitle,
    instantAnswer
  };
}

function detectQueryKind(message) {
  const text = normalizeSearchText(message).toLowerCase();
  if (isStockQuery(message)) {
    return "stock";
  }
  if (/\b(vice president|wakil presiden|vp|president|presiden|prime minister|perdana menteri|ceo|governor|gubernur|minister|menteri|secretary|sekretaris|defense|pertahanan|perang|queen|ratu|king|raja|monarch)\b/.test(text)) {
    return "office";
  }
  if (hasAnyPhrase(text, LIVE_PERSON_RELATION_KEYWORDS)) {
    return "person_relation";
  }
  if (/\b(berapa jumlah|jumlah|how many|count|total)\b/.test(text) && /\b(provinsi|province|state|kabupaten|regency|kota|city|pulau|island)\b/.test(text)) {
    return "count";
  }
  if (hasAnyPhrase(text, LIVE_SPORTS_KEYWORDS)
    || /\b(olahraga|sports?|bola|sepak bola|liga|nba|motogp|f1|badminton|bulu tangkis|pertandingan|match|fixture|jadwal|skor|score|klasemen)\b/.test(text)) {
    return "sports";
  }
  if (/\b(teknologi|technology|tech|ai|openai|chatgpt|gadget|iphone|android|startup|server|cloud|cyber)\b/.test(text)) {
    return "technology_news";
  }
  if (/\b(ekonomi|economy|bisnis|business|inflasi|bank indonesia|market|pasar modal)\b/.test(text)) {
    return "economy_news";
  }
  if (/\b(news|berita|headline|update|terbaru|terkini)\b/.test(text)) {
    return "general_news";
  }
  return "price";
}

function classifyLiveIntent(message) {
  return detectQueryKind(message);
}

function classifyLiveCategory(message = "", queryKind = classifyLiveIntent(message), hint = "") {
  const text = normalizeSearchText(message).toLowerCase();
  if (hint) return hint;

  if (queryKind === "office") return "office";
  if (queryKind === "person_relation") return "person_relation";
  if (queryKind === "count") return "count";
  if (queryKind === "stock") return "stock";
  if (queryKind === "sports") return "sports_news";
  if (queryKind === "technology_news") return "technology_news";
  if (queryKind === "economy_news") return "economy_news";
  if (queryKind === "general_news") return "general_news";

  if (queryKind === "price") {
    if (isHistoricalCryptoPriceQuery(message)) return "crypto_price_historical";
    if (isCryptoQuery(message)) return "crypto_price";
    if (isGoldQuery(message)) return "gold_price";
    if (isStapleFoodQuery(message)) return "staple_price";
    if (/\b(usd|idr|rupiah|dollar|dolar|forex|kurs|exchange)\b/.test(text)) return "forex_price";
    return "general_price";
  }

  if (/\b(olahraga|sports?|bola|liga|nba|motogp|f1|badminton|bulu tangkis)\b/.test(text)) return "sports_news";
  if (/\b(teknologi|technology|tech|ai|openai|chatgpt|gadget|iphone|android|startup|server|cloud|cyber)\b/.test(text)) return "technology_news";
  if (/\b(ekonomi|economy|bisnis|business|inflasi|bank indonesia|market|pasar modal)\b/.test(text)) return "economy_news";
  return "general_news";
}

function sourcePlanForCategory(category = "general_news") {
  switch (category) {
    case "crypto_price_historical":
      return ["coingecko_historical", "x_search", "search", "crypto_rss"];
    case "crypto_price":
      return ["coingecko", "crypto_multi_news", "x_search", "search", "crypto_rss"];
    case "gold_price":
      return ["logam_mulia", "yahoo_gold", "x_search", "search", "registry_rss"];
    case "staple_price":
      return ["pihps", "panel_harga_pangan", "x_search", "search", "registry_rss"];
    case "technology_news":
    case "sports_news":
    case "economy_news":
    case "general_news":
      return ["x_search", "search", "registry_rss"];
    case "person_relation":
      return ["wikipedia", "x_search", "search"];
    case "count":
      return ["wikipedia", "x_search", "search"];
    case "office":
      return ["wikipedia", "x_search", "search"];
    default:
      return ["x_search", "search"];
  }
}

function wikipediaPriorityForCategory(category = "") {
  const value = String(category || "").trim().toLowerCase();
  if (!value) return "none";
  if (value === "person_relation" || value.includes("knowledge") || value.includes("history")) return "high";
  if (value === "count" || value.includes("statistic")) return "medium";
  if (value === "office" || value.includes("official") || value.includes("legal")) return "low";
  return "none";
}

function sourceBucketForCategory(category = "", queryKind = "") {
  const value = String(category || "").trim().toLowerCase();
  if (value.includes("legal")) return "legal";
  if (value === "office" || value.includes("official")) return "official";
  if (value === "count" || value.includes("statistic")) return "statistic";
  if (value.includes("history")) return "history";
  if (value === "person_relation" || value.includes("knowledge")) return "knowledge";
  if (queryKind === "count" || queryKind === "price" || queryKind === "stock") return "statistic";
  return "knowledge";
}

function orderSearchPayloadsForCategory(category = "", payloads = {}) {
  const value = String(category || "").trim().toLowerCase();
  const priority = wikipediaPriorityForCategory(value);
  const ordered = [];

  if (["technology_news", "sports_news", "economy_news", "general_news"].includes(value)) {
    ordered.push(payloads.google, payloads.registry, payloads.crypto, payloads.wikipedia);
  } else if (["crypto_price", "crypto_price_historical"].includes(value)) {
    ordered.push(payloads.google, payloads.crypto, payloads.registry, payloads.wikipedia);
  } else if (["gold_price", "staple_price", "forex_price", "general_price", "stock"].includes(value)) {
    ordered.push(payloads.google, payloads.registry, payloads.crypto, payloads.wikipedia);
  } else if (priority === "high") {
    ordered.push(payloads.wikipedia, payloads.google, payloads.registry, payloads.crypto);
  } else if (priority === "medium") {
    ordered.push(payloads.wikipedia, payloads.google, payloads.registry, payloads.crypto);
  } else if (priority === "low") {
    ordered.push(payloads.google, payloads.registry, payloads.crypto, payloads.wikipedia);
  } else {
    ordered.push(payloads.google, payloads.registry, payloads.crypto, payloads.wikipedia);
  }

  return ordered.filter(Boolean);
}

function resolveLiveRoute(message = "", options = {}) {
  const intent = classifyLiveIntent(message);
  const category = classifyLiveCategory(message, intent, String(options.categoryHint || "").trim().toLowerCase());
  return {
    intent,
    category,
    sources: sourcePlanForCategory(category)
  };
}

function classifyFeedCategory(message = "", routeCategory = "") {
  const text = normalizeSearchText(message).toLowerCase();
  if (routeCategory === "crypto_price_historical") return "crypto";
  if (routeCategory === "crypto_price") return "crypto";
  if (routeCategory === "economy_news" || routeCategory === "gold_price" || routeCategory === "stock" || routeCategory === "forex_price" || routeCategory === "general_price") return "economy";
  if (routeCategory === "sports_news") return "sports";
  if (routeCategory === "technology_news") return "technology";
  if (isCryptoQuery(message) || /\b(blockchain|bitcoin|ethereum|altcoin|defi|nft|web3|crypto)\b/.test(text)) return "crypto";
  if (/\b(ekonomi|economy|bisnis|business|inflasi|suku bunga|bank indonesia|rupiah|pdb|market|pasar modal|saham|stock|emas|gold|forex|dolar|usd|idr)\b/.test(text)) return "economy";
  if (/\b(olahraga|sports?|bola|sepak bola|liga|premier league|champions league|f1|motogp|nba|badminton|bulu tangkis)\b/.test(text)) return "sports";
  if (/\b(teknologi|technology|tech|ai|openai|chatgpt|gadget|smartphone|iphone|android|startup|internet|server|cloud|cyber|keamanan siber)\b/.test(text)) return "technology";
  return "general";
}

function getRelevantRssSources(message = "", routeCategory = "") {
  const category = classifyFeedCategory(message, routeCategory);
  const text = normalizeSearchText(message).toLowerCase();
  const prefersGlobal = /\b(global|internasional|international|world|amerika|us|usa|china|eropa|europe|inggris|uk)\b/.test(text);
  const preferred = LIVE_RSS_SOURCE_REGISTRY
    .filter((source) => source.category === category || (category === "crypto" && source.category === "crypto_market"))
    .filter((source) => prefersGlobal ? source.language === "en" : true)
    .sort((a, b) => b.priority - a.priority);
  const localPreferred = !prefersGlobal
    ? preferred.filter((source) => source.language === "id")
    : preferred;
  const globalPreferred = preferred.filter((source) => source.language === "en");
  const general = LIVE_RSS_SOURCE_REGISTRY
    .filter((source) => source.category === "general" && (prefersGlobal ? source.language === "en" : source.language === "id"))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2);
  const ordered = prefersGlobal
    ? [...globalPreferred, ...localPreferred, ...general]
    : [...localPreferred, ...globalPreferred.slice(0, 2), ...general];
  return [...new Map(ordered.map((item) => [item.url, item])).values()].slice(0, 6);
}

const OFFICE_ROLE_DEFINITIONS = [
  {
    id: "vice_president",
    canonical: "wakil presiden",
    detect(text) {
      return /\b(vice president|wakil presiden|vp|wakil)\b/.test(text);
    },
    strip(text) {
      return text.replace(/\b(vice president|wakil presiden|vp|wakil|vice)\b/g, " ");
    }
  },
  {
    id: "president",
    canonical: "presiden",
    detect(text) {
      const reduced = text.replace(/\b(vice president|wakil presiden|vp|wakil|vice)\b/g, " ");
      return /\b(president|presiden)\b/.test(reduced);
    },
    strip(text) {
      return text.replace(/\b(president|presiden)\b/g, " ");
    }
  },
  {
    id: "prime_minister",
    canonical: "perdana menteri",
    detect(text) {
      return /\b(prime minister|perdana menteri|pm)\b/.test(text);
    },
    strip(text) {
      return text.replace(/\b(prime minister|perdana menteri|pm)\b/g, " ");
    }
  },
  {
    id: "governor",
    canonical: "gubernur",
    detect(text) {
      return /\b(governor|gubernur)\b/.test(text);
    },
    strip(text) {
      return text.replace(/\b(governor|gubernur)\b/g, " ");
    }
  },
  {
    id: "ceo",
    canonical: "ceo",
    detect(text) {
      return /\bceo\b/.test(text);
    },
    strip(text) {
      return text.replace(/\bceo\b/g, " ");
    }
  },
  {
    id: "queen",
    canonical: "ratu",
    detect(text) {
      return /\b(queen|ratu|monarch)\b/.test(text);
    },
    strip(text) {
      return text.replace(/\b(queen|ratu|monarch)\b/g, " ");
    }
  },
  {
    id: "king",
    canonical: "raja",
    detect(text) {
      return /\b(king|raja|monarch)\b/.test(text);
    },
    strip(text) {
      return text.replace(/\b(king|raja|monarch)\b/g, " ");
    }
  }
];

function detectOfficeRoles(message) {
  const text = normalizeSearchText(message).toLowerCase();
  return OFFICE_ROLE_DEFINITIONS.filter((role) => role.detect(text));
}

function extractOfficeSubject(message) {
  let subject = normalizeSearchText(message).toLowerCase();
  subject = subject
    .replace(/\b(siapa|who is|who|current|latest|terkini|terbaru|saat ini|sekarang|right now|today)\b/g, " ")
    .replace(/\b(and|dan)\b/g, " ");

  for (const role of OFFICE_ROLE_DEFINITIONS) {
    subject = role.strip(subject);
  }

  return subject.replace(/\s+/g, " ").trim();
}

function extractTicker(message) {
  const original = String(message || "");
  const upperTicker = original.match(/\b([A-Z]{4,5})\b/);
  if (upperTicker?.[1]) return upperTicker[1];
  const lower = normalizeSearchText(message).toLowerCase();
  if (!/\b(saham|stock|ticker|idx|itu saham apa|saham apa|kode saham apa|what stock)\b/.test(lower)) return "";
  const lowerTicker = lower.match(/\b([a-z]{4,5})\b/);
  if (!lowerTicker?.[1]) return "";
  if (["harga", "saham", "stock", "today", "todays", "right", "current", "itu", "apa", "kode"].includes(lowerTicker[1])) return "";
  return lowerTicker[1].toUpperCase();
}

function extractStockProfile(results, ticker = "") {
  for (const result of results) {
    const text = [result.title, result.snippet].filter(Boolean).join(" ");
    const directMatch = text.match(new RegExp(`\\b${ticker || "[A-Z]{4,5}"}\\b\\s*[-:|]\\s*(PT\\.?\\s+[^|\\-:.]+(?:Tbk\\.?|tbk\\.?))`, "i"));
    if (directMatch?.[1]) {
      return { ticker: ticker || "", company: cleanName(directMatch[1]) };
    }

    const companyFirst = text.match(/\b(PT\.?\s+[^|:.]+(?:Tbk\.?|tbk\.?))\b/i);
    if (companyFirst?.[1]) {
      const inferredTicker = ticker || text.match(/\b([A-Z]{4,5})\b/)?.[1] || "";
      return { ticker: inferredTicker, company: cleanName(companyFirst[1]) };
    }
  }
  return null;
}

function isStockIdentityQuestion(message) {
  const lower = normalizeSearchText(message).toLowerCase();
  return /\b(itu saham apa|saham apa|saham apa ya|what stock|what company|perusahaan apa)\b/.test(lower);
}

function extractStockPriceCandidate(results, ticker = "") {
  for (const result of results) {
    const text = [result.title, result.snippet].filter(Boolean).join(" ");
    const lower = text.toLowerCase();
    const hasTicker = ticker ? new RegExp(`\\b${ticker}\\b`, "i").test(text) : /\b[A-Z]{4,5}\b/.test(text);
    const hasCurrentCue = /\b(hari ini|today|realtime|real-time|live|market open|harga saham)\b/i.test(text);
    const prices = collectRupiahAmounts(text).filter((value) => value >= 50 && value <= 1000000);
    if (hasTicker && hasCurrentCue && prices.length) {
      return prices[prices.length - 1];
    }
  }
  return null;
}

function formatStockIdentityReply(profile, source) {
  const tickerPart = profile.ticker ? ` (${profile.ticker})` : "";
  return `${profile.ticker || "Kode saham ini"} adalah ${profile.company}${tickerPart}. Sumber: ${source}.`;
}

function formatStockPriceReply(profile, amount, source) {
  const subject = profile?.ticker
    ? `Harga saham ${profile.ticker}`
    : "Harga saham yang saya temukan";
  const companyPart = profile?.company ? ` untuk ${profile.company}` : "";
  return `${subject}${companyPart} sekitar ${formatCompactRupiah(amount)} per saham. Sumber: ${source}.`;
}

function buildInconclusiveReply(message, queryKind) {
  const subject = sanitizeSearchQueryText(message).replace(/[?!.]+$/g, "").trim() || "permintaan ini";
  const isExplicitPrice = /\b(harga|price|rate|kurs)\b/i.test(message);
  const historicalContext = buildHistoricalDateContext(message);

  if (queryKind === "price" && isHistoricalCryptoPriceQuery(message) && historicalContext) {
    return `Saya belum bisa memastikan harga historis untuk "${subject}" pada ${historicalContext.displayLabel}. Mau saya cari di sumber lain?`;
  }

  if (queryKind === "price") {
    return isExplicitPrice
      ? `Menurut data Google News search yang saya dapatkan, harga untuk "${subject}" belum cukup jelas. Mau saya cari di sumber lain?`
      : `Menurut data Google News search yang saya dapatkan, jawaban untuk "${subject}" belum cukup jelas. Mau saya cari di sumber lain?`;
  }

  if (queryKind === "stock") {
    return `Menurut data Google News search yang saya dapatkan, informasi untuk "${subject}" belum cukup jelas. Mau saya cari di sumber lain?`;
  }

  if (queryKind === "count") {
    return `Menurut data Google News search yang saya dapatkan, jumlah untuk "${subject}" belum cukup jelas. Mau saya cari di sumber lain?`;
  }

  if (queryKind === "office") {
    return `Menurut data Google News search yang saya dapatkan, jawaban untuk "${subject}" belum cukup jelas. Mau saya cari di sumber lain?`;
  }

  if (queryKind === "sports") {
    return `Menurut data Google News search yang saya dapatkan, info olahraga untuk "${subject}" belum cukup jelas. Mau saya cari di sumber lain?`;
  }

  return `Menurut data Google News search yang saya dapatkan, jawaban untuk "${subject}" belum cukup jelas. Mau saya cari di sumber lain?`;
}

function findPrice(text, message) {
  const anchor = extractSpecificPriceAnchor(message);
  if (anchor) {
    const anchoredPrice = findAnchoredPrice(text, anchor, message);
    if (anchoredPrice) return anchoredPrice;
  }

  const wantsIdr = /\b(idr|rupiah|rp)\b/i.test(message);
  const patterns = wantsIdr
    ? [
        /rp\.?\s?([0-9]{1,6}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?)/i,
        /rp\.?\s?([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]+)?)/i,
        /idr\s?([0-9]{1,6}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?)/i
      ]
    : [
        /\$([0-9]{1,6}(?:\.[0-9]+)?)/,
        /\$([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)/,
        /usd\s?([0-9]{1,6}(?:[.,][0-9]+)?)/i,
        /rp\.?\s?([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]+)?)/i
      ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return wantsIdr || /^rp|idr/i.test(match[0]) ? `Rp ${match[1]}` : `${match[1]} USD`;
    }
  }

  return "";
}

function extractSpecificPriceAnchor(message) {
  const lower = normalizeSearchText(message).toLowerCase();
  const known = [
    "pertamax turbo",
    "pertamax",
    "pertalite",
    "biosolar",
    "dexlite",
    "solar"
  ];
  const found = known.find((item) => hasPhrase(lower, item));
  if (found) return found;

  const generic = extractGenericPriceSubject(message).toLowerCase();
  return generic && generic.length >= 3 ? generic : "";
}

function findAnchoredPrice(text, anchor, message) {
  const sourceText = String(text || "");
  const lower = normalizeSearchText(sourceText).toLowerCase();
  const cleanAnchor = String(anchor || "").toLowerCase().trim();
  if (!cleanAnchor) return "";

  let best = null;
  const pattern = /(?:rp|idr)\.?\s*[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?/gi;
  for (const match of sourceText.matchAll(pattern)) {
    const priceText = match[0];
    const start = Math.max(0, (match.index || 0) - 120);
    const end = Math.min(sourceText.length, (match.index || 0) + priceText.length + 120);
    const windowText = sourceText.slice(start, end);
    const normalizedWindow = normalizeSearchText(windowText).toLowerCase();
    if (!hasPhrase(normalizedWindow, cleanAnchor)) continue;

    const anchorIndex = lower.indexOf(cleanAnchor);
    const distance = anchorIndex >= 0 ? Math.abs((match.index || 0) - anchorIndex) : 9999;
    if (!best || distance < best.distance) {
      best = { priceText, distance };
    }
  }

  if (!best) return "";
  const numeric = best.priceText.replace(/^(rp|idr)\.?\s*/i, "").trim();
  return /\b(idr|rupiah|rp)\b/i.test(message) || /^rp|idr/i.test(best.priceText)
    ? `Rp ${numeric}`
    : `${numeric} USD`;
}

function isVehiclePriceQuery(message) {
  const text = normalizeSearchText(message).toLowerCase();
  return /\b(honda|yamaha|suzuki|kawasaki|toyota|daihatsu|mitsubishi|hyundai|wuling|nissan|beat|vario|scoopy|pcx|nmax|aerox|avanza|xenia|brio|mobil|motor)\b/.test(text);
}

function parseRupiahAmount(raw) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return null;
  const match = text.match(/rp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?)(?:\s*(juta|miliar|ribu))?/i);
  if (!match) return null;

  let amount = Number(String(match[1]).replace(/\./g, "").replace(",", "."));
  const unit = String(match[2] || "").toLowerCase();
  if (unit === "ribu") amount *= 1000;
  if (unit === "juta") amount *= 1000000;
  if (unit === "miliar") amount *= 1000000000;
  return Number.isFinite(amount) ? amount : null;
}

function collectRupiahAmounts(text) {
  const matches = String(text || "").match(/rp\.?\s*[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?(?:\s*(?:juta|miliar|ribu))?/gi) || [];
  return matches.map(parseRupiahAmount).filter((value) => Number.isFinite(value) && value > 0);
}

function formatCompactRupiah(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  if (amount >= 1000000000) {
    const value = amount / 1000000000;
    return `Rp ${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} miliar`;
  }
  if (amount >= 1000000) {
    const value = amount / 1000000;
    return `Rp ${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} juta`;
  }
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;
}

function findVehiclePriceRange(results) {
  const usedResults = results.filter((result) => /\b(bekas|seken|pasaran|used|olx)\b/i.test([result.title, result.snippet].join(" ")));
  const sourceResults = usedResults.length ? usedResults : results;
  const values = sourceResults.flatMap((result) => collectRupiahAmounts([result.title, result.snippet].join(" ")));
  if (!values.length) return null;

  const filtered = values.filter((value) => value >= 3000000 && value <= 500000000);
  if (!filtered.length) return null;

  return {
    min: Math.min(...filtered),
    max: Math.max(...filtered)
  };
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractCommodityLabel(message) {
  const lower = normalizeSearchText(message).toLowerCase();
  const known = [
    "bawang merah",
    "bawang putih",
    "daging sapi",
    "daging ayam",
    "minyak goreng",
    "cabai",
    "cabe",
    "tomat",
    "bawang",
    "beras",
    "telur",
    "ayam",
    "daging",
    "gula",
    "minyak",
    "kentang",
    "wortel",
    "sayur",
    "pertamax turbo",
    "pertamax",
    "pertalite",
    "biosolar",
    "dexlite",
    "solar"
  ];
  const found = known.find((item) => lower.includes(item));
  if (!found) return "";
  return found === "cabe" ? "cabai" : found;
}

function extractProductLabel(message) {
  const lower = normalizeSearchText(message).toLowerCase();
  if (!/\b(chatgpt|openai)\b/.test(lower)) return "";
  if (/\bchatgpt\b/.test(lower) && /\bpro\b/.test(lower)) return "ChatGPT Pro";
  if (/\bchatgpt\b/.test(lower) && /\bplus\b/.test(lower)) return "ChatGPT Plus";
  if (/\bchatgpt\b/.test(lower) && /\bbusiness\b/.test(lower)) return "ChatGPT Business";
  if (/\bchatgpt\b/.test(lower) && /\benterprise\b/.test(lower)) return "ChatGPT Enterprise";
  if (/\bchatgpt\b/.test(lower) && /\bteam\b/.test(lower)) return "ChatGPT Team";
  if (/\bchatgpt\b/.test(lower) && /\bgo\b/.test(lower)) return "ChatGPT Go";
  if (/\bchatgpt\b/.test(lower)) return "ChatGPT";
  if (/\bopenai\b/.test(lower)) return "OpenAI";
  return "";
}

function extractLocationLabel(message) {
  const normalized = sanitizeSearchQueryText(message);
  const match = normalized.match(/\bdi\s+([a-zA-Z][a-zA-Z\s]{1,40}?)(?=\s+\d|\s+per\b|\s+kg\b|\s+berapa\b|[?.!,]|$)/i);
  return match?.[1] ? toTitleCase(match[1]) : "";
}

function extractGenericPriceSubject(message) {
  const subject = sanitizeSearchQueryText(message)
    .replace(/\b(harga|price|rate|kurs|berapa|how much|today|hari ini|saat ini|sekarang|latest|current|right now)\b/gi, " ")
    .replace(/\b(per\s*kg|per\s*gram|per\s*bulan|kg|kilogram|gram|bulan)\b/gi, " ")
    .replace(/[?.,!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return subject ? toTitleCase(subject) : "";
}

function inferPriceUnit(text, message) {
  const sourceText = `${text} ${message}`.toLowerCase();
  if (/\b(per\s*kg|\/\s*kg|kg|kilogram)\b/.test(sourceText)) return " per kg";
  if (/\b(per\s*gram|\/\s*g|gram)\b/.test(sourceText)) return " per gram";
  if (/\b(per\s*month|\/\s*month|monthly|month|bulan|per\s*bulan)\b/.test(sourceText)) return " per bulan";
  return "";
}

function formatPriceReply(price, source, message, snippetText = "") {
  const commodity = extractCommodityLabel(message);
  const product = extractProductLabel(message);
  const genericSubject = extractGenericPriceSubject(message);
  const location = extractLocationLabel(message);
  const unit = inferPriceUnit(snippetText, message);
  const isIndonesian = /\b(harga|berapa|rupiah|kurs|sekarang|hari ini|di )\b/i.test(message);

  if (isIndonesian) {
    const subject = commodity
      ? `Harga ${commodity}`
      : product
        ? `Harga ${product}`
        : genericSubject
          ? `Harga ${genericSubject}`
          : "Harga yang saya temukan";
    const locationPart = location ? ` di ${location}` : "";
    return `${subject}${locationPart} sekitar ${price}${unit}. Sumber: ${source}.`;
  }

  const subject = commodity
    ? `The ${commodity} price`
    : product
      ? `The ${product} price`
      : genericSubject
        ? `The price for ${genericSubject}`
        : "The price I found";
  const locationPart = location ? ` in ${location}` : "";
  return `${subject}${locationPart} is around ${price}${unit}. Source: ${source}.`;
}

function formatVehiclePriceReply(range, source, message) {
  const label = normalizeSearchText(message).replace(/\bharga\b/gi, "").trim() || "kendaraan ini";
  const subject = toTitleCase(label);
  const minText = formatCompactRupiah(range.min);
  const maxText = formatCompactRupiah(range.max);
  return `Harga ${subject} bekas sekitar ${minText} sampai ${maxText}. Sumber: ${source}.`;
}

function cleanName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
}

function cleanPersonCandidate(value) {
  return cleanName(value)
    .replace(/\s+(?:Incumbentsince|Incumbent|Post|Body|Native|Department|Residence|Style|Status|Salary|Term|Seat|Appointer|Constituting|Inaugural)\b.*$/u, "")
    .replace(/^(?:AS|US|USA|Amerika Serikat|United States|Republik Indonesia|RI)\s+(?:Terpilih|Elect)\s+/iu, "")
    .trim();
}

function isLikelyPersonName(value) {
  const candidate = cleanName(value);
  if (!candidate) return false;
  if (candidate.length < 4 || candidate.length > 80) return false;
  if (/\b(wikipedia|republik|indonesia|amerika|serikat|united|states|presiden|wakil|menteri|secretary|governor|gubernur|prime minister|daftar|list|current|official|pembantu|kepala|pemerintahan|province|provinsi|city|kota|kabupaten|pemimpin|tertinggi|leader|supreme)\b/i.test(candidate)) {
    return false;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((word) => /^[A-Z][\p{L}.'-]*$/u.test(word))) return false;
  return true;
}

function findOfficeHolder(text, title, message) {
  const sourceText = [title, text].filter(Boolean).join(" ");
  const lowerMessage = normalizeSearchText(message).toLowerCase();
  const role = /\b(vice president|wakil presiden|vp)\b/.test(lowerMessage)
    ? "(?:vice president|wakil presiden)"
    : /\b(defense|pertahanan|perang)\b/.test(lowerMessage)
    ? "(?:secretary of defense|defense secretary|menteri pertahanan|war minister|secretary|sekretaris|minister|menteri)"
    : /\b(president|presiden)\b/.test(lowerMessage)
    ? "(?:president|presiden)"
    : /\b(queen|ratu)\b/.test(lowerMessage)
    ? "(?:queen|ratu)"
    : /\b(king|raja)\b/.test(lowerMessage)
    ? "(?:king|raja)"
    : /\b(prime minister|perdana menteri|pm)\b/.test(lowerMessage)
      ? "(?:prime minister|perdana menteri)"
      : /\b(ceo)\b/.test(lowerMessage)
        ? "ceo"
        : /\b(governor|gubernur)\b/.test(lowerMessage)
          ? "(?:governor|gubernur)"
          : /\b(minister|menteri|secretary|sekretaris)\b/.test(lowerMessage)
            ? "(?:minister|menteri|secretary|sekretaris)"
            : "(?:vice president|wakil presiden|president|presiden|queen|ratu|king|raja|prime minister|perdana menteri|ceo|governor|gubernur|minister|menteri|secretary|sekretaris)";

  const titleName = cleanName(title);
  if (isLikelyPersonName(titleName)) return titleName;

  const titlePatterns = [
    new RegExp(`^([^|:-]+?)\\s*[-|:]\\s*(?:current\\s+)?${role}\\b`, "iu"),
    new RegExp(`^(?:current\\s+)?${role}\\s+of\\s+[^|:-]+\\s*[-|:]\\s*([^|:-]+)`, "iu"),
    new RegExp(`^([^|:-]+?)\\s*[-|:]\\s*[^|:-]*${role}[^|:-]*$`, "iu"),
    new RegExp(`^(?:wakil presiden(?: republik indonesia)?|vice president(?: of [^|:-]+)?|wapres)\\s*[-|:]\\s*([^|:-]+)$`, "iu"),
    new RegExp(`^(?:presiden(?: republik indonesia)?|president(?: of [^|:-]+)?)\\s*[-|:]\\s*([^|:-]+)$`, "iu"),
    new RegExp(`^(?:ratu|queen|raja|king)(?: of [^|:-]+)?\\s*[-|:]\\s*([^|:-]+)$`, "iu")
  ];
  for (const pattern of titlePatterns) {
    const match = cleanPersonCandidate(title.match(pattern)?.[1]);
    if (isLikelyPersonName(match)) return match;
  }

  const textPatterns = [
    new RegExp(`(?:incumbent|petahana)\\s*:?\\s*([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+){1,5})`, "iu"),
    new RegExp(`(?:presiden|president)\\s+(?:republik\\s+indonesia|of\\s+[^,.]+),\\s*([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+){1,4})`, "iu"),
    new RegExp(`(?:profil|sosok)\\s+([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+){1,4}),\\s*(?:presiden|president)\\b`, "iu"),
    new RegExp(`(?:presiden|president)\\s+(?:iran|indonesia|amerika\\s+serikat|united\\s+states|republik\\s+islam\\s+iran|islamic\\s+republic\\s+of\\s+iran)\\s+([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+){1,4})`, "iu"),
    new RegExp(`(?:ratu|queen|raja|king)\\s+(?:belanda|netherlands|inggris|united kingdom|spanyol|spain|denmark|sweden|norway|thailand|japan)\\s+([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+){1,4})`, "iu"),
    new RegExp(`(?:presiden|president)\\s+([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+){1,3})(?=\\s+(?:tiba|hadiri|hadir|lantik|melantik|menghadiri|arrived|arrives|visits|visit)\\b)`, "iu"),
    new RegExp(`(?:wakil\\s+presiden|vice\\s+president|wapres)\\s+(?:republik\\s+indonesia|of\\s+[^,.]+)?\\s*([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+){1,4})`, "iu"),
    new RegExp(`([\\p{L}][\\p{L}.'-]+(?:\\s+[\\p{L}][\\p{L}.'-]+){0,4})\\s+is\\s+the\\s+(?:current\\s+)?${role}\\s+of\\s+[\\p{L}][\\p{L}\\s.'-]+`, "iu"),
    new RegExp(`([\\p{L}][\\p{L}.'-]+(?:\\s+[\\p{L}][\\p{L}.'-]+){0,4})\\s+is\\s+the\\s+(?:current\\s+)?${role}`, "iu"),
    new RegExp(`${role}\\s+(?:[^.]{0,40}\\s)?(?:saat\\s+ini\\s)?(?:adalah|ialah)\\s+([\\p{L}][\\p{L}.'-]+(?:\\s+[\\p{L}][\\p{L}.'-]+){0,4})`, "iu"),
    new RegExp(`([\\p{L}][\\p{L}.'-]+(?:\\s+[\\p{L}][\\p{L}.'-]+){0,4})\\s+(?:serves\\s+as|menjabat\\s+sebagai)\\s+(?:the\\s+)?${role}`, "iu")
  ];
  for (const pattern of textPatterns) {
    const match = cleanPersonCandidate(sourceText.match(pattern)?.[1]);
    if (isLikelyPersonName(match)) return match;
  }

  return "";
}

function findCountFact(text, title, message) {
  const sourceText = [title, text].filter(Boolean).join(" ");
  const lowerMessage = normalizeSearchText(message).toLowerCase();

  const target = /\b(provinsi|province)\b/.test(lowerMessage)
    ? "(?:provinsi|province|provinces)"
    : /\b(kabupaten|regency|regencies)\b/.test(lowerMessage)
      ? "(?:kabupaten|regency|regencies)"
      : /\b(kota|city|cities)\b/.test(lowerMessage)
        ? "(?:kota|city|cities)"
        : /\b(pulau|island|islands)\b/.test(lowerMessage)
          ? "(?:pulau|island|islands)"
          : "(?:provinsi|province|provinces|kabupaten|regency|regencies|kota|city|cities|pulau|island|islands)";

  const patterns = [
    new RegExp(`\\b([0-9]{1,3})\\s+${target}\\b`, "iu"),
    new RegExp(`${target}\\s+(?:saat\\s+ini\\s+)?(?:sebanyak|berjumlah|adalah|ialah)\\s+([0-9]{1,3})\\b`, "iu"),
    new RegExp(`(?:there are|there is)\\s+([0-9]{1,3})\\s+${target}\\b`, "iu")
  ];

  for (const pattern of patterns) {
    const match = sourceText.match(pattern)?.[1];
    if (match) return match;
  }

  return "";
}

function formatOfficeReply(name, source, message) {
  const lowerMessage = normalizeSearchText(message).toLowerCase();

  if (/\b(vice president|wakil presiden|vp)\b/.test(lowerMessage)) {
    return /\b(wakil presiden)\b/i.test(message)
      ? `Wakil presiden saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current vice president I found is ${name}. Source: ${source}.`;
  }

  if (/\b(president|presiden)\b/.test(lowerMessage)) {
    return /\b(siapa|presiden)\b/i.test(message)
      ? `Presiden saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current president I found is ${name}. Source: ${source}.`;
  }

  if (/\b(queen|ratu)\b/.test(lowerMessage)) {
    return /\b(ratu)\b/i.test(message)
      ? `Ratu saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current queen I found is ${name}. Source: ${source}.`;
  }

  if (/\b(king|raja)\b/.test(lowerMessage)) {
    return /\b(raja)\b/i.test(message)
      ? `Raja saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current king I found is ${name}. Source: ${source}.`;
  }

  if (/\b(prime minister|perdana menteri|pm)\b/.test(lowerMessage)) {
    return /\b(perdana menteri)\b/i.test(message)
      ? `Perdana menteri saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current prime minister I found is ${name}. Source: ${source}.`;
  }

  if (/\b(ceo)\b/.test(lowerMessage)) {
    return `The current CEO I found is ${name}. Source: ${source}.`;
  }

  if (/\b(governor|gubernur)\b/.test(lowerMessage)) {
    return /\b(gubernur)\b/i.test(message)
      ? `Gubernur saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current governor I found is ${name}. Source: ${source}.`;
  }

  if (/\b(minister|menteri)\b/.test(lowerMessage)) {
    return /\b(menteri)\b/i.test(message)
      ? `Menteri saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current minister I found is ${name}. Source: ${source}.`;
  }

  if (/\b(secretary|sekretaris|defense|pertahanan|perang)\b/.test(lowerMessage)) {
    return /\b(menteri|sekretaris|pertahanan|perang)\b/i.test(message)
      ? `Pejabat saat ini yang saya temukan adalah ${name}. Sumber: ${source}.`
      : `The current official I found is ${name}. Source: ${source}.`;
  }

  return /\b(siapa)\b/i.test(message)
    ? `Jawaban terkini yang saya temukan adalah ${name}. Sumber: ${source}.`
    : `The latest answer I found is ${name}. Source: ${source}.`;
}

function formatCountReply(count, source, message) {
  const lowerMessage = normalizeSearchText(message).toLowerCase();

  if (/\b(provinsi|province)\b/.test(lowerMessage)) {
    return /\b(berapa jumlah|jumlah|provinsi)\b/i.test(message)
      ? `Jumlah provinsi yang saya temukan saat ini adalah ${count}. Sumber: ${source}.`
      : `The current number of provinces I found is ${count}. Source: ${source}.`;
  }

  if (/\b(kabupaten|regency)\b/.test(lowerMessage)) {
    return /\b(kabupaten)\b/i.test(message)
      ? `Jumlah kabupaten yang saya temukan saat ini adalah ${count}. Sumber: ${source}.`
      : `The current number of regencies I found is ${count}. Source: ${source}.`;
  }

  if (/\b(kota|city)\b/.test(lowerMessage)) {
    return /\b(kota)\b/i.test(message)
      ? `Jumlah kota yang saya temukan saat ini adalah ${count}. Sumber: ${source}.`
      : `The current number of cities I found is ${count}. Source: ${source}.`;
  }

  if (/\b(pulau|island)\b/.test(lowerMessage)) {
    return /\b(pulau)\b/i.test(message)
      ? `Jumlah pulau yang saya temukan saat ini adalah ${count}. Sumber: ${source}.`
      : `The current number of islands I found is ${count}. Source: ${source}.`;
  }

  return /\b(berapa jumlah|jumlah)\b/i.test(message)
    ? `Jumlah terkini yang saya temukan adalah ${count}. Sumber: ${source}.`
    : `The latest count I found is ${count}. Source: ${source}.`;
}

function extractSearchResults(xml, options = {}) {
  const text = String(xml || "");
  const sourceLabel = String(options.sourceLabel || "").trim();

  // Detect non-RSS response (blocked/redirect)
  if (text.length < 200 || !text.includes("<item>")) {
    return { results: [], pageText: "", entityTitle: "", entitySubtitle: "", instantAnswer: "" };
  }

  const items = Array.from(text.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  const results = [];

  for (const item of items.slice(0, 10)) {
    const block = item[1] || "";

    // Title: strip CDATA and HTML
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
    const title = stripHtml(rawTitle.replace(/<!\[CDATA\[|\]\]>/g, "")).trim();

    // Link
    const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim();

    // Source (media outlet name)
    const source = stripHtml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "").trim() || sourceLabel;

    // Publication date — keep for context
    const rawPubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    const pubDate = rawPubDate ? rawPubDate.replace(/\s*\+0000$/, "").trim() : "";

    // Description: Google News RSS description is just "{title} &nbsp; &nbsp; {source}"
    // Strip that noise and build a meaningful snippet from title + date instead
    const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
    const decodedDesc = rawDesc
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    const rawSnippet = stripHtml(decodedDesc)
      .replace(/&nbsp;/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    // If snippet is just "title - source" pattern (Google News default), use date instead
    const isTrivialSnippet = !rawSnippet
      || rawSnippet === title
      || rawSnippet.replace(/\s*-?\s*$/, "").toLowerCase().endsWith((source || "").toLowerCase())
      || rawSnippet.toLowerCase().replace(/\s+/g, " ").includes(title.toLowerCase().substring(0, 30));

    const snippet = isTrivialSnippet
      ? (pubDate ? `Dipublikasikan: ${pubDate}` : "")
      : rawSnippet.substring(0, 300);

    // Freshness: track age but don't skip — we sort fresh-first after collecting all
    let pubTimestamp = 0;
    if (rawPubDate) {
      const parsed = Date.parse(rawPubDate);
      if (!isNaN(parsed)) pubTimestamp = parsed;
    }
    const ageMs = pubTimestamp ? Date.now() - pubTimestamp : Number.MAX_SAFE_INTEGER;

    if (!title) continue;
    results.push({
      url: link,
      source,
      pubDate,
      ageMs,
      title: source ? `${title} - ${source}` : title,
      snippet
    });
    if (results.length >= 10) break; // collect more, will trim after sort
  }

  // Sort: fresh articles first (lowest ageMs), unknown age last
  results.sort((a, b) => (a.ageMs || Number.MAX_SAFE_INTEGER) - (b.ageMs || Number.MAX_SAFE_INTEGER));
  const topResults = results.slice(0, 5);

  const allSnippetText = topResults.map((r) => r.snippet).join(" ");
  const priceHints = (allSnippetText.match(/Rp[\s.]?[\d.,]+(?:[\s]*(?:\/liter|\/kg|\/gram|per liter|per kg|ribu|juta|rb\.?|jt\.?))?/gi) || []).slice(0, 5).join(", ");
  const pageText = topResults.map((r) => `${r.title}. ${r.snippet}`).join(" ").trim();

  if (priceHints && !topResults.some((r) => /Rp/i.test(r.snippet))) {
    topResults.push({ url: "", title: "Harga terdeteksi", snippet: priceHints });
  }

  return {
    results: topResults.slice(0, 5),
    pageText: pageText.slice(0, 5000),
    entityTitle: "",
    entitySubtitle: "",
    instantAnswer: ""
  };
}

function extractSourceLabelFromTitle(title = "") {
  const value = stripHtml(title).trim();
  if (!value) return "";
  const parts = value.split(" - ").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : "";
}

function resolveResultSourceLabel(result = {}, fallback = "Google News") {
  return String(result?.source || extractSourceLabelFromTitle(result?.title || "") || fallback).trim();
}

function resolvePayloadSourceLabel(payload = {}, fallback = "Google News") {
  const firstResult = Array.isArray(payload?.results) ? payload.results.find((item) => item && (item.source || item.title || item.snippet)) : null;
  return resolveResultSourceLabel(firstResult, fallback);
}

function buildSnapshotSummary(query, payload) {
  const items = (payload?.results || [])
    .slice(0, 5)
    .map((result, index) => {
      const title = cleanName(result.title || "Untitled result");
      const snippet = cleanName(result.snippet || "");
      return `${index + 1}. ${title}${snippet ? ` - ${snippet}` : ""}`;
    })
    .filter(Boolean);

  if (!items.length) return "";

  return [
    `Web search results for "${query}":`,
    ...items
  ].join("\n");
}

function buildCardAnchors(message, query) {
  const ticker = extractTicker(message);
  const lower = sanitizeSearchQueryText(message).toLowerCase();
  const anchors = [query, ticker]
    .concat(
      LIVE_ENTITY_KEYWORDS.filter((item) => lower.includes(item)),
      LIVE_PRODUCT_KEYWORDS.filter((item) => lower.includes(item)),
      LIVE_COMMODITY_KEYWORDS.filter((item) => lower.includes(item)),
      LIVE_VEHICLE_KEYWORDS.filter((item) => lower.includes(item)),
      LIVE_SPORTS_KEYWORDS.filter((item) => lower.includes(item)),
      LIVE_PERSON_RELATION_KEYWORDS.filter((item) => lower.includes(item)),
      LIVE_ADMIN_KEYWORDS.filter((item) => lower.includes(item))
    )
    .filter(Boolean);
  return [...new Set(anchors)];
}

function buildQueryAnchors(message, query = "") {
  const knownPhrases = [
    ...LIVE_ENTITY_KEYWORDS,
    ...LIVE_PRODUCT_KEYWORDS,
    ...LIVE_COMMODITY_KEYWORDS,
    ...LIVE_VEHICLE_KEYWORDS,
    ...LIVE_SPORTS_KEYWORDS,
    ...LIVE_PERSON_RELATION_KEYWORDS,
    ...LIVE_ADMIN_KEYWORDS
  ];
  const stopwords = new Set([
    "harga",
    "price",
    "rate",
    "kurs",
    "berapa",
    "how",
    "much",
    "the",
    "a",
    "an",
    "dan",
    "yang",
    "untuk",
    "with",
    "dengan",
    "hari",
    "ini",
    "today",
    "current",
    "latest",
    "right",
    "now",
    "saat",
    "terkini",
    "terbaru",
    ...CASUAL_FILLER_WORDS,
    "per",
    "kg",
    "gram",
    "bulan",
    "di",
    "in"
  ]);
  const baseText = normalizeSearchText(query || cleanLiveQuery(message)).toLowerCase();
  const phraseMatches = knownPhrases.filter((phrase) => hasPhrase(baseText, phrase));
  const tokens = baseText
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token) && !/^\d+$/.test(token));
  return [...new Set([...phraseMatches, ...tokens])];
}

function countAnchorMatches(text, anchors = []) {
  const haystack = normalizeSearchText(text).toLowerCase();
  if (!haystack || !anchors.length) return 0;
  let matches = 0;
  for (const anchor of anchors) {
    const cleanAnchor = String(anchor || "").trim().toLowerCase();
    if (!cleanAnchor) continue;
    if (hasPhrase(haystack, cleanAnchor)) {
      matches += 1;
    }
  }
  return matches;
}

function requiredAnchorMatches(message, anchors = []) {
  if (!anchors.length) return Infinity;
  const lower = normalizeSearchText(message).toLowerCase();
  const hasSpecificKnownEntity = hasAnyPhrase(lower, [
    ...LIVE_ENTITY_KEYWORDS,
    ...LIVE_PRODUCT_KEYWORDS,
    ...LIVE_COMMODITY_KEYWORDS,
    ...LIVE_VEHICLE_KEYWORDS
  ]);
  if (hasSpecificKnownEntity || anchors.some((anchor) => String(anchor).includes(" "))) {
    return 1;
  }
  return anchors.length >= 3 ? 2 : 1;
}

function hasRelevantPriceMatch(text, message, query = "") {
  const anchors = buildQueryAnchors(message, query);
  const required = requiredAnchorMatches(message, anchors);
  return countAnchorMatches(text, anchors) >= required;
}

function buildOfficeSubjectAnchors(message, query = "") {
  const subject = extractOfficeSubject(query || message);
  if (!subject) return [];
  return subject
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !["dan", "and", "the", "of"].includes(token));
}

function hasRelevantOfficeMatch(text, message, query = "") {
  const anchors = buildOfficeSubjectAnchors(message, query);
  if (!anchors.length) return true;
  return countAnchorMatches(text, anchors) >= 1;
}

function extractRelevantPageExcerpt(pageText, anchors = []) {
  const full = String(pageText || "").replace(/\s+/g, " ").trim();
  if (!full) return "";
  for (const anchor of anchors) {
    const cleanAnchor = String(anchor || "").trim();
    if (!cleanAnchor) continue;
    const index = full.toLowerCase().indexOf(cleanAnchor.toLowerCase());
    if (index >= 0) {
      const start = Math.max(0, index - 120);
      const end = Math.min(full.length, index + 520);
      return full.slice(start, end).trim();
    }
  }
  return full.slice(0, 520).trim();
}

function splitJinaContentBlocks(raw = "") {
  const cleaned = String(raw || "")
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[|*_`>#]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ");

  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const lineBlocks = cleaned
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [...new Set([...paragraphs, ...lineBlocks])]
    .filter((block) => block.length >= 40)
    .slice(0, 120);
}

function isLikelyBoilerplateBlock(block = "") {
  const text = normalizeSearchText(block).toLowerCase();
  if (!text) return true;
  const urlLikeCount = (String(block || "").match(/https?:\/\//gi) || []).length;
  return /^(title|url source|sumber url|markdown content):/.test(text)
    || /^#{1,6}\s/.test(String(block || "").trim())
    || /(cookie|newsletter|subscribe|langganan|sign in|log in|advertisement|iklan|all rights reserved|copyright|share this|baca juga|follow us)/.test(text)
    || /^(published time|updated|author):/i.test(String(block || "").trim())
    || urlLikeCount >= 2
    || /^(home|menu|search|next|previous)$/.test(text);
}

function scoreJinaContentBlock(block = "", anchors = [], queryKind = "") {
  const text = String(block || "").trim();
  if (!text || isLikelyBoilerplateBlock(text)) return -Infinity;

  const anchorMatches = countAnchorMatches(text, anchors);
  const sentenceCount = text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  const priceSignal = /\b(?:rp|idr|usd|harga|price|naik|turun)\b/i.test(text) ? 1 : 0;
  const officeSignal = /\b(?:presiden|wakil presiden|menteri|governor|gubernur|ceo|pm|prime minister)\b/i.test(text) ? 1 : 0;
  const sportsSignal = /\b(?:score|skor|menang|kalah|jadwal|kickoff|klasemen)\b/i.test(text) ? 1 : 0;
  const freshnessSignal = /\b(?:hari ini|today|current|latest|update|updated|published|dipublikasikan)\b/i.test(text) ? 1 : 0;

  let score = 0;
  score += anchorMatches * 8;
  score += freshnessSignal * 2;
  if (text.length >= 90 && text.length <= 420) score += 3;
  if (text.length > 420 && text.length <= 900) score += 1;
  if (sentenceCount >= 1 && sentenceCount <= 4) score += 2;
  if (queryKind === "price") score += priceSignal * 4;
  if (queryKind === "office") score += officeSignal * 4;
  if (queryKind === "sports") score += sportsSignal * 3;
  if (!anchors.length) score += 1;
  return score;
}

function extractAdaptiveSnippetFromJina(raw = "", options = {}) {
  const anchors = Array.isArray(options.anchors) ? options.anchors.filter(Boolean) : [];
  const queryKind = String(options.queryKind || "").trim().toLowerCase();
  const blocks = splitJinaContentBlocks(raw)
    .filter((block) => !isLikelyBoilerplateBlock(block))
    .map((block, index) => ({
      index,
      block,
      anchorMatches: countAnchorMatches(block, anchors),
      score: scoreJinaContentBlock(block, anchors, queryKind)
    }))
    .filter((item) => Number.isFinite(item.score));

  if (!blocks.length) return null;

  const ranked = [...blocks].sort((a, b) => b.score - a.score || a.index - b.index);
  const best = ranked[0];
  if (!best) return null;

  const companions = ranked
    .filter((item) => item.index !== best.index)
    .filter((item) => Math.abs(item.index - best.index) <= 2)
    .filter((item) => item.anchorMatches > 0 || Math.abs(item.block.length - best.block.length) <= 140)
    .slice(0, 2);

  const selected = [best, ...companions]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.block);

  const snippet = selected.join(" ").replace(/\s+/g, " ").trim();
  if (snippet) return snippet.slice(0, 800);

  return blocks
    .slice(0, 2)
    .map((item) => item.block)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function buildSearchSummary(query, payload, message) {
  const anchors = buildCardAnchors(message, query);
  const parts = [
    payload?.entityTitle,
    payload?.entitySubtitle,
    payload?.instantAnswer,
    extractRelevantPageExcerpt(payload?.pageText, anchors)
  ].filter(Boolean);
  return [...new Set(parts)].join(" ").trim();
}

function detectSourceType(label = "") {
  const value = String(label || "").toLowerCase();
  if (!value) return "unknown";
  if (/\.go\.|\.gov|\.ac\.|\.edu|official|resmi|coingecko|idx|bca\.co\.id/.test(value)) return "official";
  if (/wikipedia|wikimedia/.test(value)) return "reference";
  if (/cnbc|detik|kompas|tempo|bisnis|kontan|yahoo|bloomberg|reuters|investing/.test(value)) return "publisher";
  if (/google news|rss|blog|forum/.test(value)) return "aggregator";
  return "publisher";
}

function sourceWeight(sourceType = "unknown", sourceBucket = "") {
  if (sourceType === "official") return 1;
  if (sourceType === "reference") {
    if (sourceBucket === "knowledge" || sourceBucket === "history") return 0.92;
    if (sourceBucket === "statistic") return 0.74;
    if (sourceBucket === "official" || sourceBucket === "legal") return 0.42;
    return 0.7;
  }
  if (sourceType === "publisher") return 0.84;
  if (sourceType === "aggregator") return 0.66;
  return 0.58;
}

function summarizeEvidenceText(summary = "", directReply = "") {
  const clean = String(summary || directReply || "").replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

function makeCandidate(kind, sourceStage, summary, directReply, score, extra = {}) {
  const sourceLabel = extra.sourceLabel || "Google News";
  const sourceType = extra.sourceType || detectSourceType(sourceLabel);
  const sourceBucket = String(extra.sourceBucket || "").trim().toLowerCase();
  const weightedScore = Math.max(0, Math.min(1, Number(score || 0) * sourceWeight(sourceType, sourceBucket)));
  return {
    kind,
    sourceStage,
    summary,
    directReply,
    score: weightedScore,
    rawScore: Number(score || 0),
    sourceLabel,
    sourceType,
    sourceBucket,
    evidence: extra.evidence || summarizeEvidenceText(summary, directReply),
    confidence: Math.round(weightedScore * 100)
  };
}

function scoreExtraction(kind, sourceStage, directReply = "") {
  if (!directReply) return 0;
  const sourceBoost = sourceStage === "google_news_summary" ? 0.88 : 0.82;
  const kindBoostMap = {
    stock_identity: 0.96,
    office: 0.93,
    vehicle_price: 0.9,
    price: 0.84,
    count: 0.84,
    stock_price: 0.68
  };
  return Math.max(sourceBoost, kindBoostMap[kind] || sourceBoost);
}

function extractFromSearchSummary(message, queryKind, query, searchPayload, options = {}) {
  const source = resolvePayloadSourceLabel(searchPayload, "Google News");
  const sourceBucket = sourceBucketForCategory(options.routeCategory, queryKind);
  const ticker = extractTicker(message);
  const searchSummaryText = buildSearchSummary(query, searchPayload, message);
  if (!searchSummaryText) return null;

  if (queryKind === "stock") {
    const cardOnlyResults = [{ title: searchPayload.entityTitle || "Google News result", snippet: searchSummaryText, url: "" }];
    const profile = extractStockProfile(cardOnlyResults, ticker);
    if (isStockIdentityQuestion(message) && profile?.company) {
      const directReply = formatStockIdentityReply(profile, source);
      return makeCandidate("stock_identity", "google_news_summary", `Fresh Google News result identified stock ${profile.ticker || ticker} as ${profile.company}.`, directReply, scoreExtraction("stock_identity", "google_news_summary", directReply), { sourceLabel: source, sourceBucket, evidence: searchSummaryText });
    }

    const priceCandidate = extractStockPriceCandidate(cardOnlyResults, ticker);
    if (priceCandidate) {
      const directReply = formatStockPriceReply(profile || { ticker }, priceCandidate, source);
      return makeCandidate("stock_price", "google_news_summary", `Fresh Google News result found stock price ${formatCompactRupiah(priceCandidate)} for ${ticker || "the requested stock"}.`, directReply, scoreExtraction("stock_price", "google_news_summary", directReply), { sourceLabel: source, sourceBucket, evidence: searchSummaryText });
    }
  }

  if (queryKind === "office") {
    const officeEvidence = [searchPayload.entityTitle, searchPayload.entitySubtitle, searchPayload.instantAnswer, searchSummaryText, searchPayload.pageText]
      .filter(Boolean)
      .join(" ");
    const officeHolder = hasRelevantOfficeMatch(officeEvidence, message, query)
      ? findOfficeHolder(
        [searchPayload.entitySubtitle, searchPayload.instantAnswer, searchSummaryText, searchPayload.pageText].filter(Boolean).join(" "),
        searchPayload.entityTitle,
        message
      )
      : "";
    if (officeHolder) {
      const directReply = formatOfficeReply(officeHolder, source, message);
      return makeCandidate("office", "google_news_summary", `Fresh Google News result found office holder ${officeHolder}.`, directReply, scoreExtraction("office", "google_news_summary", directReply), { sourceLabel: source, sourceBucket, evidence: officeEvidence });
    }
  }

  if (queryKind === "count") {
    const countValue = findCountFact(searchSummaryText, searchPayload.entityTitle, message);
    if (countValue) {
      const directReply = formatCountReply(countValue, source, message);
      return makeCandidate("count", "google_news_summary", `Fresh Google News result found count ${countValue}.`, directReply, scoreExtraction("count", "google_news_summary", directReply), { sourceLabel: source, sourceBucket, evidence: searchSummaryText });
    }
  }

  if (queryKind === "price") {
    const priceCardText = [searchPayload.entityTitle, searchPayload.entitySubtitle, searchPayload.instantAnswer]
      .filter(Boolean)
      .join(" ")
      .trim();
    const priceValue = priceCardText && hasRelevantPriceMatch(priceCardText, message, query) && hasHistoricalDateMatch(priceCardText, message)
      ? findPrice(priceCardText, message)
      : "";
    if (priceValue) {
      const directReply = formatPriceReply(priceValue, source, message, priceCardText);
      return makeCandidate("price", "google_news_summary", `Fresh Google News result found ${priceValue}.`, directReply, scoreExtraction("price", "google_news_summary", directReply), { sourceLabel: source, sourceBucket, evidence: priceCardText });
    }
  }

  return null;
}

function extractFromSearchResults(message, queryKind, results, searchPayload, query, options = {}) {
  const source = resolvePayloadSourceLabel(searchPayload, "Google News");
  const sourceBucket = sourceBucketForCategory(options.routeCategory, queryKind);
  const ticker = extractTicker(message);
  const searchSummaryText = buildSearchSummary(query, searchPayload, message);

  if (queryKind === "stock") {
    const profile = extractStockProfile(results, ticker);
    if (isStockIdentityQuestion(message) && profile?.company) {
      const directReply = formatStockIdentityReply(profile, source);
      return makeCandidate("stock_identity", "google_news_results", `Fresh Google News result identified stock ${profile.ticker || ticker} as ${profile.company}.`, directReply, scoreExtraction("stock_identity", "google_news_results", directReply), { sourceLabel: source, sourceBucket, evidence: searchSummaryText });
    }

    const priceCandidate = extractStockPriceCandidate(results, ticker);
    if (priceCandidate) {
      const directReply = formatStockPriceReply(profile || { ticker }, priceCandidate, source);
      return makeCandidate("stock_price", "google_news_results", `Fresh Google News result found stock price ${formatCompactRupiah(priceCandidate)} for ${ticker || "the requested stock"}.`, directReply, scoreExtraction("stock_price", "google_news_results", directReply), { sourceLabel: source, sourceBucket, evidence: searchSummaryText });
    }
  }

  if (queryKind === "price" && isVehiclePriceQuery(message)) {
    const vehicleRange = findVehiclePriceRange(results);
    if (vehicleRange) {
      const directReply = formatVehiclePriceReply(vehicleRange, source, message);
      return makeCandidate("vehicle_price", "google_news_results", `Fresh Google News result found used vehicle range ${formatCompactRupiah(vehicleRange.min)} to ${formatCompactRupiah(vehicleRange.max)}.`, directReply, scoreExtraction("vehicle_price", "google_news_results", directReply), { sourceLabel: source, sourceBucket, evidence: results.map((r) => [r.title, r.snippet].filter(Boolean).join(" - ")).join(" ") });
    }
  }

  for (const result of results.slice(0, 5)) {
    const snippetText = stripHtml([result.title, result.snippet].filter(Boolean).join(" "));
    const resultSource = resolveResultSourceLabel(result, source);

    if (queryKind === "office") {
      if (!hasRelevantOfficeMatch([result.title, result.snippet].filter(Boolean).join(" "), message, query)) continue;
      const officeHolder = findOfficeHolder(snippetText, result.title, message);
      if (officeHolder) {
        const directReply = formatOfficeReply(officeHolder, resultSource, message);
        return makeCandidate("office", "google_news_results", `Fresh Google News result found office holder ${officeHolder}.`, directReply, scoreExtraction("office", "google_news_results", directReply), { sourceLabel: resultSource, sourceBucket, evidence: snippetText });
      }
    }

    if (queryKind === "count") {
      const countValue = findCountFact(snippetText, result.title, message);
      if (countValue) {
        const directReply = formatCountReply(countValue, resultSource, message);
        return makeCandidate("count", "google_news_results", `Fresh Google News result found count ${countValue}.`, directReply, scoreExtraction("count", "google_news_results", directReply), { sourceLabel: resultSource, sourceBucket, evidence: snippetText });
      }
    }

    if (queryKind === "price") {
      const priceEvidence = [result.title, result.snippet].filter(Boolean).join(" ");
      if (!hasRelevantPriceMatch(priceEvidence, message, query) || !hasHistoricalDateMatch(priceEvidence, message)) continue;
      const priceValue = findPrice(priceEvidence, message);
      if (priceValue) {
        const directReply = formatPriceReply(priceValue, resultSource, message, priceEvidence);
        return makeCandidate("price", "google_news_results", `Fresh Google News result found ${priceValue}.`, directReply, scoreExtraction("price", "google_news_results", directReply), { sourceLabel: resultSource, sourceBucket, evidence: priceEvidence });
      }
    }
  }

  return null;
}

function buildEvidenceLine(candidate) {
  if (!candidate) return "";
  const evidence = summarizeEvidenceText(candidate.evidence, candidate.directReply);
  return evidence ? `Evidence: ${evidence}` : "";
}

function decideLiveOutcome(message, queryKind, query, searchPayload, candidates = [], options = {}) {
  const ranked = candidates.filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 5);
  const best = ranked[0];
  const currentDataConfidence = best?.confidence || 0;
  const evidenceSummary = ranked
    .slice(0, 3)
    .map((candidate, index) => `${index + 1}. ${candidate.sourceLabel} (${candidate.sourceType}) score ${candidate.confidence}: ${summarizeEvidenceText(candidate.evidence, candidate.directReply)}`)
    .join("\n");
  const snapshot = buildSnapshotSummary(query, searchPayload)
    || `Google News search found results for "${query}", but snippets were insufficient for direct extraction.`;

  if (options.synthesisOnly) {
    return {
      name: "web.live",
      summary: [snapshot, evidenceSummary ? `Top evidence:
${evidenceSummary}` : "", best ? `Current-data confidence: ${currentDataConfidence}.` : ""]
        .filter(Boolean)
        .join("\n"),
      directReply: "",
      engine: { score: currentDataConfidence, evidence: ranked.slice(0, 3) }
    };
  }

  if (best && best.score >= 0.8) {
    return {
      name: "web.live",
      summary: best.summary,
      directReply: `${stripReplySource(best.directReply)}\n\n${buildEvidenceLine(best)}\n\nScore: ${currentDataConfidence}`,
      engine: { score: currentDataConfidence, evidence: ranked.slice(0, 3) }
    };
  }

  return {
    name: "web.live",
    summary: [snapshot, evidenceSummary ? `Top evidence:
${evidenceSummary}` : "", best ? `Current-data confidence: ${currentDataConfidence}.` : ""]
      .filter(Boolean)
      .join("\n"),
    directReply: options.synthesisOnly ? "" : buildInconclusiveReply(message, queryKind),
    engine: { score: currentDataConfidence, evidence: ranked.slice(0, 3) }
  };
}

/**
 * Fetch top article URL from RSS results via Jina Reader to get real content snippet.
 * Only runs when Jina API key is configured. Returns enriched snippet or null.
 */
async function fetchArticleSnippetViaJina(url, options = {}) {
  if (!JINA_API_KEY || !url || !/^https?:\/\//i.test(url)) return null;
  try {
    const raw = await fetchViaJina(url, { accept: "text/html,application/xhtml+xml" });
    if (!raw || raw.length < 200) return null;

    const anchors = Array.isArray(options.anchors) ? options.anchors : [];
    return extractAdaptiveSnippetFromJina(raw, {
      anchors,
      queryKind: options.queryKind
    });
  } catch {
    return null;
  }
}

async function fetchSearchResults(client, query, options = {}) {
  const response = await client.get(GOOGLE_NEWS_RSS_URL, {
    params: { q: query, hl: "id", gl: "ID", ceid: "ID:id" }
  });
  const parsed = extractSearchResults(response.data);

  // Enrich most recent result with actual article content via Jina Reader
  if (JINA_API_KEY && parsed.results.length > 0) {
    // Sort by age ascending (freshest first) before picking for Jina
    const candidates = parsed.results
      .filter((r) => r.url && /^https?:\/\//i.test(r.url))
      .sort((a, b) => (a.ageMs || 0) - (b.ageMs || 0));
    const topResult = candidates[0] || parsed.results.find((r) => r.url && /^https?:\/\//i.test(r.url));
    if (topResult) {
      const articleSnippet = await fetchArticleSnippetViaJina(topResult.url, {
        anchors: buildQueryAnchors(options.message || query, query),
        queryKind: options.queryKind
      }).catch(() => null);
      if (articleSnippet) {
        topResult.snippet = articleSnippet;
        parsed.pageText = parsed.results
          .map((r) => `${r.title}. ${r.snippet}`)
          .join(" ")
          .trim()
          .slice(0, 5000);
      }
    }
  }

  return parsed;
}

async function fetchWikipediaResults(client, query) {
  const languageOrder = ["id", "en"];
  const collected = [];

  for (const language of languageOrder) {
    const response = await client.get(`https://${language}.wikipedia.org/w/api.php`, {
      params: {
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrlimit: 5,
        prop: "extracts|info",
        inprop: "url",
        exintro: 1,
        explaintext: 1,
        exchars: 420,
        format: "json",
        origin: "*"
      }
    });

    const pages = Object.values(response?.data?.query?.pages || {})
      .sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0))
      .map((page) => ({
        url: String(page?.fullurl || "").trim(),
        source: "Wikipedia",
        title: `${stripHtml(page?.title || "").trim()} - Wikipedia`,
        snippet: stripHtml(page?.extract || "").trim().slice(0, 420)
      }))
      .filter((page) => page.title || page.snippet);

    for (const page of pages) {
      if (collected.some((existing) => existing.url === page.url || existing.title === page.title)) continue;
      collected.push(page);
      if (collected.length >= 5) break;
    }

    if (collected.length >= 3) break;
  }

  return {
    results: collected.slice(0, 5),
    pageText: collected.map((result) => `${result.title}. ${result.snippet}`).join(" ").slice(0, 6000),
    entityTitle: "",
    entitySubtitle: "",
    instantAnswer: ""
  };
}

async function fetchCryptoRssResults(client, query) {
  if (!CRYPTO_RSS_URLS.length) {
    return { results: [], pageText: "", entityTitle: "", entitySubtitle: "", instantAnswer: "" };
  }

  const settled = await Promise.allSettled(
    CRYPTO_RSS_URLS.map(async (url) => {
      const response = await client.get(url);
      return extractSearchResults(response.data, { sourceLabel: new URL(url).hostname.replace(/^www\./, "") });
    })
  );
  const queryAnchors = buildQueryAnchors(query);
  const results = settled
    .filter((entry) => entry.status === "fulfilled")
    .flatMap((entry) => entry.value.results || [])
    .filter((result) => {
      const text = [result.title, result.snippet].filter(Boolean).join(" ");
      return !queryAnchors.length || countAnchorMatches(text, queryAnchors) >= 1;
    })
    .slice(0, 5);

  return {
    results,
    pageText: results.map((result) => `${result.title}. ${result.snippet}`).join(" ").slice(0, 5000),
    entityTitle: "",
    entitySubtitle: "",
    instantAnswer: ""
  };
}

async function fetchRegistryRssResults(client, query, message, routeCategory = "") {
  const sources = getRelevantRssSources(message, routeCategory);
  if (!sources.length) {
    return { results: [], pageText: "", entityTitle: "", entitySubtitle: "", instantAnswer: "" };
  }

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await client.get(source.url);
      const payload = extractSearchResults(response.data, { sourceLabel: source.name });
      return {
        source,
        payload
      };
    })
  );

  const queryAnchors = buildQueryAnchors(query);
  const results = settled
    .filter((entry) => entry.status === "fulfilled")
    .flatMap((entry) => {
      const source = entry.value.source;
      return (entry.value.payload.results || []).map((result) => ({
        ...result,
        title: result.title || source.name,
        snippet: result.snippet || ""
      }));
    })
    .filter((result) => {
      const text = [result.title, result.snippet].filter(Boolean).join(" ");
      return !queryAnchors.length || countAnchorMatches(text, queryAnchors) >= 1;
    })
    .slice(0, 6);

  return {
    results,
    pageText: results.map((result) => `${result.title}. ${result.snippet}`).join(" ").slice(0, 6000),
    entityTitle: "",
    entitySubtitle: "",
    instantAnswer: ""
  };
}

function mergeSearchPayloads(...payloads) {
  const results = [];
  for (const payload of payloads) {
    for (const result of payload?.results || []) {
      if (!result.title && !result.snippet) continue;
      if (results.some((existing) => existing.url === result.url || existing.title === result.title)) continue;
      results.push(result);
    }
  }

  return {
    results: results.slice(0, 8),
    pageText: payloads.map((payload) => payload?.pageText || "").filter(Boolean).join(" ").slice(0, 8000),
    entityTitle: payloads.find((payload) => payload?.entityTitle)?.entityTitle || "",
    entitySubtitle: payloads.find((payload) => payload?.entitySubtitle)?.entitySubtitle || "",
    instantAnswer: payloads.find((payload) => payload?.instantAnswer)?.instantAnswer || ""
  };
}

function evaluateSearchPayload(message, queryKind, query, searchPayload, options = {}) {
  if (!searchPayload?.results?.length) return null;
  const results = searchPayload.results;
  const cardCandidate = extractFromSearchSummary(message, queryKind, query, searchPayload, { routeCategory: options.routeCategory });
  const resultsCandidate = extractFromSearchResults(message, queryKind, results, searchPayload, query, { routeCategory: options.routeCategory });
  return decideLiveOutcome(message, queryKind, query, searchPayload, [cardCandidate, resultsCandidate], {
    secondHop: options.secondHop,
    synthesisOnly: Boolean(options.synthesisOnly)
  });
}

function isUsefulOutcome(outcome) {
  if (!outcome) return false;
  if ((outcome.engine?.score || 0) > 0) return true;
  if (String(outcome.directReply || '').trim() && !/belum cukup jelas/i.test(String(outcome.directReply || ''))) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(task, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3));
  const delayMs = Math.max(0, Number(options.delayMs || 450));
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError || new Error("Retry failed.");
}

function finalizeToolRouteResult(result, options = {}) {
  if (!result) return null;
  const metadata = result && typeof result === "object" ? result._routeMeta || null : null;
  if (!options.synthesisOnly) {
    return metadata ? { ...result, _routeMeta: metadata } : result;
  }
  return {
    name: "web.live",
    summary: `${result.summary}\nBest extracted candidate: ${stripReplySource(result.directReply)}.`.trim(),
    directReply: "",
    ...(result?.contextText ? { contextText: result.contextText } : {}),
    ...(metadata ? { _routeMeta: metadata } : {})
  };
}

function isSubstantiveToolRouteResult(result) {
  if (!result) return false;
  if (result?._routeMeta?.isFallback) return false;
  if (String(result.directReply || "").trim()) return true;
  return /Best extracted candidate:/i.test(String(result.summary || ""));
}

async function resolveCategorySources({ client, message, route, options = {} }) {
  let fallbackCandidate = null;

  for (const source of route.sources || []) {
    let candidate = null;

    if (source === "crypto_multi_news") {
      candidate = await withRetry(() => runCryptoNewsLookup(message), { attempts: 2 }).catch(() => null);
    } else if (source === "coingecko") {
      candidate = await withRetry(() => fetchCoinGeckoCryptoPrice(client, message), { attempts: 3 }).catch(() => null);
    } else if (source === "coingecko_historical") {
      candidate = await withRetry(() => fetchCoinGeckoHistoricalCryptoPrice(client, message), { attempts: 3 }).catch(() => null);
    } else if (source === "logam_mulia") {
      candidate = await withRetry(() => fetchLogamMuliaGoldPrice(client, message), { attempts: 2 }).catch(() => null);
    } else if (source === "yahoo_gold") {
      candidate = await withRetry(() => fetchYahooFinanceGoldPrice(client, message), { attempts: 2 }).catch(() => null);
    } else if (source === "pihps") {
      candidate = await withRetry(() => fetchPihpsCommodityPrice(message), { attempts: 2 }).catch(() => null);
    } else if (source === "panel_harga_pangan") {
      const rawCandidate = await withRetry(() => fetchPanelHargaPanganPortal(), { attempts: 1 }).catch(() => null);
      candidate = rawCandidate
        ? { ...rawCandidate, _routeMeta: { source, category: route.category, isFallback: true } }
        : null;
    }

    if (!candidate) continue;

    const finalized = finalizeToolRouteResult(candidate, options);
    if (isSubstantiveToolRouteResult(finalized)) {
      return finalized;
    }

    if (!fallbackCandidate) {
      fallbackCandidate = finalized;
    }
  }

  return fallbackCandidate;
}

function createRouteSearchProviders(client, message, route, queryKind) {
  const defaults = createDefaultSearchProviders({ client, message, route, queryKind });
  const xDefaults = createDefaultXSearchProviders();
  const primaryProviders = [...defaults.primaryProviders];
  const fallbackProviders = [...defaults.fallbackProviders];
  const xPrimaryProviders = route.sources.includes("x_search") ? [...xDefaults.primaryProviders] : [];
  const xFallbackProviders = route.sources.includes("x_search") ? [...xDefaults.fallbackProviders] : [];

  if (route.sources.includes("search")) {
    primaryProviders.length = 0;
    primaryProviders.push(createSearchProvider({
      id: "google_news",
      search: async (query) => await withRetry(() => fetchSearchResults(client, query, { message, queryKind }), { attempts: 3 })
    }));
  }

  if (route.sources.includes("registry_rss")) {
    fallbackProviders.push(createSearchProvider({
      id: "registry_rss",
      search: async (query) => await withRetry(() => fetchRegistryRssResults(client, query, message, route.category), { attempts: 2 })
    }));
  }

  if (route.sources.includes("crypto_rss")) {
    fallbackProviders.push(createSearchProvider({
      id: "crypto_rss",
      search: async (query) => await withRetry(() => fetchCryptoRssResults(client, query), { attempts: 3 })
    }));
  }

  if (route.sources.includes("wikipedia")) {
    fallbackProviders.push(createSearchProvider({
      id: "wikipedia",
      search: async (query) => await withRetry(() => fetchWikipediaResults(client, query), { attempts: 2 })
    }));
  }

  return { primaryProviders, fallbackProviders, xPrimaryProviders, xFallbackProviders };
}

async function runSingleWebLiveLookup(message, options = {}) {
  const secondHop = Boolean(options.secondHop);
  const liveIntent = detectLiveIntent(message);
  const forceLookup = Boolean(options.forceLookup || options.categoryHint);
  if (!liveIntent.shouldLookup && !forceLookup) {
    throw new Error("No live lookup needed for this message.");
  }

  if (shouldFetchDirectUrl(message)) {
    return fetchDirectUrlContent(message);
  }

  const client = axios.create({
    timeout: 15000,
    proxy: false,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
  });

  const route = resolveLiveRoute(message, options);
  const queryKind = route.intent;
  const routeCandidate = await resolveCategorySources({ client, message, route, options });
  if (isSubstantiveToolRouteResult(routeCandidate)) {
    return finalizeToolRouteResult(routeCandidate, options);
  }

  // Use LLM-generated query if provided (authoritative), fallback to built queries
  const overrideQuery = String(options.overrideQuery || "").trim();
  const queries = overrideQuery
    ? [overrideQuery, ...buildSecondHopSearchQueries(message, queryKind)]
    : secondHop
      ? buildSecondHopSearchQueries(message, queryKind)
      : [buildSearchQuery(message), buildFallbackSearchQuery(message, queryKind)];

  const { primaryProviders, fallbackProviders, xPrimaryProviders, xFallbackProviders } = createRouteSearchProviders(client, message, route, queryKind);

  let selectedQuery = "";
  let selectedOutcome = null;
  for (const query of queries) {
    const xSearchResponse = (xPrimaryProviders.length || xFallbackProviders.length)
      ? await xSearch(query, {
          primaryProviders: xPrimaryProviders,
          fallbackProviders: xFallbackProviders,
          cacheTtlMs: 15 * 60 * 1000,
          mergeAcrossProviders: true
        }).catch(() => null)
      : null;

    const searchResponse = await searchWeb(query, {
      primaryProviders,
      fallbackProviders,
      cacheTtlMs: 15 * 60 * 1000,
      mergeAcrossProviders: true
    }).catch(() => null);

    const payloads = [xSearchResponse?.payload, searchResponse?.payload].filter((payload) => payload?.results?.length);
    const categoryPayload = payloads.length
      ? mergePayloads(payloads)
      : (searchResponse?.payload || xSearchResponse?.payload || null);

    if (categoryPayload?.results?.length) {
      const categoryOutcome = evaluateSearchPayload(message, queryKind, query, categoryPayload, {
        routeCategory: route.category,
        secondHop,
        synthesisOnly: Boolean(options.synthesisOnly)
      });
      selectedQuery = query;
      if (isUsefulOutcome(categoryOutcome)) {
        selectedOutcome = categoryOutcome;
        break;
      }
      selectedOutcome = categoryOutcome;
    }
  }

  if (!selectedOutcome) {
    if (routeCandidate) return routeCandidate;
    return {
      name: "web.live",
      summary: `No live web results found for historical-aware query: ${buildSearchQuery(message)}.`,
      directReply: options.synthesisOnly ? "" : buildInconclusiveReply(message, queryKind),
      engine: { score: 0, evidence: [] }
    };
  }

  return selectedOutcome;
}

async function runMultiOfficeWebLiveLookup(message, options = {}) {
  const roles = detectOfficeRoles(message);
  const subject = extractOfficeSubject(message);
  if (roles.length < 2 || !subject) {
    return runSingleWebLiveLookup(message, options);
  }

  const replies = [];
  const summaries = [];
  const missingRoles = [];
  for (const role of roles) {
    const subQuery = `${role.canonical} ${subject}`.trim();
    const result = await runSingleWebLiveLookup(subQuery, options);
    summaries.push(result.summary);
    if (!result.directReply || /belum cukup jelas/i.test(result.directReply)) {
      missingRoles.push(role.canonical);
      continue;
    }
    replies.push(stripReplySource(result.directReply));
  }

  if (replies.length && missingRoles.length) {
    return {
      name: "web.live",
      summary: summaries.filter(Boolean).join("\n"),
      directReply: options.secondHop
        ? `${replies.join("\n")}\n\nSaya sudah cek Google News search lanjutan, tapi untuk ${missingRoles.join(" dan ")} masih belum cukup jelas.`
        : `${replies.join("\n")}\n\nUntuk ${missingRoles.join(" dan ")} hasil Google News search yang saya dapatkan belum cukup jelas. Mau saya cari di sumber lain?`
    };
  }

  if (!replies.length) {
    return {
      name: "web.live",
      summary: summaries.filter(Boolean).join("\n"),
      directReply: options.secondHop
        ? "Saya sudah cek Google News search lanjutan, tapi hasilnya masih belum cukup jelas."
        : buildInconclusiveReply(message, "office")
    };
  }

  return {
    name: "web.live",
    summary: summaries.filter(Boolean).join("\n"),
    directReply: `${replies.join("\n")}\n\nSumber: Google News.`
  };
}

async function runWebLiveLookup(message, options = {}) {
  const queryKind = classifyLiveIntent(message);
  if (!options.synthesisOnly && queryKind === "office" && detectOfficeRoles(message).length > 1) {
    return runMultiOfficeWebLiveLookup(message, options);
  }
  return runSingleWebLiveLookup(message, options);
}

module.exports = {
  detectLiveIntent,
  cleanLiveQuery,
  classifyLiveIntent,
  needsWebLiveLookup,
  runWebLiveLookup
};
