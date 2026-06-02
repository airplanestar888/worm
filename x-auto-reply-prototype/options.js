let availableModels = [];
let providerPresets = {};

const fields = [
  'enabled',
  'dryRun',
  'autoSubmit',
  'autoLikeAfterReply',
  'postProcessReply',
  'replyLanguageMode',
  'provider',
  'apiKey',
  'model',
  'personaMode',
  'personaStyle',
  'personaPrompt',
  'blacklistKeywords',
  'whitelistAccounts',
  'whitelistEnabled',
  'skipOwnAccount',
  'skipPromoted',
  'minTweetLength',
  'cooldownSec',
  'maxRepliesPerHour',
  'autoRefreshAfterSubmits',
  'autoScrollDistanceMode',
  'maxReplyLength'
];

document.addEventListener('DOMContentLoaded', async () => {
  const providersResponse = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_PRESETS' });
  providerPresets = providersResponse?.providers || {};
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const settings = response?.settings || {};

  for (const field of fields) {
    const element = document.getElementById(field);
    if (!element) continue;
    if (element.type === 'checkbox') {
      element.checked = Boolean(settings[field]);
    } else {
      element.value = settings[field] ?? '';
    }
  }
  syncModelForSelectedProvider();
  initModelPreset(document.getElementById('model')?.value || settings.model || '');

  document.getElementById('saveBtn').addEventListener('click', save);
  document.getElementById('resetBtn')?.addEventListener('click', async () => {
    if (confirm('Reset semua setingan ke default (dari config.js)?')) {
      await chrome.storage.local.remove(['settings']);
      window.location.reload();
    }
  });
  document.getElementById('reloadModelsBtn')?.addEventListener('click', () => loadAvailableModels(true));
  document.getElementById('provider')?.addEventListener('change', applySelectedProviderPreset);
  document.getElementById('openLogsBtn')?.addEventListener('click', async () => {
    const url = chrome.runtime.getURL('logs.html');
    await chrome.tabs.create({ url });
  });
});

function applySelectedProviderPreset() {
  const provider = document.getElementById('provider')?.value;
  const preset = providerPresets?.[provider];
  if (!preset) return;
  document.getElementById('model').value = preset.model || '';
  availableModels = Array.isArray(preset.models) ? [...preset.models] : [];
  renderModelOptions(preset.model || '');
}

function syncModelForSelectedProvider() {
  const provider = document.getElementById('provider')?.value;
  const model = document.getElementById('model');
  const selectedPreset = providerPresets?.[provider];
  if (!model || !selectedPreset?.model) return;

  if (!model.value || isModelFromAnotherProvider(model.value, provider)) {
    model.value = selectedPreset.model;
  }
  availableModels = Array.isArray(selectedPreset.models) ? [...selectedPreset.models] : [];
}

function isModelFromAnotherProvider(modelValue, selectedProvider) {
  const normalizedModel = String(modelValue || '').trim();
  if (!normalizedModel) return false;

  return Object.entries(providerPresets || {}).some(([provider, preset]) => {
    if (provider === selectedProvider) return false;
    const knownModels = [preset?.model, ...(Array.isArray(preset?.models) ? preset.models : [])].filter(Boolean);
    return knownModels.includes(normalizedModel);
  });
}

function initModelPreset(currentModel) {
  const preset = document.getElementById('modelPreset');
  const model = document.getElementById('model');
  if (!preset || !model) return;

  renderModelOptions(currentModel);

  preset.addEventListener('change', () => {
    if (preset.value === '__custom__') {
      model.focus();
      model.select();
      return;
    }
    model.value = preset.value;
  });

  model.addEventListener('input', () => {
    const value = model.value.trim();
    preset.value = [...preset.options].some((option) => option.value === value) ? value : '__custom__';
  });

  loadAvailableModels(false);
}

async function loadAvailableModels(force = false) {
  if (!force && availableModels.length > 0) return;
  const model = document.getElementById('model');
  renderModelOptions(model?.value || '', 'loading models...');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_AVAILABLE_MODELS' });
    availableModels = response?.ok && Array.isArray(response.models) ? response.models : [];
  } catch (_error) {
    availableModels = [];
  }

  renderModelOptions(model?.value || '');
}

function renderModelOptions(currentModel = '', placeholder = '') {
  const preset = document.getElementById('modelPreset');
  if (!preset) return;

  if (placeholder) {
    preset.innerHTML = `<option value="__custom__">${escapeHtml(placeholder)}</option>`;
    preset.value = '__custom__';
    return;
  }

  const provider = document.getElementById('provider')?.value;
  const presetModels = Array.isArray(providerPresets?.[provider]?.models) ? providerPresets[provider].models : [];
  const models = [...new Set([...presetModels, ...availableModels])];
  if (currentModel && !models.includes(currentModel)) models.unshift(currentModel);
  preset.innerHTML = [
    ...models.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`),
    '<option value="__custom__">custom...</option>'
  ].join('');
  preset.value = currentModel && models.includes(currentModel) ? currentModel : '__custom__';
}

async function save() {
  const payload = {};
  for (const field of fields) {
    const element = document.getElementById(field);
    if (!element) continue;
    payload[field] = element.type === 'checkbox' ? element.checked : element.value;
  }

  payload.minTweetLength = Number(payload.minTweetLength || 0);
  payload.cooldownSec = Number(payload.cooldownSec || 0);
  payload.maxRepliesPerHour = Number(payload.maxRepliesPerHour || 0);
  payload.autoRefreshAfterSubmits = Number(payload.autoRefreshAfterSubmits || 0);
  payload.maxReplyLength = Number(payload.maxReplyLength || 220);

  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    payload
  });

  const status = document.getElementById('status');
  status.textContent = response?.ok ? 'saved' : `error: ${response?.error || 'unknown'}`;
  setTimeout(() => (status.textContent = ''), 2000);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
