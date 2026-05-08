function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSearchResult(result = {}) {
  const title = normalizeText(result.title);
  const url = normalizeText(result.url);
  const snippet = normalizeText(result.snippet || result.content || "");
  if (!title && !url && !snippet) return null;
  return {
    title,
    url,
    snippet,
    source: normalizeText(result.source || result.siteName || result.provider || ""),
    publishedAt: normalizeText(result.publishedAt || ""),
    score: Number.isFinite(Number(result.score)) ? Number(result.score) : undefined,
    raw: result.raw || undefined
  };
}

function normalizeSearchPayload(payload = {}) {
  const results = Array.isArray(payload.results)
    ? payload.results.map(normalizeSearchResult).filter(Boolean)
    : [];

  return {
    ok: results.length > 0,
    results,
    pageText: normalizeText(payload.pageText || results.map((item) => `${item.title}. ${item.snippet}`).join(" ")),
    entityTitle: normalizeText(payload.entityTitle || ""),
    entitySubtitle: normalizeText(payload.entitySubtitle || ""),
    instantAnswer: normalizeText(payload.instantAnswer || "")
  };
}

function normalizePageResult(page = {}) {
  return {
    ok: Boolean(page.ok),
    url: normalizeText(page.url || ""),
    finalUrl: normalizeText(page.finalUrl || page.url || ""),
    title: normalizeText(page.title || ""),
    content: String(page.content || "").trim(),
    extractMode: normalizeText(page.extractMode || "text") || "text",
    provider: normalizeText(page.provider || ""),
    cached: Boolean(page.cached),
    error: page.error || null,
    meta: page.meta || {}
  };
}

function normalizeError(code, message, extra = {}) {
  return {
    ok: false,
    error: {
      code: normalizeText(code || "UNKNOWN") || "UNKNOWN",
      message: normalizeText(message || "Unknown error") || "Unknown error",
      ...extra
    }
  };
}

module.exports = {
  normalizeSearchResult,
  normalizeSearchPayload,
  normalizePageResult,
  normalizeError
};
