const { getCacheKey, getCached, setCached } = require("./cache");
const { normalizePageResult, normalizeError } = require("./normalize");
const { detectUrlRouting } = require("./router");
const httpFetchProvider = require("./providers/http-fetch");
const jinaFetchProvider = require("./providers/jina-fetch");

const DEFAULT_TTL_MS = 15 * 60 * 1000;

async function fetchPage(url, options = {}) {
  const routing = detectUrlRouting(url);
  const ttlMs = Number(options.cacheTtlMs || DEFAULT_TTL_MS);
  const cacheKey = getCacheKey([url, options.extractMode || "text"]);
  const cached = getCached("web-fetch", cacheKey);
  if (cached) return { ...cached, cached: true };

  const primaryProviders = Array.isArray(options.primaryProviders) && options.primaryProviders.length
    ? options.primaryProviders
    : [httpFetchProvider];
  const fallbackProviders = Array.isArray(options.fallbackProviders) && options.fallbackProviders.length
    ? options.fallbackProviders
    : [jinaFetchProvider];

  const attempts = routing.browserRequired
    ? [...fallbackProviders, ...primaryProviders]
    : [...primaryProviders, ...fallbackProviders];

  let lastResult = normalizePageResult({
    ok: false,
    url,
    finalUrl: url,
    extractMode: options.extractMode || "text",
    error: normalizeError("NO_RESULT", "No fetch provider returned content.").error
  });

  for (const provider of attempts) {
    const result = normalizePageResult(await provider.fetch(url, { ...options, routing }));
    if (result.ok && result.content) {
      return setCached("web-fetch", cacheKey, result, ttlMs);
    }
    lastResult = result;
    if (routing.browserRequired && result.error?.code === "BROWSER_REQUIRED") {
      continue;
    }
  }

  return setCached("web-fetch", cacheKey, lastResult, ttlMs);
}

module.exports = {
  fetchPage
};
