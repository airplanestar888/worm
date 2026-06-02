document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshBtn').addEventListener('click', render);
  document.getElementById('clearBtn').addEventListener('click', clearLogs);
  document.getElementById('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  render();
});

async function render() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
  const logs = response?.logs || [];
  const rows = document.getElementById('rows');
  rows.innerHTML = '';

  document.getElementById('summary').textContent = `total logs: ${logs.length}`;

  for (const item of [...logs].reverse()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(formatTime(item.ts))}</td>
      <td>${escapeHtml(item.status || '-')}</td>
      <td>${escapeHtml(item.authorHandle || item.author || '-')}</td>
      <td><pre>${escapeHtml(item.text || '')}</pre></td>
      <td><pre>${escapeHtml(item.reply || '')}</pre></td>
      <td>${escapeHtml(item.reason || '-')}</td>
    `;
    rows.appendChild(tr);
  }
}

async function clearLogs() {
  await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
  render();
}

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
