const axios = require("axios");
const {
  APP_LOCALE,
  COINGECKO_API_KEY,
  COINGECKO_SIMPLE_PRICE_URL,
  CRYPTO_RSS_URLS,
  GOOGLE_NEWS_RSS_URL
} = require("../config");

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
      shouldLookup: false,
      reason: "url"
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
  const hasOfficeIntent = hasAnyPhrase(text, LIVE_OFFICE_KEYWORDS);
  const hasPersonRelationIntent = hasAnyPhrase(text, LIVE_PERSON_RELATION_KEYWORDS);
  const hasCountIntent = hasAnyPhrase(text, LIVE_COUNT_KEYWORDS);
  const hasAdminEntity = hasAnyPhrase(text, LIVE_ADMIN_KEYWORDS);
  const hasStockIntent = isStockQuery(message);

  const shouldLookup = Boolean(
    hasModeTrigger
    || hasLinkIntent
    || hasPriceIntent
    || hasStockIntent
    || hasOfficeIntent
    || hasPersonRelationIntent
    || (hasCountIntent && hasAdminEntity)
    || (hasTemporalIntent && (hasDataIntent || hasLinkIntent || hasEntity || hasSportsEntity || hasCommodity || hasVehicle || hasAdminEntity))
    || (hasDataIntent && hasCommodity)
    || (hasDataIntent && hasVehicle)
    || (hasDataIntent && hasEntity)
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
      hasCommodity,
      hasVehicle,
      hasOfficeIntent,
      hasPersonRelationIntent,
      hasCountIntent,
      hasAdminEntity,
      hasStockIntent
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
    const updated = line.updatedAt ? ` (${line.updatedAt})` : "";
    return `${line.symbol}: ${prices}${change}${updated}`;
  }).join("\n");

  return isIndonesian
    ? `Harga crypto yang saya temukan:\n${body}\n\nSumber: CoinGecko.`
    : `Crypto price found:\n${body}\n\nSource: CoinGecko.`;
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

function cleanLiveQuery(message) {
  return sanitizeSearchQueryText(message);
}

function buildSearchQuery(message) {
  const queryText = cleanLiveQuery(message);
  const lower = queryText.toLowerCase();
  const commodity = extractCommodityLabel(message);
  const location = extractLocationLabel(message);

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
  } else if (queryKind === "price" || queryKind === "stock") {
    const simplified = cleanLiveQuery(message);
    queries.push(`${simplified} official`);
    queries.push(`${simplified} resmi`);
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
  return "price";
}

function classifyLiveIntent(message) {
  return detectQueryKind(message);
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
    const title = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
    const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim();
    const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
    const decodedDesc = rawDesc.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, "\"");
    const snippet = stripHtml(decodedDesc).trim();
    const source = stripHtml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "").trim() || sourceLabel;

    if (!title) continue;
    results.push({
      url: link,
      title: source ? `${title} - ${source}` : title,
      snippet: snippet ? snippet.substring(0, 300) : ""
    });
    if (results.length >= 5) break;
  }

  const allSnippetText = results.map((r) => r.snippet).join(" ");
  const priceHints = (allSnippetText.match(/Rp[\s.]?[\d.,]+(?:[\s]*(?:\/liter|\/kg|\/gram|per liter|per kg|ribu|juta|rb\.?|jt\.?))?/gi) || []).slice(0, 5).join(", ");
  const pageText = results.map((r) => `${r.title}. ${r.snippet}`).join(" ").trim();

  if (priceHints && !results.some((r) => /Rp/i.test(r.snippet))) {
    results.push({ url: "", title: "Harga terdeteksi", snippet: priceHints });
  }

  return {
    results: results.slice(0, 5),
    pageText: pageText.slice(0, 5000),
    entityTitle: "",
    entitySubtitle: "",
    instantAnswer: ""
  };
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

