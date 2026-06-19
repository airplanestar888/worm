const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const isWindows = process.platform === "win32";

// --- Trigger detection ---

const SERVER_TRIGGERS = [
  "server status",
  "status server",
  "cpu usage",
  "cpu load",
  "cpu usage",
  "beban cpu",
  "memory usage",
  "ram usage",
  "penggunaan ram",
  "penggunaan memori",
  "disk space",
  "disk usage",
  "space disk",
  "kapasitas disk",
  "ruang disk",
  "uptime",
  "server hidup",
  "server running",
  "server alive",
  "top process",
  "top proses",
  "proses berat",
  "process list",
  "proses makan resource",
  "resource usage",
  "port terbuka",
  "open port",
  "listening port",
  "port buka",
  "port listen",
  "cek port",
  "check port",
  "server info",
  "info server",
  "system info",
  "info sistem",
  "system status",
  "status sistem"
];

function needsServerDiagnostic(message = "") {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;
  // Port checks with specific port number
  if (/\bport\b/.test(text) && /\b(terbuka|buka|open|listen|check|cek|tutup|closed)\b/.test(text)) return true;
  // Port number + context
  if (/\bport\s*\d{2,5}\b/.test(text)) return true;
  return SERVER_TRIGGERS.some((trigger) => text.includes(trigger));
}

// --- Data collection ---

function getCpuInfo() {
  const cpus = os.cpus();
  const loadAvg = os.loadavg(); // [1min, 5min, 15min]
  const coreCount = cpus.length;
  const model = cpus[0]?.model || "Unknown";

  // Calculate CPU usage percentage from load average
  const cpuPercent1 = Math.min(100, Math.round((loadAvg[0] / coreCount) * 100));
  const cpuPercent5 = Math.min(100, Math.round((loadAvg[1] / coreCount) * 100));

  return {
    model: model.trim(),
    cores: coreCount,
    loadAvg: loadAvg.map((l) => l.toFixed(2)),
    cpuPercent1,
    cpuPercent5
  };
}

function getMemoryInfo() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const usedPercent = Math.round((usedBytes / totalBytes) * 100);

  return {
    total: formatBytes(totalBytes),
    free: formatBytes(freeBytes),
    used: formatBytes(usedBytes),
    usedPercent
  };
}

