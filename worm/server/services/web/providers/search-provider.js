function createSearchProvider({ id, label = "", search }) {
  if (!id || typeof search !== "function") {
    throw new Error("Search provider requires id and search function.");
  }

  return {
    id,
    label: label || id,
    search
  };
}

module.exports = {
  createSearchProvider
};
