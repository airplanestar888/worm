document.addEventListener('DOMContentLoaded', async () => {
  const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const settings = settingsResponse?.settings || {};
  document.getElementById('enabled').checked = Boolean(settings.enabled);
  document.getElementById('dryRun').checked = Boolean(settings.dryRun);

  const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
  const stats = statsResponse?.stats || {};
  document.getElementById('stats').textContent = `24h: ${stats.last24h || 0} | 1h sent: ${stats.submittedLastHour || 0}`;

  document.getElementById('saveBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: {
        enabled: document.getElementById('enabled').checked,
        dryRun: document.getElementById('dryRun').checked
      }
    });
    window.close();
  });

  document.getElementById('openOptionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('openLogsBtn').addEventListener('click', async () => {
    const url = chrome.runtime.getURL('logs.html');
    await chrome.tabs.create({ url });
  });
});
