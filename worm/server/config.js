const path = require("path");

function parseJsonEnv(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[config] Failed to parse ${name}: ${error.message}`);
    return fallback;
  }
}

const PORT = Number(process.env.PORT || 3842);
const APP_LOCALE = process.env.APP_LOCALE || "id-ID";
const APP_TIMEZONE = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:3b";
const OLLAMA_CONTEXT_TOKENS = Number(process.env.OLLAMA_CONTEXT_TOKENS || 8192);
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "stepfun-ai/step-3.5-flash";
const NVIDIA_CONTEXT_TOKENS = Number(process.env.NVIDIA_CONTEXT_TOKENS || 64000);
const GOOGLE_NEWS_RSS_URL = process.env.GOOGLE_NEWS_RSS_URL || "https://news.google.com/rss/search";
const JINA_BASE_URL = process.env.JINA_BASE_URL || "https://r.jina.ai/http://";
const JINA_API_KEY = process.env.JINA_API_KEY || "";
const COINGECKO_SIMPLE_PRICE_URL = process.env.COINGECKO_SIMPLE_PRICE_URL || "https://api.coingecko.com/api/v3/simple/price";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";
const CRYPTOPANIC_BASE_URL = process.env.CRYPTOPANIC_BASE_URL || "https://cryptopanic.com/api/v1";
const CRYPTOPANIC_API_KEY = process.env.CRYPTOPANIC_API_KEY || "";
const GNEWS_BASE_URL = process.env.GNEWS_BASE_URL || "https://gnews.io/api/v4";
const GNEWS_API_KEY = process.env.GNEWS_API_KEY || "";
const MARKETAUX_BASE_URL = process.env.MARKETAUX_BASE_URL || "https://api.marketaux.com/v1/news";
const MARKETAUX_API_KEY = process.env.MARKETAUX_API_KEY || "";
const LOGAM_MULIA_PRICE_URL = process.env.LOGAM_MULIA_PRICE_URL || "https://www.logammulia.com/id/harga-emas-hari-ini";
const YAHOO_FINANCE_GOLD_URL = process.env.YAHOO_FINANCE_GOLD_URL || "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d";
const PIHPS_PAGE_URL = process.env.PIHPS_PAGE_URL || "https://www.bi.go.id/hargapangan";
const PIHPS_CHART_URL = process.env.PIHPS_CHART_URL || "https://www.bi.go.id/hargapangan/WebSite/Home/GetChartData";
const PANEL_HARGA_PANGAN_URL = process.env.PANEL_HARGA_PANGAN_URL || "https://panelharga.badanpangan.go.id/";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_PROVIDER = String(process.env.TELEGRAM_PROVIDER || "nvidia").trim().toLowerCase();
const TELEGRAM_MODEL = process.env.TELEGRAM_MODEL || "";
const TELEGRAM_MODE = process.env.TELEGRAM_MODE || "medium";
const TELEGRAM_SURFACE_MODE = process.env.TELEGRAM_SURFACE_MODE || "deep_surf";
const TELEGRAM_INCLUDE_REASONING = String(process.env.TELEGRAM_INCLUDE_REASONING || "true").trim().toLowerCase() !== "false";
const CRYPTO_RSS_URLS = String(process.env.CRYPTO_RSS_URLS || [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
  "https://www.theblock.co/rss.xml",
  "https://blockworks.co/feed"
].join(","))
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const LIVE_RSS_SOURCE_REGISTRY = [
  { name: "ANTARA Top News", category: "general", language: "id", priority: 100, tier: "A", url: "https://www.antaranews.com/rss/top-news" },
  { name: "Kompas Nasional", category: "general", language: "id", priority: 96, tier: "A", url: "https://www.kompas.com/getrss/nasional" },
  { name: "BBC Indonesia", category: "general", language: "id", priority: 92, tier: "A", url: "https://feeds.bbci.co.uk/indonesian/rss.xml" },
  { name: "ANTARA Semua", category: "general", language: "id", priority: 86, tier: "B", url: "https://www.antaranews.com/rss" },
  { name: "VOA Indonesia", category: "general", language: "id", priority: 82, tier: "B", url: "https://www.voaindonesia.com/api/zo_oe_qgt" },
  { name: "Kontan", category: "economy", language: "id", priority: 100, tier: "A", url: "https://www.kontan.co.id/feed" },
  { name: "ANTARA Ekonomi", category: "economy", language: "id", priority: 95, tier: "A", url: "https://www.antaranews.com/rss/ekonomi" },
  { name: "Bola.com", category: "sports", language: "id", priority: 100, tier: "A", url: "https://www.bola.com/feed" },
  { name: "Okezone Sports", category: "sports", language: "id", priority: 86, tier: "B", url: "https://sports.okezone.com/feed/rss" },
  { name: "VOA Indonesia Olahraga", category: "sports", language: "id", priority: 82, tier: "B", url: "https://www.voaindonesia.com/api/zo-olahraga" },
  { name: "DetikInet", category: "technology", language: "id", priority: 100, tier: "A", url: "https://rss.detik.com/index.php/inet" },
  { name: "Kompas Tekno", category: "technology", language: "id", priority: 96, tier: "A", url: "https://tekno.kompas.com/feed" },
  { name: "ANTARA Teknologi", category: "technology", language: "id", priority: 94, tier: "A", url: "https://www.antaranews.com/rss/teknologi" },
  { name: "CNN Indonesia Teknologi", category: "technology", language: "id", priority: 86, tier: "B", url: "https://www.cnnindonesia.com/teknologi/rss" },
  { name: "Sindonews Tekno", category: "technology", language: "id", priority: 84, tier: "B", url: "https://tekno.sindonews.com/rss" },
  { name: "Okezone Techno", category: "technology", language: "id", priority: 76, tier: "C", url: "https://techno.okezone.com/feed/rss" },
  { name: "TechCrunch", category: "technology", language: "en", priority: 92, tier: "A", url: "https://techcrunch.com/feed/" },
  { name: "The Verge", category: "technology", language: "en", priority: 90, tier: "A", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Ars Technica", category: "technology", language: "en", priority: 88, tier: "A", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "Wired", category: "technology", language: "en", priority: 82, tier: "B", url: "https://www.wired.com/feed/rss" },
  { name: "CoinDesk", category: "crypto", language: "en", priority: 100, tier: "A", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "CoinTelegraph", category: "crypto", language: "en", priority: 98, tier: "A", url: "https://cointelegraph.com/rss" },
  { name: "The Block", category: "crypto", language: "en", priority: 96, tier: "A", url: "https://www.theblock.co/rss.xml" },
  { name: "Blockworks", category: "crypto", language: "en", priority: 94, tier: "A", url: "https://blockworks.co/feed" },
  { name: "Decrypt", category: "crypto", language: "en", priority: 92, tier: "A", url: "https://decrypt.co/feed" },
  { name: "Blockchain Media ID", category: "crypto", language: "id", priority: 90, tier: "A", url: "https://blockchainmedia.id/feed/" },
  { name: "Pintu News", category: "crypto", language: "id", priority: 88, tier: "A", url: "https://pintu.co.id/news/rss" },
  { name: "Bitcoin Magazine", category: "crypto", language: "en", priority: 82, tier: "B", url: "https://bitcoinmagazine.com/.rss/full/" },
  { name: "CryptoSlate", category: "crypto", language: "en", priority: 80, tier: "B", url: "https://cryptoslate.com/feed/" },
  { name: "Indodax Blog", category: "crypto", language: "id", priority: 78, tier: "B", url: "https://indodax.com/blog/feed/" },
  { name: "Cryptowave Indonesia", category: "crypto", language: "id", priority: 76, tier: "B", url: "https://cryptowave.co.id/feed/" },
  { name: "CoinMarketCap Headlines", category: "crypto_market", language: "en", priority: 72, tier: "C", url: "https://coinmarketcap.com/headlines/feed/" }
];
const CONTEXT_TOKEN_RESERVE = Number(process.env.CONTEXT_TOKEN_RESERVE || 2048);
const DATA_DIR = path.join(__dirname, "..", "data", "sessions");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const STATIC_DIR = path.join(__dirname, "static");
const HOME_WORKSPACE = "Home";
const PROVIDER_DEFAULTS = {
  ollama: OLLAMA_MODEL,
  nvidia: NVIDIA_MODEL
};
const WEB_PROVIDER_REGISTRY = parseJsonEnv("WEB_PROVIDER_REGISTRY", {
  search: ["google_news"],
  xSearch: [],
  fetch: ["http", "jina"]
});
const WEB_PROVIDER_SELECTIONS = parseJsonEnv("WEB_PROVIDER_SELECTIONS", {
  search: { primary: ["google_news"], fallback: [] },
  xSearch: { primary: [], fallback: [] },
  fetch: { primary: ["http"], fallback: ["jina"] }
});

module.exports = {
  PORT,
  APP_LOCALE,
  APP_TIMEZONE,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_CONTEXT_TOKENS,
  NVIDIA_BASE_URL,
  NVIDIA_API_KEY,
  NVIDIA_MODEL,
  NVIDIA_CONTEXT_TOKENS,
  GOOGLE_NEWS_RSS_URL,
  JINA_BASE_URL,
  JINA_API_KEY,
  COINGECKO_SIMPLE_PRICE_URL,
  COINGECKO_API_KEY,
  CRYPTOPANIC_BASE_URL,
  CRYPTOPANIC_API_KEY,
  GNEWS_BASE_URL,
  GNEWS_API_KEY,
  MARKETAUX_BASE_URL,
  MARKETAUX_API_KEY,
  LOGAM_MULIA_PRICE_URL,
  YAHOO_FINANCE_GOLD_URL,
  PIHPS_PAGE_URL,
  PIHPS_CHART_URL,
  PANEL_HARGA_PANGAN_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_PROVIDER,
  TELEGRAM_MODEL,
  TELEGRAM_MODE,
  TELEGRAM_SURFACE_MODE,
  TELEGRAM_INCLUDE_REASONING,
  CRYPTO_RSS_URLS,
  LIVE_RSS_SOURCE_REGISTRY,
  CONTEXT_TOKEN_RESERVE,
  DATA_DIR,
  INDEX_FILE,
  STATIC_DIR,
  HOME_WORKSPACE,
  PROVIDER_DEFAULTS,
  WEB_PROVIDER_REGISTRY,
  WEB_PROVIDER_SELECTIONS
};
