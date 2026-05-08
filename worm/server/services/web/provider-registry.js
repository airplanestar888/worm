const { createGoogleNewsProvider } = require('./providers/google-news');
const { createSearchProvider } = require('./providers/search-provider');
const { httpFetchProvider, jinaFetchProvider } = require('./providers');
const { createMockXSearchProvider } = require('./providers/x-mock');

const BUILTIN_PROVIDER_FACTORIES = {
  search: {
    google_news: ({ client }) => createGoogleNewsProvider(client)
  },
  xSearch: {
    x_mock: () => createMockXSearchProvider()
  },
  fetch: {
    http: () => httpFetchProvider,
    jina: () => jinaFetchProvider
  }
};

function normalizeProviderEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { id: entry.trim(), enabled: true, config: {} };
  if (typeof entry === 'object') {
    return {
      id: String(entry.id || '').trim(),
      enabled: entry.enabled !== false,
      config: entry.config && typeof entry.config === 'object' ? entry.config : {}
    };
  }
  return null;
}

function createProviderRegistry() {
  const state = {
    search: new Map(),
    xSearch: new Map(),
    fetch: new Map()
  };

  function register(type, provider) {
    if (!state[type]) throw new Error(`Unknown provider type: ${type}`);
    if (!provider?.id) throw new Error('Provider id is required.');
    state[type].set(provider.id, provider);
    return provider;
  }

  function registerMany(type, providers = []) {
    providers.filter(Boolean).forEach((provider) => register(type, provider));
  }

  function get(type, id) {
    return state[type]?.get(id) || null;
  }

  function list(type) {
    return Array.from(state[type]?.values() || []);
  }

  function resolve(type, ids = []) {
    if (!Array.isArray(ids) || !ids.length) return list(type);
    return ids.map((id) => get(type, id)).filter(Boolean);
  }

  return {
    register,
    registerMany,
    get,
    list,
    resolve
  };
}

function createXSearchProvider({ id, label = '', search }) {
  return createSearchProvider({ id, label, search });
}

function registerBuiltinProvider(registry, type, entry, options = {}) {
  const descriptor = normalizeProviderEntry(entry);
  if (!descriptor?.id || descriptor.enabled === false) return null;

  const factory = BUILTIN_PROVIDER_FACTORIES[type]?.[descriptor.id];
  if (!factory) {
    throw new Error(`Unknown builtin provider: ${type}.${descriptor.id}`);
  }

  const provider = factory({ ...options, config: descriptor.config });
  return registry.register(type, provider);
}

function registerBuiltins(registry, options = {}) {
  Object.entries(BUILTIN_PROVIDER_FACTORIES).forEach(([type, providers]) => {
    Object.keys(providers).forEach((id) => registerBuiltinProvider(registry, type, id, options));
  });
  return registry;
}

function registerProvidersFromConfig(registry, config = {}, options = {}) {
  Object.keys(BUILTIN_PROVIDER_FACTORIES).forEach((type) => {
    const entries = Array.isArray(config?.[type]) ? config[type] : [];
    entries.forEach((entry) => registerBuiltinProvider(registry, type, entry, options));
  });
  return registry;
}

function providersFromConfig(registry, type, config = {}) {
  const primaryProviders = registry.resolve(type, config.primary);
  const fallbackProviders = registry.resolve(type, config.fallback);
  return { primaryProviders, fallbackProviders };
}

module.exports = {
  BUILTIN_PROVIDER_FACTORIES,
  createProviderRegistry,
  createXSearchProvider,
  normalizeProviderEntry,
  registerBuiltinProvider,
  registerBuiltins,
  registerProvidersFromConfig,
  providersFromConfig
};
