const { getCacheKey, getCached, setCached } = require('./cache');
const { normalizeSearchPayload } = require('./normalize');
const { mergePayloads } = require('./search-service');

const DEFAULT_TTL_MS = 15 * 60 * 1000;

async function runProvider(provider, query, options = {}) {
  const ttlMs = Number(options.cacheTtlMs || DEFAULT_TTL_MS);
  const cacheKey = getCacheKey(['x-search', provider.id, query]);
  const cached = getCached('x-search', cacheKey);
  if (cached) return { ...cached, cached: true, providerId: provider.id };
  const payload = normalizeSearchPayload(await provider.search(query, options));
  return setCached('x-search', cacheKey, { ...payload, cached: false, providerId: provider.id }, ttlMs);
}

async function xSearch(query, options = {}) {
  const primaryProviders = Array.isArray(options.primaryProviders) ? options.primaryProviders.filter(Boolean) : [];
  const fallbackProviders = Array.isArray(options.fallbackProviders) ? options.fallbackProviders.filter(Boolean) : [];
  const mergeAcrossProviders = Boolean(options.mergeAcrossProviders);

  // Fast path: when merging, fire all providers in parallel for lower latency
  if (mergeAcrossProviders) {
    const allProviders = [...primaryProviders, ...fallbackProviders];
    const settled = await Promise.allSettled(allProviders.map((provider) =>
      runProvider(provider, query, options).catch(() => null)
    ));
    const allPayloads = settled
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);
    const primaryPayloads = allPayloads.filter((p) => primaryProviders.some((prov) => prov.id === p.providerId));
    const combined = mergePayloads(allPayloads);
    return {
      ok: combined.results.length > 0,
      query,
      tier: primaryPayloads.some((payload) => payload.results.length) ? "primary" : "fallback",
      payload: combined,
      providerIds: allPayloads.map((payload) => payload.providerId)
    };
  }

  // Sequential path with early return (priority order matters)
  const primaryPayloads = [];
  for (const provider of primaryProviders) {
    const payload = await runProvider(provider, query, options).catch(() => null);
    if (!payload) continue;
    primaryPayloads.push(payload);
    if (payload.results.length) {
      return { ok: true, query, tier: 'primary', payload, providerIds: [provider.id] };
    }
  }

  const fallbackPayloads = [];
  for (const provider of fallbackProviders) {
    const payload = await runProvider(provider, query, options).catch(() => null);
    if (!payload) continue;
    fallbackPayloads.push(payload);
    if (payload.results.length && !primaryPayloads.some((item) => item.results.length)) {
      return { ok: true, query, tier: 'fallback', payload, providerIds: [provider.id] };
    }
  }

  if (primaryPayloads.some((payload) => payload.results.length)) {
    return {
      ok: true,
      query,
      tier: 'primary',
      payload: primaryPayloads.find((payload) => payload.results.length) || mergePayloads(primaryPayloads),
      providerIds: primaryPayloads.filter((payload) => payload.results.length).map((payload) => payload.providerId)
    };
  }

  return {
    ok: false,
    query,
    tier: fallbackPayloads.length ? 'fallback' : 'primary',
    payload: mergePayloads([...primaryPayloads, ...fallbackPayloads]) || normalizeSearchPayload({ results: [] }),
    providerIds: [...primaryPayloads, ...fallbackPayloads].map((payload) => payload.providerId)
  };
}

module.exports = {
  xSearch
};
