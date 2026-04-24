function describeError(err, fallback = "Unknown error") {
  const status = err?.response?.status;
  const statusText = err?.response?.statusText;
  const data = err?.response?.data;

  const pickMessage = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value?.error === "string") return value.error.trim();
    if (typeof value?.message === "string") return value.message.trim();
    if (typeof value?.detail === "string") return value.detail.trim();
    if (Array.isArray(value?.errors) && value.errors.length) {
      const first = value.errors[0];
      if (typeof first === "string") return first.trim();
      if (typeof first?.message === "string") return first.message.trim();
    }
    if (typeof value?.toString === "function") {
      const text = value.toString();
      if (text && text !== "[object Object]" && text !== "[object Readable]") return text.trim();
    }
    return "";
  };

  const detail = pickMessage(data)
    || String(err?.message || err?.cause?.message || err?.code || statusText || fallback).trim()
    || fallback;
  return status ? `HTTP ${status}: ${detail}` : detail;
}

module.exports = { describeError };
