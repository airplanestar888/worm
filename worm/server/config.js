const path = require("path");

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
const COINGECKO_SIMPLE_PRICE_URL = process.env.COINGECKO_SIMPLE_PRICE_URL || "https://api.coingecko.com/api/v3/simple/price";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_PROVIDER = String(process.env.TELEGRAM_PROVIDER || "nvidia").trim().toLowerCase();
const TELEGRAM_MODEL = process.env.TELEGRAM_MODEL || "";
const TELEGRAM_MODE = process.env.TELEGRAM_MODE || "medium";
const TELEGRAM_SURFACE_MODE = process.env.TELEGRAM_SURFACE_MODE || "deep_surf";
const TELEGRAM_INCLUDE_REASONING = String(process.env.TELEGRAM_INCLUDE_REASONING || "true").trim().toLowerCase() !== "false";
const CRYPTO_RSS_URLS = String(process.env.CRYPTO_RSS_URLS || [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss"
].join(","))
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const CONTEXT_TOKEN_RESERVE = Number(process.env.CONTEXT_TOKEN_RESERVE || 2048);
const DATA_DIR = path.join(__dirname, "..", "data", "sessions");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const STATIC_DIR = path.join(__dirname, "static");
const HOME_WORKSPACE = "Home";
const PROVIDER_DEFAULTS = {
  ollama: OLLAMA_MODEL,
  nvidia: NVIDIA_MODEL
};

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
  COINGECKO_SIMPLE_PRICE_URL,
  COINGECKO_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_PROVIDER,
  TELEGRAM_MODEL,
  TELEGRAM_MODE,
  TELEGRAM_SURFACE_MODE,
  TELEGRAM_INCLUDE_REASONING,
  CRYPTO_RSS_URLS,
  CONTEXT_TOKEN_RESERVE,
  DATA_DIR,
  INDEX_FILE,
  STATIC_DIR,
  HOME_WORKSPACE,
  PROVIDER_DEFAULTS
};
