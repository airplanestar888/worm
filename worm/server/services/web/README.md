# Web Interface

Contract stabil buat orchestrator lain.

## searchWeb(query, options)

Input:

```js
await searchWeb('harga btc hari ini', {
  primaryProviders,
  fallbackProviders,
  cacheTtlMs: 900000,
  mergeAcrossProviders: true
})
```

Output:

```js
{
  ok: true,
  query: 'harga btc hari ini',
  tier: 'primary',
  payload: {
    results: [{ title, url, snippet, source, publishedAt }],
    pageText: '...',
    entityTitle: '',
    entitySubtitle: '',
    instantAnswer: ''
  },
  providerIds: ['google_news']
}
```

## xSearch(query, options)

Input:

```js
await xSearch('openai indonesia', {
  primaryProviders,
  fallbackProviders,
  cacheTtlMs: 900000,
  mergeAcrossProviders: true
})
```

Output:

```js
{
  ok: true,
  query: 'openai indonesia',
  tier: 'primary',
  payload: {
    results: [{ title, url, snippet, source, publishedAt }],
    pageText: '...',
    entityTitle: '',
    entitySubtitle: '',
    instantAnswer: ''
  },
  providerIds: ['x_mock']
}
```

## fetchPage(url, options)

Input:

```js
await fetchPage('https://moss.site/', {
  extractMode: 'text',
  cacheTtlMs: 900000
})
```

Output:

```js
{
  ok: true,
  url: 'https://moss.site/',
  finalUrl: 'https://moss.site/',
  title: 'Moss',
  content: '...',
  extractMode: 'text',
  provider: 'http',
  cached: false,
  error: null,
  meta: {}
}
```

## Contoh orchestrator lain

```js
const {
  searchWeb,
  xSearch,
  fetchPage,
  createSearchProvider,
  createDefaultXSearchProviders,
  createDefaultFetchProviders
} = require('./index');

async function runMyOrchestrator(input) {
  if (input.url) {
    const fetchProviders = createDefaultFetchProviders();
    return fetchPage(input.url, {
      extractMode: 'text',
      primaryProviders: fetchProviders.primaryProviders,
      fallbackProviders: fetchProviders.fallbackProviders
    });
  }

  const customProvider = createSearchProvider({
    id: 'my_source',
    search: async (query) => ({ results: [{ title: query, url: '', snippet: 'demo' }] })
  });

  return searchWeb(input.query, {
    primaryProviders: [customProvider],
    mergeAcrossProviders: true
  });
}

async function runXSearch(input) {
  const providers = createDefaultXSearchProviders();
  return xSearch(input.query, {
    primaryProviders: providers.primaryProviders,
    fallbackProviders: providers.fallbackProviders,
    mergeAcrossProviders: true
  });
}
```

## Catatan

- Search dan fetch dipisah.
- Provider detail disembunyikan dari caller.
- Hasil search dinormalisasi ke `title/url/snippet`.
- Ada cache TTL.
- Ada fallback chain.
- Registry provider default dibaca dari `WEB_PROVIDER_REGISTRY` dan urutan selection dari `WEB_PROVIDER_SELECTIONS` (dua-duanya JSON env). `xSearch` default sengaja kosong sampai provider beneran didaftarkan.
- JS-heavy/protected page tidak dipaksa fetch biasa; akan return `BROWSER_REQUIRED`.
