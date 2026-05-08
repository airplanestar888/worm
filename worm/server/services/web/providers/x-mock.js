const { createSearchProvider } = require('./search-provider');

function createMockXSearchProvider() {
  return createSearchProvider({
    id: 'x_mock',
    label: 'Mock X Search',
    search: async (query) => ({
      results: [
        {
          title: `Post about ${query}`,
          url: 'https://x.com/mock/status/1',
          snippet: `Mock X result for ${query}`,
          source: 'X Mock',
          publishedAt: new Date().toISOString()
        }
      ],
      pageText: `Mock X result for ${query}`,
      instantAnswer: ''
    })
  });
}

module.exports = {
  createMockXSearchProvider
};
