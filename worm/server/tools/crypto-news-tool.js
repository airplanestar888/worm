const axios = require("axios");
const {
  CRYPTO_RSS_URLS,
  CRYPTOPANIC_API_KEY,
  CRYPTOPANIC_BASE_URL,
  GNEWS_API_KEY,
  GNEWS_BASE_URL,
  MARKETAUX_API_KEY,
  MARKETAUX_BASE_URL
} = require("../config");

const ASSETS = [
  { symbol: "BTC", name: "Bitcoin", aliases: ["btc", "bitcoin"] },
  { symbol: "ETH", name: "Ethereum", aliases: ["eth", "ethereum", "etherium"] },
  { symbol: "SOL", name: "Solana", aliases: ["sol", "solana"] },
  { symbol: "BNB", name: "BNB", aliases: ["bnb", "binance coin", "binancecoin"] },
  { symbol: "XRP", name: "XRP", aliases: ["xrp", "ripple"] },
  { symbol: "ADA", name: "Cardano", aliases: ["ada", "cardano"] },
  { symbol: "DOGE", name: "Dogecoin", aliases: ["doge", "dogecoin"] }
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "on", "in", "at", "with", "from", "by", "after", "before", "amid",
  "ini", "itu", "dan", "atau", "yang", "di", "ke", "dari", "untuk", "pada", "hari", "today", "news", "berita", "top", "viral",
  "bitcoin", "btc", "ethereum", "eth", "crypto", "cryptocurrency"
]);

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeTitle(value = "") {
  return normalizeText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOPWORDS.has(item));
}

function jaccardSimilarity(a = [], b = []) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

function detectAsset(message = "") {
  const text = normalizeText(message);
  return ASSETS.find((asset) => asset.aliases.some((alias) => text.includes(alias))) || ASSETS[0];
}

function isCryptoNewsIntent(message = "") {
  const text = normalizeText(message);
  return /\b(news|berita|headline|viral|topik|rumor|sentimen|sentiment|update|trending|trend|rame|ramai|heboh|hype|talk|talking)\b/.test(text)
    && /\b(bitcoin|btc|ethereum|eth|solana|sol|bnb|xrp|ada|doge|crypto)\b/.test(text);
}

function wantsXSource(message = "") {
  const raw = String(message || "").toLowerCase();
  return /\b(di|dari|from)\s+x\b/.test(raw) || /\b(x|twitter|tweet|tweets|x\.com)\b/.test(raw);
}

function wantsTopCount(message = "") {
  const match = String(message || "").match(/\btop\s*(\d+)\b/i) || String(message || "").match(/\b(\d+)\s+berita\b/i);
  const parsed = Number(match?.[1] || 5);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : 5;
}

function scoreAssetRelevance(asset, item = {}) {
  const title = normalizeText(item.title || "");
  const snippet = normalizeText(item.snippet || "");
  let score = 0;
  for (const alias of asset.aliases) {
    if (title.includes(alias)) score += 3;
    if (snippet.includes(alias)) score += 1;
  }
  if (/\b(etf|market|price|trader|whale|network|ecosystem|staking|defi)\b/.test(`${title} ${snippet}`)) score += 0.5;
  return score;
}

function startOfTodayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)).toISOString();
}

