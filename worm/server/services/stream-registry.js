const activeStreams = new Map();

function closeStream(record) {
  if (!record) return;
  try {
    record.stream?.destroy?.();
  } catch {}
  try {
    record.abort?.();
  } catch {}
}

function registerSessionStream(sessionId, record) {
  const key = String(sessionId || "").trim();
  if (!key) return () => {};

  closeSessionStream(key);
  activeStreams.set(key, record);

  return () => {
    const current = activeStreams.get(key);
    if (current === record) activeStreams.delete(key);
  };
}

function closeSessionStream(sessionId) {
  const key = String(sessionId || "").trim();
  const record = activeStreams.get(key);
  if (!record) return false;
  activeStreams.delete(key);
  closeStream(record);
  return true;
}

module.exports = {
  closeSessionStream,
  registerSessionStream
};
