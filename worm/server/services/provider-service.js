const axios = require("axios");
const { Readable } = require("stream");

const {
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_CONTEXT_TOKENS,
  NVIDIA_BASE_URL,
  NVIDIA_API_KEY,
  NVIDIA_MODEL,
  HERMES_BASE_URL,
  HERMES_API_KEY,
  HERMES_MODEL
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

async function getHermesModels() {
  if (!HERMES_API_KEY) return [];
  const res = await axios.get(`${HERMES_BASE_URL}/models`, {
    timeout: 15000,
    proxy: false,
    headers: { Authorization: `Bearer ${HERMES_API_KEY}` }
  });
  return (res.data?.data || []).map((item) => item.id).filter(Boolean);
}

async function getProviderModels(provider) {
  if (provider === "nvidia") return getNvidiaModels();
  if (provider === "hermes") return getHermesModels();
  return getOllamaModels();
}

function defaultModelFor(provider) {
  if (provider === "nvidia") return NVIDIA_MODEL;
  if (provider === "hermes") return HERMES_MODEL;
  return OLLAMA_MODEL;
}

function isProviderConfigured(provider) {
  if (provider === "nvidia") return Boolean(NVIDIA_API_KEY);
  if (provider === "hermes") return Boolean(HERMES_API_KEY);
  return true;
}

function extractHermesContent(data = {}) {
  return String(
    data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.message?.content
    || data?.content
    || data?.reply
    || data?.response
    || data?.text
    || ""
  );
}

async function streamNvidiaChat({ model, messages, mode }) {
  return axios({
    method: "post",
    url: `${NVIDIA_BASE_URL}/chat/completions`,
    data: {
      model,
      stream: true,
      messages,
      temperature: mode === "high" ? 0.7 : mode === "medium" ? 0.5 : 0.3
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

async function completeNvidiaChat({ model, messages, mode, maxTokens = 256 }) {
  const response = await axios({
    method: "post",
    url: `${NVIDIA_BASE_URL}/chat/completions`,
    data: {
      model,
      stream: false,
      messages,
      temperature: mode === "high" ? 0.7 : mode === "medium" ? 0.5 : 0.2,
      top_p: 0.9,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    },
    timeout: 45000,
    proxy: false,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NVIDIA_API_KEY}`
    }
  });
  return String(response.data?.choices?.[0]?.message?.content || "").trim();
}

async function streamHermesChat({ model, messages, mode }) {
  const response = await axios({
    method: "post",
    url: `${HERMES_BASE_URL}/reply`,
    data: {
      model,
      messages,
      temperature: mode === "high" ? 0.7 : mode === "medium" ? 0.5 : 0.3
    },
    timeout: 180000,
    proxy: false,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HERMES_API_KEY}`
    }
  });

  // /v1/reply is intentionally non-streaming for low overhead.  Worm's chat
  // pipeline expects an SSE stream, so wrap the completed reply in one
  // OpenAI-compatible SSE chunk plus [DONE].
  const content = extractHermesContent(response.data);
  const payload = JSON.stringify({
    choices: [{ delta: { content }, finish_reason: "stop" }]
  });
  return {
    data: Readable.from([`data: ${payload}\n\n`, "data: [DONE]\n\n"])
  };
}

async function completeHermesChat({ model, messages, mode, maxTokens = 256 }) {
  const response = await axios({
    method: "post",
    url: `${HERMES_BASE_URL}/reply`,
    data: {
      model,
      stream: false,
      messages,
      temperature: mode === "high" ? 0.7 : mode === "medium" ? 0.5 : 0.2,
      top_p: 0.9,
      max_tokens: maxTokens
    },
    timeout: 45000,
    proxy: false,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HERMES_API_KEY}`
    }
  });
  return extractHermesContent(response.data).trim();
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

async function completeOllamaChat({ model, messages, mode, maxTokens = 256 }) {
  const response = await axios({
    method: "post",
    url: `${OLLAMA_BASE_URL}/api/chat`,
    data: {
      model,
      stream: false,
      format: "json",
      messages,
      options: {
        temperature: mode === "high" ? 0.7 : mode === "medium" ? 0.5 : 0.2,
        num_ctx: OLLAMA_CONTEXT_TOKENS,
        num_predict: maxTokens
      }
    },
    timeout: 45000,
    proxy: false,
    headers: { "Content-Type": "application/json" }
  });
  return String(response.data?.message?.content || "").trim();
}

module.exports = {
  completeHermesChat,
  completeNvidiaChat,
  completeOllamaChat,
  defaultModelFor,
  getProviderModels,
  getOllamaModels,
  getNvidiaModels,
  getHermesModels,
  isProviderConfigured,
  streamHermesChat,
  streamNvidiaChat,
  streamOllamaChat
};
