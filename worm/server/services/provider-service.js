const axios = require("axios");

const {
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_CONTEXT_TOKENS,
  NVIDIA_BASE_URL,
  NVIDIA_API_KEY,
  NVIDIA_MODEL
} = require("../config");

async function getOllamaModels() {
  const res = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 10000, proxy: false });
  return (res.data?.models || []).map((item) => item.name).filter(Boolean);
}

async function getNvidiaModels() {
  if (!NVIDIA_API_KEY) return [];
  const res = await axios.get(`${NVIDIA_BASE_URL}/models`, {
    timeout: 15000,
    proxy: false,
    headers: { Authorization: `Bearer ${NVIDIA_API_KEY}` }
  });
  return (res.data?.data || []).map((item) => item.id).filter(Boolean);
}

async function getProviderModels(provider) {
  if (provider === "nvidia") return getNvidiaModels();
  return getOllamaModels();
}

function defaultModelFor(provider) {
  return provider === "nvidia" ? NVIDIA_MODEL : OLLAMA_MODEL;
}

function isProviderConfigured(provider) {
  return provider !== "nvidia" || Boolean(NVIDIA_API_KEY);
}

async function streamNvidiaChat({ model, messages, mode }) {
  return axios({
    method: "post",
    url: `${NVIDIA_BASE_URL}/chat/completions`,
    data: {
      model,
      stream: true,
      messages,
      temperature: mode === "high" ? 0.7 : mode === "medium" ? 0.5 : 0.3,
      top_p: 0.9,
      max_tokens: 2048
    },
    responseType: "stream",
    timeout: 180000,
    proxy: false,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NVIDIA_API_KEY}`
    }
  });
}

async function streamOllamaChat({ model, messages, mode }) {
  return axios({
    method: "post",
    url: `${OLLAMA_BASE_URL}/api/chat`,
    data: {
      model,
      stream: true,
      messages,
      options: {
        temperature: mode === "high" ? 0.7 : mode === "medium" ? 0.5 : 0.3,
        num_ctx: OLLAMA_CONTEXT_TOKENS
      }
    },
    responseType: "stream",
    timeout: 180000,
    proxy: false,
    headers: { "Content-Type": "application/json" }
  });
}

module.exports = {
  defaultModelFor,
  getProviderModels,
  getOllamaModels,
  getNvidiaModels,
  isProviderConfigured,
  streamNvidiaChat,
  streamOllamaChat
};
