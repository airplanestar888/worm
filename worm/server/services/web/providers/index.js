const { createGoogleNewsProvider } = require('./google-news');
const { createSearchProvider } = require('./search-provider');
const httpFetchProvider = require('./http-fetch');
const jinaFetchProvider = require('./jina-fetch');

module.exports = {
  createGoogleNewsProvider,
  createSearchProvider,
  httpFetchProvider,
  jinaFetchProvider
};