function getUptimeInfo() {
  const uptimeSeconds = os.uptime();
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} menit`);

  return {
    seconds: uptimeSeconds,
    formatted: parts.join(" ")
  };
}

async function getDiskInfo() {
  try {
    const fs = require("fs");
    if (!fs.statfsSync) return []; // Node.js < 18

    if (isWindows) {
      // Scan common drive letters on Windows
      const drives = ["C", "D", "E", "F"];
      const disks = [];
      for (const letter of drives) {
        try {
          const stat = fs.statfsSync(`${letter}:/`);
          const totalBytes = stat.blocks * stat.bsize;
          const freeBytes = stat.bfree * stat.bsize;
          const usedBytes = totalBytes - freeBytes;
          if (totalBytes <= 0) continue;
          const usedPercent = Math.round((usedBytes / totalBytes) * 100);
          disks.push({
            drive: `${letter}:\\`,
            total: formatBytes(totalBytes),
            used: formatBytes(usedBytes),
            free: formatBytes(freeBytes),
            usedPercent
          });
        } catch { /* drive doesn't exist */ }
      }
      return disks;
    } else {
      // Linux/macOS: scan root and common mounts
      const mounts = ["/", "/home", "/var"];
      const disks = [];
      for (const mount of mounts) {
        try {
          const stat = fs.statfsSync(mount);
          const totalBytes = stat.blocks * stat.bsize;
          const freeBytes = stat.bfree * stat.bsize;
          const usedBytes = totalBytes - freeBytes;
          if (totalBytes <= 0) continue;
          const usedPercent = Math.round((usedBytes / totalBytes) * 100);
          disks.push({
            drive: mount,
            total: formatBytes(totalBytes),
            used: formatBytes(usedBytes),
            free: formatBytes(freeBytes),
            usedPercent
          });
        } catch { /* mount doesn't exist */ }
      }
      return disks;
    }
  } catch {
    return [];
  }
}

async function getTopProcesses(limit = 5) {
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync("tasklist", [
        "/FO", "CSV",
        "/NH"
      ], { timeout: 10000 });

      const processes = stdout
        .split("\n")
        .filter((l) => l.trim())
        .map((line) => {
          const match = line.match(/"([^"]+)","(\d+)","([^"]*)","(\d+)","(\d+)"/);
          if (!match) return null;
          return {
            name: match[1],
            pid: parseInt(match[2], 10),
            memoryKB: parseInt(match[5].replace(/[.,]/g, ""), 10) || 0
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.memoryKB - a.memoryKB)
        .slice(0, limit);

      return processes.map((p) => ({
        name: p.name,
        pid: p.pid,
        memory: formatBytes(p.memoryKB * 1024)
      }));
    } else {
      const { stdout } = await execFileAsync("ps", ["aux", "--sort=-%mem"], { timeout: 10000 });
      return stdout
        .split("\n")
        .slice(1, limit + 1)
        .map((line) => {
          const parts = line.split(/\s+/);
          return {
            name: parts[10] || "?",
            pid: parseInt(parts[1], 10),
            cpu: `${parts[2]}%`,
            memory: `${parts[3]}%`
          };
        });
    }
  } catch {
    return [];
  }
}

async function getListeningPorts(limit = 10) {
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync("netstat", ["-ano"], { timeout: 10000 });
      const ports = stdout
        .split("\n")
        .filter((l) => l.includes("LISTENING"))
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const localAddr = parts[1] || "";
          const pid = parseInt(parts[parts.length - 1], 10);
          const [host, port] = localAddr.rsplit(":", 1);
          return { host: host || localAddr, port: parseInt(port, 10) || 0, pid };
        })
        .filter((p) => p.port > 0)
        .reduce((acc, p) => {
          if (!acc.some((x) => x.port === p.port)) acc.push(p);
          return acc;
        }, [])
        .sort((a, b) => a.port - b.port)
        .slice(0, limit);
      return ports;
    } else {
      const { stdout } = await execFileAsync("ss", ["-tlnp"], { timeout: 10000 });
      return stdout
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const localAddr = parts[3] || "";
          const [host, port] = localAddr.rsplit(":", 1);
          return { host: host || "*", port: parseInt(port, 10) || 0 };
        })
        .filter((p) => p.port > 0)
        .slice(0, limit);
    }
  } catch {
    return [];
  }
}

// --- Helpers ---

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

// String.rsplit polyfill
if (!String.prototype.rsplit) {
  String.prototype.rsplit = function (sep, maxSplit) {
    const parts = this.split(sep);
    if (maxSplit && parts.length > maxSplit) {
      const tail = parts.splice(parts.length - maxSplit).join(sep);
      parts.push(tail);
    }
    return parts;
  };
}

// --- Main executor ---

async function runServerDiagnostic(message = "") {
  const text = String(message || "").toLowerCase();
  const wantsPort = /port\s*(terbuka|buka|open|listen|check|cek)/i.test(text);
  const specificPort = text.match(/port\s*(\d{2,5})/)?.[1];

  // Collect all data in parallel
  const [disk, processes, ports] = await Promise.all([
    getDiskInfo(),
    getTopProcesses(5),
    getListeningPorts(15)
  ]);

  const cpu = getCpuInfo();
  const mem = getMemoryInfo();
  const uptime = getUptimeInfo();

  // If user asked about a specific port, highlight it
  let portHighlight = "";
  if (specificPort) {
    const portNum = parseInt(specificPort, 10);
    const found = ports.find((p) => p.port === portNum);
    portHighlight = found
      ? `Port ${portNum}: TERBUKA (PID ${found.pid || "?"})`
      : `Port ${portNum}: TERTUTUP atau tidak ada listener`;
  }

  // Build summary
  const diskSummary = disk.length
    ? disk.map((d) => `${d.drive}: ${d.used}/${d.total} (${d.usedPercent}%)`).join(", ")
    : "N/A";

  const summary = [
    `CPU: ${cpu.cpuPercent1}% load (${cpu.cores} cores)`,
    `RAM: ${mem.used}/${mem.total} (${mem.usedPercent}%)`,
    `Disk: ${diskSummary}`,
    `Uptime: ${uptime.formatted}`
  ].join(", ");

  // Build detailed context
  const contextLines = [
    "=== Server Status Report ===",
    "",
    `CPU: ${cpu.model}`,
    `  Cores: ${cpu.cores}`,
    `  Load average: ${cpu.loadAvg.join(" / ")} (1/5/15 min)`,
    `  Usage: ${cpu.cpuPercent1}% (1min), ${cpu.cpuPercent5}% (5min)`,
    "",
    `RAM:`,
    `  Total: ${mem.total}`,
    `  Used: ${mem.used} (${mem.usedPercent}%)`,
    `  Free: ${mem.free}`,
    "",
    `Uptime: ${uptime.formatted}`,
    "",
    "Disk:"
  ];

  for (const d of disk) {
    contextLines.push(`  ${d.drive}: ${d.used}/${d.total} (${d.usedPercent}% free: ${d.free})`);
  }

  if (processes.length) {
    contextLines.push("", "Top processes (by memory):");
    for (const p of processes) {
      contextLines.push(`  ${p.name} (PID ${p.pid}): ${p.memory}`);
    }
  }

  if (ports.length) {
    contextLines.push("", "Listening ports:");
    for (const p of ports) {
      contextLines.push(`  ${p.host}:${p.port}${p.pid ? ` (PID ${p.pid})` : ""}`);
    }
  }

  if (portHighlight) {
    contextLines.push("", `Port check: ${portHighlight}`);
  }

  // Build direct reply (Indonesian)
  const replyLines = [
    `Status server:`,
    `- CPU: ${cpu.cpuPercent1}% (${cpu.cores} core, load ${cpu.loadAvg[0]})`,
    `- RAM: ${mem.used} dari ${mem.total} (${mem.usedPercent}%)`,
  ];

  for (const d of disk) {
    replyLines.push(`- Disk ${d.drive}: ${d.used} dari ${d.total} (${d.usedPercent}% terpakai)`);
  }

  replyLines.push(`- Uptime: ${uptime.formatted}`);

  if (portHighlight) {
    replyLines.push(`- ${portHighlight}`);
  }

  return {
    name: "server.status",
    summary,
    contextText: contextLines.join("\n"),
    directReply: replyLines.join("\n"),
    engine: {
      score: 0.95,
      evidence: [{ sourceLabel: "Local system", sourceType: "official", confidence: 0.95, evidence: summary }]
    }
  };
}

module.exports = {
  needsServerDiagnostic,
  runServerDiagnostic
};