function makeCandidate(kind, sourceStage, summary, directReply, score) {
  return { kind, sourceStage, summary, directReply, score };
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

function extractFromSearchSummary(message, queryKind, query, searchPayload) {
  const source = "Google News";
  const ticker = extractTicker(message);
  const searchSummaryText = buildSearchSummary(query, searchPayload, message);
  if (!searchSummaryText) return null;

  if (queryKind === "stock") {
    const cardOnlyResults = [{ title: searchPayload.entityTitle || "Google News result", snippet: searchSummaryText, url: "" }];
    const profile = extractStockProfile(cardOnlyResults, ticker);
    if (isStockIdentityQuestion(message) && profile?.company) {
      const directReply = formatStockIdentityReply(profile, source);
      return makeCandidate("stock_identity", "google_news_summary", `Fresh Google News result identified stock ${profile.ticker || ticker} as ${profile.company}.`, directReply, scoreExtraction("stock_identity", "google_news_summary", directReply));
    }

    const priceCandidate = extractStockPriceCandidate(cardOnlyResults, ticker);
    if (priceCandidate) {
      const directReply = formatStockPriceReply(profile || { ticker }, priceCandidate, source);
      return makeCandidate("stock_price", "google_news_summary", `Fresh Google News result found stock price ${formatCompactRupiah(priceCandidate)} for ${ticker || "the requested stock"}.`, directReply, scoreExtraction("stock_price", "google_news_summary", directReply));
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
      return makeCandidate("office", "google_news_summary", `Fresh Google News result found office holder ${officeHolder}.`, directReply, scoreExtraction("office", "google_news_summary", directReply));
    }
  }

  if (queryKind === "count") {
    const countValue = findCountFact(searchSummaryText, searchPayload.entityTitle, message);
    if (countValue) {
      const directReply = formatCountReply(countValue, source, message);
      return makeCandidate("count", "google_news_summary", `Fresh Google News result found count ${countValue}.`, directReply, scoreExtraction("count", "google_news_summary", directReply));
    }
  }

  if (queryKind === "price") {
    const priceCardText = [searchPayload.entityTitle, searchPayload.entitySubtitle, searchPayload.instantAnswer]
      .filter(Boolean)
      .join(" ")
      .trim();
    const priceValue = priceCardText && hasRelevantPriceMatch(priceCardText, message, query)
      ? findPrice(priceCardText, message)
      : "";
    if (priceValue) {
      const directReply = formatPriceReply(priceValue, source, message, priceCardText);
      return makeCandidate("price", "google_news_summary", `Fresh Google News result found ${priceValue}.`, directReply, scoreExtraction("price", "google_news_summary", directReply));
    }
  }

  return null;
}

function extractFromSearchResults(message, queryKind, results, searchPayload, query) {
  const source = "Google News";
  const ticker = extractTicker(message);
  const searchSummaryText = buildSearchSummary(query, searchPayload, message);

  if (queryKind === "stock") {
    const profile = extractStockProfile(results, ticker);
    if (isStockIdentityQuestion(message) && profile?.company) {
      const directReply = formatStockIdentityReply(profile, source);
      return makeCandidate("stock_identity", "google_news_results", `Fresh Google News result identified stock ${profile.ticker || ticker} as ${profile.company}.`, directReply, scoreExtraction("stock_identity", "google_news_results", directReply));
    }

    const priceCandidate = extractStockPriceCandidate(results, ticker);
    if (priceCandidate) {
      const directReply = formatStockPriceReply(profile || { ticker }, priceCandidate, source);
      return makeCandidate("stock_price", "google_news_results", `Fresh Google News result found stock price ${formatCompactRupiah(priceCandidate)} for ${ticker || "the requested stock"}.`, directReply, scoreExtraction("stock_price", "google_news_results", directReply));
    }
  }

  if (queryKind === "price" && isVehiclePriceQuery(message)) {
    const vehicleRange = findVehiclePriceRange(results);
    if (vehicleRange) {
      const directReply = formatVehiclePriceReply(vehicleRange, source, message);
      return makeCandidate("vehicle_price", "google_news_results", `Fresh Google News result found used vehicle range ${formatCompactRupiah(vehicleRange.min)} to ${formatCompactRupiah(vehicleRange.max)}.`, directReply, scoreExtraction("vehicle_price", "google_news_results", directReply));
    }
  }

  for (const result of results.slice(0, 5)) {
    const snippetText = stripHtml([result.title, result.snippet].filter(Boolean).join(" "));

    if (queryKind === "office") {
      if (!hasRelevantOfficeMatch([result.title, result.snippet].filter(Boolean).join(" "), message, query)) continue;
      const officeHolder = findOfficeHolder(snippetText, result.title, message);
      if (officeHolder) {
        const directReply = formatOfficeReply(officeHolder, source, message);
        return makeCandidate("office", "google_news_results", `Fresh Google News result found office holder ${officeHolder}.`, directReply, scoreExtraction("office", "google_news_results", directReply));
      }
    }

    if (queryKind === "count") {
      const countValue = findCountFact(snippetText, result.title, message);
      if (countValue) {
        const directReply = formatCountReply(countValue, source, message);
        return makeCandidate("count", "google_news_results", `Fresh Google News result found count ${countValue}.`, directReply, scoreExtraction("count", "google_news_results", directReply));
      }
    }

    if (queryKind === "price") {
      const priceEvidence = [result.title, result.snippet].filter(Boolean).join(" ");
      if (!hasRelevantPriceMatch(priceEvidence, message, query)) continue;
      const priceValue = findPrice(priceEvidence, message);
      if (priceValue) {
        const directReply = formatPriceReply(priceValue, source, message, priceEvidence);
        return makeCandidate("price", "google_news_results", `Fresh Google News result found ${priceValue}.`, directReply, scoreExtraction("price", "google_news_results", directReply));
      }
    }
  }

  return null;
}

function decideLiveOutcome(message, queryKind, query, searchPayload, candidates = [], options = {}) {
  const ranked = candidates.filter(Boolean).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (options.synthesisOnly) {
    const extracted = best?.directReply && !/\b(Google News|Example|Contoh)\b/i.test(best.directReply)
      ? `\nBest extracted candidate: ${stripReplySource(best.directReply)}.`
      : "";
    return {
      name: "web.live",
      summary: `${buildSnapshotSummary(query, searchPayload)
        || `Google News search found results for "${query}", but snippets were insufficient for direct extraction.`}${extracted}`,
      directReply: ""
    };
  }

  if (best && best.score >= 0.8) {
    return {
      name: "web.live",
      summary: best.summary,
      directReply: best.directReply
    };
  }

  // Confidence too low for direct extraction — let AI model synthesize from toolContext
  return {
    name: "web.live",
    summary: buildSnapshotSummary(query, searchPayload)
      || `Google News search found results for "${query}", but snippets were insufficient for direct extraction.`,
    directReply: ""  // empty = AI will use toolContext to generate answer
  };
}

async function fetchSearchResults(client, query) {
  const response = await client.get(GOOGLE_NEWS_RSS_URL, {
    params: { q: query, hl: "id", gl: "ID", ceid: "ID:id" }
  });
  return extractSearchResults(response.data);
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

async function runSingleWebLiveLookup(message, options = {}) {
  const secondHop = Boolean(options.secondHop);
  const liveIntent = detectLiveIntent(message);
  if (!liveIntent.shouldLookup) {
    throw new Error("No live lookup needed for this message.");
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

  const queryKind = classifyLiveIntent(message);
  if (queryKind === "price" && isCryptoQuery(message)) {
    const cryptoCandidate = await withRetry(() => fetchCoinGeckoCryptoPrice(client, message), { attempts: 3 })
      .catch(() => null);
    if (cryptoCandidate) {
      if (options.synthesisOnly) {
        return {
          name: "web.live",
          summary: `${cryptoCandidate.summary}\nBest extracted candidate: ${stripReplySource(cryptoCandidate.directReply)}.`,
          directReply: ""
        };
      }
      return cryptoCandidate;
    }
  }

  const queries = secondHop
    ? buildSecondHopSearchQueries(message, queryKind)
    : [buildSearchQuery(message), buildFallbackSearchQuery(message, queryKind)];

  let selectedQuery = "";
  let searchPayload = null;
  for (const query of queries) {
    const googlePayload = await withRetry(() => fetchSearchResults(client, query), { attempts: 3 });
    const cryptoPayload = isCryptoQuery(message)
      ? await withRetry(() => fetchCryptoRssResults(client, query), { attempts: 3 })
      : null;
    const payload = cryptoPayload
      ? mergeSearchPayloads(googlePayload, cryptoPayload)
      : googlePayload;
    if (payload.results.length) {
      selectedQuery = query;
      searchPayload = payload;
      break;
    }
  }

  if (!searchPayload?.results?.length) {
    throw new Error("No live web results found.");
  }

  const results = searchPayload.results;
  const cardCandidate = extractFromSearchSummary(message, queryKind, selectedQuery, searchPayload);
  const resultsCandidate = extractFromSearchResults(message, queryKind, results, searchPayload, selectedQuery);
  return decideLiveOutcome(message, queryKind, selectedQuery, searchPayload, [cardCandidate, resultsCandidate], {
    secondHop,
    synthesisOnly: Boolean(options.synthesisOnly)
  });
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
