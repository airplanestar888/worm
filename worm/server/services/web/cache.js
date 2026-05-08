const stores = new Map();

function getStore(name = "default") {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function getCacheKey(parts = []) {
  return parts.map((part) => JSON.stringify(part ?? null)).join("::");
}

function getCached(storeName, key) {
  const store = getStore(storeName);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(storeName, key, value, ttlMs) {
  const store = getStore(storeName);
  store.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs || 0))
  });
  return value;
}

module.exports = {
  getCacheKey,
  getCached,
  setCached
};
