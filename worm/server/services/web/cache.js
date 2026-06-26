const stores = new Map();

const MAX_STORE_SIZE = 1000; // Maximum entries per store
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [storeName, store] of stores) {
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }
}, CLEANUP_INTERVAL_MS);

function getStore(name = "default") {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function evictExpiredEntries(store) {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

function evictOldestEntries(store, count) {
  // Remove oldest entries (by expiration time) to make room
  const entries = [...store.entries()]
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt);

  for (let i = 0; i < Math.min(count, entries.length); i++) {
    store.delete(entries[i][0]);
  }
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
  // Update access time for LRU
  entry.lastAccessed = Date.now();
  return entry.value;
}

function setCached(storeName, key, value, ttlMs) {
  const store = getStore(storeName);

  // Enforce size limit
  if (store.size >= MAX_STORE_SIZE) {
    // First try to evict expired entries
    evictExpiredEntries(store);

    // If still too large, evict oldest entries
    if (store.size >= MAX_STORE_SIZE) {
      evictOldestEntries(store, Math.floor(MAX_STORE_SIZE * 0.2)); // Remove 20%
    }
  }

  store.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs || 0)),
    lastAccessed: Date.now()
  });
  return value;
}

module.exports = {
  getCacheKey,
  getCached,
  setCached
};
