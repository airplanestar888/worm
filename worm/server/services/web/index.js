const { WEB_PROVIDER_REGISTRY, WEB_PROVIDER_SELECTIONS } = require('../../config');
const { searchWeb, mergePayloads } = require('./search-service');
const { xSearch } = require('./x-search-service');
const { fetchPage } = require('./fetch-service');
const { createGoogleNewsProvider } = require('./providers/google-news');
const { createSearchProvider } = require('./providers/search-provider');
const { httpFetchProvider, jinaFetchProvider } = require('./providers');
const {
  createProviderRegistry,
  createXSearchProvider,
  registerBuiltins,
  registerProvidersFromConfig,
  providersFromConfig
} = require('./provider-registry');
const { extractFirstUrl, detectUrlRouting } = require('./router');

function createDefaultRegistry(options = {}) {
  return registerProvidersFromConfig(createProviderRegistry(), WEB_PROVIDER_REGISTRY, options);
}

function createDefaultSearchProviders({ client, message = '', route = {}, queryKind = '', registry } = {}) {
  const activeRegistry = registry || createDefaultRegistry({ client });
  const config = route.sources?.includes('search')
    ? (WEB_PROVIDER_SELECTIONS.search || { primary: ['google_news'], fallback: [] })
    : { primary: [], fallback: [] };

  return providersFromConfig(activeRegistry, 'search', config, { message, queryKind });
}

function createDefaultXSearchProviders({ registry } = {}) {
  const activeRegistry = registry || createDefaultRegistry();
  return providersFromConfig(activeRegistry, 'xSearch', WEB_PROVIDER_SELECTIONS.xSearch || { primary: ['x_mock'], fallback: [] });
}

function createDefaultFetchProviders({ registry } = {}) {
  const activeRegistry = registry || createDefaultRegistry();
  return providersFromConfig(activeRegistry, 'fetch', WEB_PROVIDER_SELECTIONS.fetch || { primary: ['http'], fallback: ['jina'] });
}

module.exports = {
  searchWeb,
  mergePayloads,
  xSearch,
  fetchPage,
  createGoogleNewsProvider,
  createSearchProvider,
  createXSearchProvider,
  createProviderRegistry,
  registerBuiltins,
  registerProvidersFromConfig,
  providersFromConfig,
  createDefaultRegistry,
  createDefaultSearchProviders,
  createDefaultXSearchProviders,
  createDefaultFetchProviders,
  extractFirstUrl,
  detectUrlRouting,
  httpFetchProvider,
  jinaFetchProvider
};
