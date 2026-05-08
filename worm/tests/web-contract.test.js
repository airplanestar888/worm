const test = require('node:test');
const assert = require('node:assert/strict');

const {
  searchWeb,
  xSearch,
  fetchPage,
  createSearchProvider,
  createXSearchProvider,
  createProviderRegistry,
  createDefaultRegistry,
  registerProvidersFromConfig,
  createDefaultXSearchProviders,
  providersFromConfig
} = require('../server/services/web');
const { WEB_PROVIDER_REGISTRY } = require('../server/config');

test('searchWeb returns normalized contract', async () => {
  const provider = createSearchProvider({
    id: 'search_mock',
    search: async (query) => ({
      results: [
        {
          title: `  ${query}  `,
          url: 'https://example.com/result',
          snippet: '  ringkas hasil  ',
          source: 'Mock Search'
        }
      ]
    })
  });

  const result = await searchWeb('harga btc hari ini', {
    primaryProviders: [provider],
    fallbackProviders: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.tier, 'primary');
  assert.deepEqual(result.providerIds, ['search_mock']);
  assert.equal(result.payload.results[0].title, 'harga btc hari ini');
  assert.equal(result.payload.results[0].snippet, 'ringkas hasil');
});

test('xSearch supports merged provider payload contract', async () => {
  const providerA = createXSearchProvider({
    id: 'x_mock_a',
    search: async () => ({
      results: [{ title: 'Post A', url: 'https://x.com/a', snippet: 'Snippet A', source: 'X A' }],
      pageText: 'A'
    })
  });
  const providerB = createXSearchProvider({
    id: 'x_mock_b',
    search: async () => ({
      results: [{ title: 'Post B', url: 'https://x.com/b', snippet: 'Snippet B', source: 'X B' }],
      pageText: 'B'
    })
  });

  const result = await xSearch('openai indonesia', {
    primaryProviders: [providerA, providerB],
    fallbackProviders: [],
    mergeAcrossProviders: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.results.length, 2);
  assert.deepEqual(result.providerIds, ['x_mock_a', 'x_mock_b']);
  assert.equal(result.payload.pageText, 'A B');
});

test('fetchPage returns normalized contract from custom provider', async () => {
  const mockFetchProvider = {
    id: 'fetch_mock',
    fetch: async (url, options = {}) => ({
      ok: true,
      url,
      finalUrl: `${url}?ok=1`,
      title: ' Example Title ',
      content: ' Example body ',
      extractMode: options.extractMode || 'text',
      provider: 'fetch_mock',
      meta: { demo: true }
    })
  };

  const result = await fetchPage('https://example.com', {
    extractMode: 'text',
    primaryProviders: [mockFetchProvider],
    fallbackProviders: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'fetch_mock');
  assert.equal(result.title, 'Example Title');
  assert.equal(result.content, 'Example body');
  assert.deepEqual(result.meta, { demo: true });
});

test('provider registry can be populated from config and selected by config', () => {
  const registry = createDefaultRegistry();
  const fetchProviders = providersFromConfig(registry, 'fetch', { primary: ['http'], fallback: ['jina'] });
  const xRegistry = registerProvidersFromConfig(createProviderRegistry(), {
    xSearch: ['x_mock']
  });
  const xProviders = createDefaultXSearchProviders({ registry: xRegistry });

  assert.ok(Array.isArray(WEB_PROVIDER_REGISTRY.search));
  assert.equal(fetchProviders.primaryProviders[0]?.id, 'http');
  assert.equal(fetchProviders.fallbackProviders[0]?.id, 'jina');
  assert.equal(xProviders.primaryProviders[0]?.id, 'x_mock');
});
