const { getCacheKey, getCached, setCached } = require("./cache");
const { normalizeSearchPayload } = require("./normalize");

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function mergePayloads(payloads = []) {
  const results = [];
  for (const payload of payloads) {
    for (const item of payload?.results || []) {
      if (results.some((existing) => existing.url && existing.url === item.url)) continue;
      if (results.some((existing) => !existing.url && existing.title === item.title && existing.snippet === item.snippet)) continue;
      results.push(item);
    }
  }

  return normalizeSearchPayload({
    results,
    pageText: payloads.map((payload) => payload?.pageText || "").filter(Boolean).join(" "),
    entityTitle: payloads.find((payload) => payload?.entityTitle)?.entityTitle || "",
    entitySubtitle: payloads.find((payload) => payload?.entitySubtitle)?.entitySubtitle || "",
    instantAnswer: payloads.find((payload) => payload?.instantAnswer)?.instantAnswer || ""
  });
}

async function runProvider(provider, query, options = {}) {
  const ttlMs = Number(options.cacheTtlMs || DEFAULT_TTL_MS);
  const cacheKey = getCacheKey([provider.id, query]);
  const cached = getCached("web-search", cacheKey);
  if (cached) return { ...cached, cached: true, providerId: provider.id };
  const payload = normalizeSearchPayload(await provider.search(query, options));
  return setCached("web-search", cacheKey, { ...payload, cached: false, providerId: provider.id }, ttlMs);
}

async function searchWeb(query, options = {}) {
  const primaryProviders = Array.isArray(options.primaryProviders) ? options.primaryProviders.filter(Boolean) : [];
  const fallbackProviders = Array.isArray(options.fallbackProviders) ? options.fallbackProviders.filter(Boolean) : [];
  const mergeAcrossProviders = Boolean(options.mergeAcrossProviders);

  const primaryPayloads = [];
  for (const provider of primaryProviders) {
    const payload = await runProvider(provider, query, options).catch(() => null);
    if (!payload) continue;
    primaryPayloads.push(payload);
    if (!mergeAcrossProviders && payload.results.length) {
      return { ok: true, query, tier: "primary", payload: payload, providerIds: [provider.id] };
    }
  }

  const fallbackPayloads = [];
  for (const provider of fallbackProviders) {
    const payload = await runProvider(provider, query, options).catch(() => null);
    if (!payload) continue;
    fallbackPayloads.push(payload);
    if (!mergeAcrossProviders && payload.results.length && !primaryPayloads.some((item) => item.results.length)) {
      return { ok: true, query, tier: "fallback", payload, providerIds: [provider.id] };
    }
  }

  if (mergeAcrossProviders) {
    const combined = mergePayloads([...primaryPayloads, ...fallbackPayloads]);
    return {
      ok: combined.results.length > 0,
      query,
      tier: primaryPayloads.some((payload) => payload.results.length) ? "primary" : "fallback",
      payload: combined,
      providerIds: [...primaryPayloads, ...fallbackPayloads].map((payload) => payload.providerId)
    };
  }

  if (primaryPayloads.some((payload) => payload.results.length)) {
    return {
      ok: true,
      query,
      tier: "primary",
      payload: primaryPayloads.find((payload) => payload.results.length) || mergePayloads(primaryPayloads),
      providerIds: primaryPayloads.filter((payload) => payload.results.length).map((payload) => payload.providerId)
    };
  }

  return {
    ok: false,
    query,
    tier: fallbackPayloads.length ? "fallback" : "primary",
    payload: mergePayloads([...primaryPayloads, ...fallbackPayloads]),
    providerIds: [...primaryPayloads, ...fallbackPayloads].map((payload) => payload.providerId)
  };
}

module.exports = {
  searchWeb,
  mergePayloads
};