function extractSearchResults(xml = "", sourceLabel = "RSS") {
  const text = String(xml || "");
  if (!text.includes("<item>")) return [];
  const items = Array.from(text.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  return items.slice(0, 12).map((item) => {
    const block = item[1] || "";
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
    const title = rawTitle.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const url = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim();
    const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || sourceLabel).replace(/<[^>]+>/g, " ").trim() || sourceLabel;
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    const snippet = (block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : "";
    return title ? [{ title, url, source, snippet, publishedAt, provider: "rss" }] : [];
  }).flat();
}

async function fetchText(url, headers = {}) {
  const response = await axios.get(url, { timeout: 15000, proxy: false, responseType: "text", headers });
  return String(response.data || "");
}

async function fetchJson(url, options = {}) {
  const response = await axios.get(url, { timeout: 15000, proxy: false, ...options });
  return response.data;
}

async function fetchCryptoPanic(asset) {
  if (!CRYPTOPANIC_API_KEY) return { provider: "cryptopanic", status: "disabled", items: [] };
  try {
    const data = await fetchJson(`${CRYPTOPANIC_BASE_URL}/posts/`, {
      params: {
        auth_token: CRYPTOPANIC_API_KEY,
        currencies: asset.symbol,
        kind: "news",
        public: "true"
      },
      headers: { Accept: "application/json" }
    });
    const items = Array.isArray(data?.results) ? data.results.slice(0, 12).map((item) => ({
      title: String(item?.title || "").trim(),
      url: String(item?.url || "").trim(),
      source: String(item?.source?.title || "CryptoPanic").trim(),
      snippet: String(item?.title || "").trim(),
      publishedAt: String(item?.published_at || "").trim(),
      provider: "cryptopanic"
    })).filter((item) => item.title) : [];
    return { provider: "cryptopanic", status: "ok", items };
  } catch (error) {
    return { provider: "cryptopanic", status: "error", items: [], error: error.message };
  }
}

async function fetchGNews(asset) {
  if (!GNEWS_API_KEY) return { provider: "gnews", status: "disabled", items: [] };
  try {
    const data = await fetchJson(`${GNEWS_BASE_URL}/search`, {
      params: {
        q: `${asset.name} OR ${asset.symbol}`,
        token: GNEWS_API_KEY,
        lang: "en",
        max: 12,
        from: startOfTodayIso()
      },
      headers: { Accept: "application/json" }
    });
    const items = Array.isArray(data?.articles) ? data.articles.slice(0, 12).map((item) => ({
      title: String(item?.title || "").trim(),
      url: String(item?.url || "").trim(),
      source: String(item?.source?.name || "GNews").trim(),
      snippet: String(item?.description || "").trim(),
      publishedAt: String(item?.publishedAt || "").trim(),
      provider: "gnews"
    })).filter((item) => item.title) : [];
    return { provider: "gnews", status: "ok", items };
  } catch (error) {
    return { provider: "gnews", status: "error", items: [], error: error.message };
  }
}

async function fetchMarketaux(asset) {
  if (!MARKETAUX_API_KEY) return { provider: "marketaux", status: "disabled", items: [] };
  try {
    const data = await fetchJson(`${MARKETAUX_BASE_URL}/all`, {
      params: {
        api_token: MARKETAUX_API_KEY,
        search: `${asset.name} ${asset.symbol}`,
        language: "en",
        limit: 12,
        published_after: startOfTodayIso()
      },
      headers: { Accept: "application/json" }
    });
    const items = Array.isArray(data?.data) ? data.data.slice(0, 12).map((item) => ({
      title: String(item?.title || "").trim(),
      url: String(item?.url || "").trim(),
      source: String(item?.source || "Marketaux").trim(),
      snippet: String(item?.description || "").trim(),
      publishedAt: String(item?.published_at || "").trim(),
      provider: "marketaux"
    })).filter((item) => item.title) : [];
    return { provider: "marketaux", status: "ok", items };
  } catch (error) {
    return { provider: "marketaux", status: "error", items: [], error: error.message };
  }
}

async function fetchCryptoRss(asset) {
  const urls = Array.isArray(CRYPTO_RSS_URLS) ? CRYPTO_RSS_URLS : [];
  if (!urls.length) return { provider: "rss", status: "disabled", items: [] };
  const items = [];
  for (const url of urls.slice(0, 4)) {
    try {
      const xml = await fetchText(url, { Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8" });
      items.push(...extractSearchResults(xml, url)
        .map((entry) => ({ ...entry, relevance: scoreAssetRelevance(asset, entry) }))
        .filter((entry) => entry.relevance >= 2));
    } catch (_error) {
      // ignore per-feed failure
    }
  }
  items.sort((a, b) => (Number(b.relevance || 0) - Number(a.relevance || 0)) || String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  return { provider: "rss", status: items.length ? "ok" : "empty", items: items.slice(0, 12) };
}

function normalizeItem(item = {}) {
  const title = String(item.title || "").trim();
  if (!title) return null;
  return {
    title,
    url: String(item.url || "").trim(),
    source: String(item.source || item.provider || "Unknown").trim(),
    snippet: String(item.snippet || "").trim(),
    publishedAt: String(item.publishedAt || "").trim(),
    provider: String(item.provider || "unknown").trim(),
    engagement: Number(item.engagement || 0),
    relevance: Number(item.relevance || 0)
  };
}

function clusterItems(items = []) {
  const clusters = [];
  for (const rawItem of items.map(normalizeItem).filter(Boolean)) {
    const tokens = tokenizeTitle(rawItem.title);
    let match = null;
    for (const cluster of clusters) {
      const similarity = jaccardSimilarity(tokens, cluster.tokens);
      if (similarity >= 0.5) {
        match = cluster;
        break;
      }
    }
    if (!match) {
      clusters.push({
        title: rawItem.title,
        tokens,
        items: [rawItem],
        sources: new Set([rawItem.source]),
        providers: new Set([rawItem.provider]),
        latestAt: rawItem.publishedAt || "",
        xBuzz: rawItem.provider === "x" ? rawItem.engagement : 0,
        relevance: Number(rawItem.relevance || 0)
      });
      continue;
    }
    match.items.push(rawItem);
    match.sources.add(rawItem.source);
    match.providers.add(rawItem.provider);
    match.relevance = Math.max(match.relevance || 0, Number(rawItem.relevance || 0));
    if (rawItem.provider === "x") match.xBuzz = Math.max(match.xBuzz, rawItem.engagement || 0);
    if (rawItem.publishedAt && (!match.latestAt || rawItem.publishedAt > match.latestAt)) match.latestAt = rawItem.publishedAt;
    if (rawItem.title.length > match.title.length) match.title = rawItem.title;
  }
  return clusters;
}

function scoreCluster(cluster, xRequested = false) {
  const sources = cluster.sources.size;
  const providers = cluster.providers.size;
  const agePenalty = cluster.latestAt ? Math.max(0, (Date.now() - Date.parse(cluster.latestAt)) / 36e5) : 48;
  const freshness = Math.max(0, 24 - Math.min(agePenalty, 24));
  const xBoost = xRequested && cluster.providers.has("x") ? 3 : 0;
  const engagementBoost = cluster.xBuzz > 0 ? Math.min(3, Math.log10(cluster.xBuzz + 1)) : 0;
  const relevanceBoost = Math.min(3, Number(cluster.relevance || 0));
  return (sources * 3) + (providers * 2) + freshness / 6 + xBoost + engagementBoost + relevanceBoost;
}

function summarizeProviderStates(results = []) {
  return results.map((result) => {
    if (result.status === "ok") return `${result.provider}: ${result.items.length} item` + (result.items.length === 1 ? "" : "s");
    if (result.status === "empty") return `${result.provider}: 0 item`;
    if (result.status === "disabled") return `${result.provider}: disabled`;
    return `${result.provider}: error (${result.error || "unknown"})`;
  }).join("; ");
}

async function runCryptoNewsLookup(message = "") {
  if (!isCryptoNewsIntent(message)) return null;
  const asset = detectAsset(message);
  const limit = wantsTopCount(message);
  const xRequested = wantsXSource(message);

  const providerResults = await Promise.all([
    fetchCryptoPanic(asset),
    fetchGNews(asset),
    fetchMarketaux(asset),
    fetchCryptoRss(asset)
  ]);

  const allItems = providerResults.flatMap((result) => (result.items || []).map((item) => ({
    ...item,
    relevance: Number(item.relevance || scoreAssetRelevance(asset, item))
  }))).filter((item) => Number(item.relevance || 0) >= 2 || item.provider === "x");
  const clusters = clusterItems(allItems)
    .map((cluster) => ({ ...cluster, score: scoreCluster(cluster, xRequested) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!clusters.length) {
    return {
      name: "crypto.news",
      summary: `Multi-source crypto news scan untuk ${asset.symbol} tidak menemukan cluster berita yang cukup kuat.`,
      directReply: "",
      contextText: `Asset: ${asset.name} (${asset.symbol})\nSources checked: ${summarizeProviderStates(providerResults)}\nResult: belum ada hasil yang cukup kuat dari source yang aktif.`
    };
  }

  const lines = clusters.map((cluster, index) => {
    const lead = cluster.items[0] || {};
    const sourceList = Array.from(cluster.sources).slice(0, 6).join(", ");
    const providerList = Array.from(cluster.providers).join(", ");
    const xLine = cluster.providers.has("x") ? `; X buzz ${cluster.xBuzz || 0}` : "";
    return `${index + 1}. ${cluster.title}\n   sources: ${cluster.sources.size} (${sourceList})\n   providers: ${providerList}${xLine}\n   latest: ${cluster.latestAt || "n/a"}\n   link: ${lead.url || "n/a"}`;
  });

  return {
    name: "crypto.news",
    summary: `Multi-source crypto news scan untuk ${asset.symbol}: ${clusters.length} topik teratas dari ${allItems.length} item lintas provider.`,
    directReply: `Menemukan ${clusters.length} cluster berita utama untuk ${asset.symbol}.`,
    contextText: [
      `Asset: ${asset.name} (${asset.symbol})`,
      `X requested: ${xRequested ? "yes" : "no"}`,
      xRequested
        ? "X status: source dihapus dari stack gratis; fallback source tetap dipakai"
        : "X status: not requested",
      `Sources checked: ${summarizeProviderStates(providerResults)}`,
      ...lines
    ].join("\n")
  };
}

module.exports = {
  isCryptoNewsIntent,
  runCryptoNewsLookup,
  wantsXSource
};
