const dns = require("dns");
const net = require("net");
const tls = require("tls");
const { execFile } = require("child_process");
const { promisify } = require("util");
const axios = require("axios");

const execFileAsync = promisify(execFile);
const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);
const dnsReverse = promisify(dns.reverse);

const isWindows = process.platform === "win32";

// --- Trigger detection ---

const NETWORK_TRIGGERS = [
  "ping",
  "reachable",
  "bisa diakses",
  "bisa dijangkau",
  "host down",
  "host up",
  "dns lookup",
  "resolve domain",
  "ip address",
  "alamat ip",
  "ip nya",
  "http check",
  "url check",
  "website up",
  "website down",
  "status code",
  "response code",
  "port check",
  "port open",
  "port tertutup",
  "port tersedia",
  "traceroute",
  "tracert",
  "route ke",
  "jalur network",
  "jalur ke",
  "ssl check",
  "ssl expiry",
  "ssl expired",
  "certificate check",
  "sertifikat ssl",
  "cek ssl",
  "https check",
  "whois",
  "domain info",
  "siapa pemilik domain",
  "domain milik",
  "kapan domain",
  "network check",
  "cek jaringan",
  "cek koneksi",
  "koneksi ke",
  "internet check",
  "cek internet"
];

function needsNetworkDiagnostic(message = "") {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;

  // Port + number pattern (e.g. "port 3000 open", "cek port 8080")
  if (/\bport\s*\d{2,5}\b/.test(text)) return true;

  // "ping" must be followed by a host/IP, not just a question like "bisa ping?"
  if (/\bping\b/.test(text)) {
    // Require a host after "ping" (domain, IP, or common name)
    if (/\bping\s+(?:ke\s+)?(?:https?:\/\/|[\d.]+|[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})?)\b/i.test(text)) return true;
    // Or a common domain name after "ping"
    const afterPing = text.replace(/.*\bping\b\s*(?:ke\s+)?/i, "").trim();
    if (afterPing && /^[a-z0-9-]+/.test(afterPing)) return true;
    // Don't trigger for "bisa ping?", "ping nya", etc.
    return false;
  }

  return NETWORK_TRIGGERS.some((trigger) => text.includes(trigger));
}

// --- Intent classification ---

function classifyNetworkIntent(message = "") {
  const text = String(message || "").toLowerCase();
  // Strip URLs before matching keywords (https://... should not trigger "ssl" intent)
  const textNoUrl = text.replace(/https?:\/\/[^\s]+/g, "").trim();

  if (/\bping\b/.test(text)) return "ping";
  if (/\b(dns|resolve|ip address|alamat ip|ip nya)\b/.test(textNoUrl)) return "dns";
  if (/\b(ssl|sertifikat|certificate)\b/.test(textNoUrl)) return "ssl";
  if (/\b(whois|domain info|pemilik domain|milik)\b/.test(textNoUrl)) return "whois";
  if (/\b(traceroute|tracert|jalur|route)\b/.test(textNoUrl)) return "traceroute";
  if (/\b(port (check|open|terbuka|tutup|tersedia))\b/.test(textNoUrl)) return "port";
  if (/\b(http|url|website|status code|response|up|down)\b/.test(textNoUrl)) return "http";

  // Default: try to determine from context
  const host = extractHost(text);
  if (host && /^https?:\/\//.test(host)) return "http";
  if (host && /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host)) return "ping";

  return "ping"; // default fallback
}

// --- Host extraction ---

// Common domains that users might type without TLD
const COMMON_DOMAINS = {
  google: "google.com",
  facebook: "facebook.com",
  instagram: "instagram.com",
  twitter: "twitter.com",
  youtube: "youtube.com",
  tiktok: "tiktok.com",
  github: "github.com",
  whatsapp: "whatsapp.com",
  tokopedia: "tokopedia.com",
  shopee: "shopee.co.id",
  bukalapak: "bukalapak.com",
  detik: "detik.com",
  kompas: "kompas.com",
  cnn: "cnn.com",
  bbc: "bbc.com",
  reddit: "reddit.com",
  netflix: "netflix.com",
  spotify: "spotify.com",
  amazon: "amazon.com",
  apple: "apple.com",
  microsoft: "microsoft.com",
  cloudflare: "cloudflare.com",
  bca: "bca.co.id",
  bri: "bri.co.id",
  mandiri: "bankmandiri.co.id",
  bni: "bni.co.id",
  antam: "antam.co.id"
};

function extractHost(message = "") {
  const text = String(message || "").trim();

  // URL pattern
  const urlMatch = text.match(/(https?:\/\/[^\s,;]+)/i);
  if (urlMatch) return urlMatch[1];

  // Domain pattern (e.g., google.com, sub.domain.co.id)
  const domainMatch = text.match(/\b([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)\b/);
  if (domainMatch) return domainMatch[1];

  // IP address pattern
  const ipMatch = text.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
  if (ipMatch) return ipMatch[1];

  // Common domain without TLD (e.g., "ping facebook" → "facebook.com")
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (COMMON_DOMAINS[word]) return COMMON_DOMAINS[word];
  }

  // Last resort: check if a word looks like a domain name (3+ chars, alphanumeric)
  const candidate = words.find((w) => w.length >= 4 && /^[a-z][a-z0-9]+$/.test(w) && !/^(ping|cek|check|test|ke|di|dari|ke|yang|adalah|bisa|bisa|tidak|nggak|apa|itu|ini|dan|atau|untuk|dengan|dari|host|domain|server|port|ip)$/.test(w));
  if (candidate) return `${candidate}.com`;

  return "";
}

function extractPort(message = "") {
  const match = String(message || "").match(/port\s*(\d{2,5})/i);
  return match ? parseInt(match[1], 10) : 0;
}

// --- Diagnostic functions ---

async function runPing(host, count = 4) {
  if (!host) return { success: false, error: "Host tidak ditemukan." };

  try {
    const args = isWindows
      ? ["-n", String(count), "-w", "3000", host]
      : ["-c", String(count), "-W", "3", host];

    const { stdout } = await execFileAsync("ping", args, { timeout: 15000 });

    // Parse results
    const avgMatch = stdout.match(/(?:Average|rata-rata|avg)\s*=?\s*(\d+)\s*ms/i) || stdout.match(/avg\/(\d+)/);
    const minMatch = stdout.match(/(?:Minimum|Minimum)\s*=?\s*(\d+)\s*ms/i) || stdout.match(/min\/(\d+)/);
    const maxMatch = stdout.match(/(?:Maximum|Maximum)\s*=?\s*(\d+)\s*ms/i) || stdout.match(/max\/(\d+)/);
    const lossMatch = stdout.match(/(\d+)%\s*(?:loss|packet loss|hilang)/i);
    const ttlMatch = stdout.match(/TTL[=:]\s*(\d+)/i);

    const received = (stdout.match(/Received\s*=\s*(\d+)/i) || stdout.match(/Received\s*(\d+)/i) || [, ""])[1];
    const sent = (stdout.match(/Sent\s*=\s*(\d+)/i) || stdout.match(/Sent\s*(\d+)/i) || [, String(count)])[1];

    const success = !/100%\s*(?:loss|packet loss)/i.test(stdout) && /Reply from|Balasan dari/i.test(stdout);

    return {
      success,
      host,
      sent: parseInt(sent, 10) || count,
      received: parseInt(received, 10) || 0,
      loss: parseInt(lossMatch?.[1] || "0", 10),
      avgMs: parseInt(avgMatch?.[1] || "0", 10),
      minMs: parseInt(minMatch?.[1] || "0", 10),
      maxMs: parseInt(maxMatch?.[1] || "0", 10),
      ttl: ttlMatch?.[1] || "",
      raw: stdout
    };
  } catch (err) {
    return { success: false, host, error: err.message };
  }
}

async function runDnsLookup(host) {
  if (!host) return { success: false, error: "Host tidak ditemukan." };

  const results = { host, ipv4: [], ipv6: [], reverse: [] };

  try {
    results.ipv4 = await dnsResolve4(host).catch(() => []);
  } catch { /* ignore */ }

  try {
    results.ipv6 = await dnsResolve6(host).catch(() => []);
  } catch { /* ignore */ }

  if (results.ipv4.length) {
    try {
      results.reverse = await dnsReverse(results.ipv4[0]).catch(() => []);
    } catch { /* ignore */ }
  }

  results.success = results.ipv4.length > 0 || results.ipv6.length > 0;
  return results;
}

async function runHttpCheck(url) {
  // Ensure URL has protocol
  let target = String(url || "").trim();
  if (!target) return { success: false, error: "URL tidak ditemukan." };
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  const start = Date.now();
  try {
    const response = await axios.head(target, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true, // don't throw on 4xx/5xx
      proxy: false,
      headers: { "User-Agent": "Worm-Diagnostic/1.0" }
    });

    const elapsed = Date.now() - start;
    return {
      success: true,
      url: target,
      statusCode: response.status,
      statusText: response.statusText,
      responseMs: elapsed,
      headers: {
        server: response.headers["server"] || "",
        contentType: response.headers["content-type"] || "",
        contentLength: response.headers["content-length"] || "",
        redirect: response.request?.res?.responseUrl || ""
      }
    };
  } catch (err) {
    return {
      success: false,
      url: target,
      error: err.message,
      code: err.code || ""
    };
  }
}

async function runPortCheck(host, port) {
  if (!host) return { success: false, error: "Host tidak ditemukan." };
  if (!port) return { success: false, error: "Port tidak ditemukan." };

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();

    socket.setTimeout(5000);

    socket.on("connect", () => {
      const elapsed = Date.now() - start;
      socket.destroy();
      resolve({ success: true, host, port, open: true, responseMs: elapsed });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ success: true, host, port, open: false, error: "Timeout (5s)" });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ success: true, host, port, open: false, error: err.code || err.message });
    });

    socket.connect(port, host);
  });
}

async function runSslCheck(host) {
  if (!host) return { success: false, error: "Host tidak ditemukan." };

  // Clean host (remove protocol/port)
  const cleanHost = String(host).replace(/^https?:\/\//, "").replace(/:\d+.*$/, "").replace(/\/.*$/, "");

  return new Promise((resolve) => {
    const socket = tls.connect(443, cleanHost, { servername: cleanHost, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();

      if (!cert || !cert.valid_from) {
        resolve({ success: false, host: cleanHost, error: "Tidak ada sertifikat SSL." });
        return;
      }

      const now = new Date();
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const daysLeft = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24));
      const isExpired = now > validTo;
      const isValid = now >= validFrom && now <= validTo;

      resolve({
        success: true,
        host: cleanHost,
        issuer: cert.issuer?.O || cert.issuer?.CN || "Unknown",
        subject: cert.subject?.CN || cleanHost,
        validFrom: validFrom.toISOString().slice(0, 10),
        validTo: validTo.toISOString().slice(0, 10),
        daysLeft,
        isExpired,
        isValid,
        serialNumber: cert.serialNumber || "",
        protocol: socket.getProtocol() || ""
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ success: false, host: cleanHost, error: err.message });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ success: false, host: cleanHost, error: "Timeout (10s)" });
    });
  });
}

async function runTraceroute(host) {
  if (!host) return { success: false, error: "Host tidak ditemukan." };

  try {
    const cmd = isWindows ? "tracert" : "traceroute";
    const args = isWindows ? ["-d", "-w", "3000", "-h", "15", host] : ["-n", "-w", "3", "-m", "15", host];

    const { stdout } = await execFileAsync(cmd, args, { timeout: 30000 });

    // Parse hops
    const hops = [];
    const lines = stdout.split("\n");
    for (const line of lines) {
      const hopMatch = line.match(/^\s*(\d+)\s+(.+)/);
      if (!hopMatch) continue;
      const hopNum = parseInt(hopMatch[1], 10);
      const hopData = hopMatch[2].trim();

      // Extract IP addresses from the hop
      const ips = hopData.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g) || [];
      // Extract latency values
      const latencies = hopData.match(/(\d+)\s*ms/gi) || [];
      const latencyNums = latencies.map((l) => parseInt(l, 10)).filter((n) => Number.isFinite(n));

      hops.push({
        hop: hopNum,
        ip: ips[0] || "*",
        latencyMs: latencyNums.length ? Math.min(...latencyNums) : null,
        raw: hopData
      });
    }

    return {
      success: hops.length > 0,
      host,
      hops: hops.slice(0, 15),
      totalHops: hops.length,
      raw: stdout
    };
  } catch (err) {
    return { success: false, host, error: err.message };
  }
}

async function runWhoisLookup(domain) {
  if (!domain) return { success: false, error: "Domain tidak ditemukan." };

  // Clean domain
  const cleanDomain = String(domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

  try {
    const cmd = isWindows ? "nslookup" : "whois";
    const args = isWindows ? ["-type=SOA", cleanDomain] : [cleanDomain];

    const { stdout } = await execFileAsync(cmd, args, { timeout: 15000 });

    // Parse key fields
    const registrar = (stdout.match(/Registrar:\s*(.+)/i) || stdout.match(/registrar:\s*(.+)/i) || [, ""])[1].trim();
    const creationDate = (stdout.match(/Creat(?:ion|ed)\s*Date?:\s*(.+)/i) || stdout.match(/created:\s*(.+)/i) || [, ""])[1].trim();
    const expiryDate = (stdout.match(/Expir(?:ation|y)\s*Date?:\s*(.+)/i) || stdout.match(/expires:\s*(.+)/i) || [, ""])[1].trim();
    const nameServers = (stdout.match(/Name Server:\s*(.+)/gi) || []).map((m) => m.replace(/Name Server:\s*/i, "").trim()).slice(0, 4);
    const registrant = (stdout.match(/Registrant(?:\s*Organization)?:\s*(.+)/i) || [, ""])[1].trim();

    return {
      success: true,
      domain: cleanDomain,
      registrar: registrar || "N/A",
      creationDate: creationDate || "N/A",
      expiryDate: expiryDate || "N/A",
      nameServers: nameServers.length ? nameServers : ["N/A"],
      registrant: registrant || "N/A",
      raw: stdout.slice(0, 2000)
    };
  } catch (err) {
    return { success: false, domain: cleanDomain, error: err.message };
  }
}

// --- Main executor ---

async function runNetworkDiagnostic(message = "") {
  const intent = classifyNetworkIntent(message);
  const host = extractHost(message);
  const port = extractPort(message);

  // If no host found, try to extract from message context
  let targetHost = host;
  if (!targetHost) {
    // For port checks without a host, default to localhost
    if (intent === "port" && port) {
      targetHost = "127.0.0.1";
    } else {
      return {
        name: "network.check",
        summary: "Tidak ditemukan host/domain yang valid.",
        directReply: "Saya tidak menemukan host atau domain yang valid dalam pesan Anda. Coba sebutkan domain atau IP, misalnya: 'ping google.com' atau 'cek port 3000'.",
        engine: { score: 0.3, evidence: [{ sourceLabel: "Input", sourceType: "unknown", confidence: 0.3, evidence: "No valid host found" }] }
      };
    }
  }

  // Run the appropriate diagnostic
  let result;
  switch (intent) {
    case "ping":
      result = await runPing(targetHost);
      break;
    case "dns":
      result = await runDnsLookup(targetHost);
      break;
    case "http":
      result = await runHttpCheck(targetHost);
      break;
    case "port":
      result = await runPortCheck(targetHost, port || 80);
      break;
    case "ssl":
      result = await runSslCheck(targetHost);
      break;
    case "traceroute":
      result = await runTraceroute(targetHost);
      break;
    case "whois":
      result = await runWhoisLookup(targetHost);
      break;
    default:
      result = await runPing(targetHost);
  }

  // Format result based on intent
  return formatNetworkResult(intent, result, message);
}

// --- Result formatting ---

function formatNetworkResult(intent, result, message = "") {
  if (!result.success) {
    return {
      name: "network.check",
      summary: `${intent} ${result.host || result.domain || ""}: ${result.error || "Gagal"}`,
      directReply: `Gagal melakukan ${intent} ke ${result.host || result.domain || "target"}: ${result.error || "Error tidak diketahui"}`,
      engine: { score: 0.3, evidence: [{ sourceLabel: "Network", sourceType: "unknown", confidence: 0.3, evidence: result.error }] }
    };
  }

  let summary = "";
  let directReply = "";
  let contextText = "";

  switch (intent) {
    case "ping": {
      summary = `${result.host}: ${result.success ? "reachable" : "unreachable"} (avg ${result.avgMs}ms, loss ${result.loss}%)`;
      directReply = result.success
        ? `${result.host} bisa dijangkau. Latency rata-rata ${result.avgMs}ms (min ${result.minMs}ms, max ${result.maxMs}ms). Packet loss: ${result.loss}%.`
        : `${result.host} tidak bisa dijangkau. Packet loss: ${result.loss}%.`;
      contextText = [
        `Ping result for ${result.host}:`,
        `  Sent: ${result.sent}, Received: ${result.received}, Loss: ${result.loss}%`,
        `  Latency: min=${result.minMs}ms, avg=${result.avgMs}ms, max=${result.maxMs}ms`,
        result.ttl ? `  TTL: ${result.ttl}` : ""
      ].filter(Boolean).join("\n");
      break;
    }

    case "dns": {
      const ips = [...result.ipv4, ...result.ipv6];
      summary = `${result.host}: ${ips.join(", ") || "no records"}`;
      directReply = [
        `DNS lookup untuk ${result.host}:`,
        result.ipv4.length ? `- IPv4: ${result.ipv4.join(", ")}` : "",
        result.ipv6.length ? `- IPv6: ${result.ipv6.join(", ")}` : "",
        result.reverse.length ? `- Reverse DNS: ${result.reverse.join(", ")}` : "",
        !ips.length ? "- Tidak ada record DNS ditemukan." : ""
      ].filter(Boolean).join("\n");
      contextText = `DNS lookup for ${result.host}:\n  IPv4: ${result.ipv4.join(", ") || "none"}\n  IPv6: ${result.ipv6.join(", ") || "none"}\n  Reverse: ${result.reverse.join(", ") || "none"}`;
      break;
    }

    case "http": {
      summary = `${result.url}: ${result.statusCode} (${result.responseMs}ms)`;
      directReply = result.success
        ? `HTTP check ${result.url}: Status ${result.statusCode} (${result.statusText}), response ${result.responseMs}ms.${result.headers.server ? ` Server: ${result.headers.server}.` : ""}`
        : `HTTP check ${result.url}: Gagal - ${result.error}`;
      contextText = [
        `HTTP check for ${result.url}:`,
        `  Status: ${result.statusCode} ${result.statusText}`,
        `  Response time: ${result.responseMs}ms`,
        result.headers.server ? `  Server: ${result.headers.server}` : "",
        result.headers.contentType ? `  Content-Type: ${result.headers.contentType}` : ""
      ].filter(Boolean).join("\n");
      break;
    }

    case "port": {
      summary = `${result.host}:${result.port}: ${result.open ? "OPEN" : "CLOSED"}`;
      directReply = result.open
        ? `Port ${result.port} pada ${result.host}: TERBUKA (response ${result.responseMs}ms).`
        : `Port ${result.port} pada ${result.host}: TERTUTUP${result.error ? ` (${result.error})` : ""}.`;
      contextText = `Port check: ${result.host}:${result.port} → ${result.open ? "OPEN" : "CLOSED"}${result.responseMs ? ` (${result.responseMs}ms)` : ""}`;
      break;
    }

    case "ssl": {
      summary = `${result.host}: SSL ${result.isValid ? "valid" : "INVALID"}, expires ${result.validTo} (${result.daysLeft} days)`;
      directReply = [
        `SSL check untuk ${result.host}:`,
        `- Status: ${result.isValid ? "✅ Valid" : "❌ " + (result.isExpired ? "Expired" : "Invalid")}`,
        `- Issuer: ${result.issuer}`,
        `- Valid dari: ${result.validFrom} sampai ${result.validTo}`,
        `- Sisa: ${result.daysLeft} hari`,
        result.protocol ? `- Protocol: ${result.protocol}` : ""
      ].filter(Boolean).join("\n");
      contextText = [
        `SSL certificate for ${result.host}:`,
        `  Issuer: ${result.issuer}`,
        `  Subject: ${result.subject}`,
        `  Valid: ${result.validFrom} → ${result.validTo}`,
        `  Days left: ${result.daysLeft}`,
        `  Protocol: ${result.protocol}`
      ].join("\n");
      break;
    }

    case "traceroute": {
      const hopSummary = result.hops
        .filter((h) => h.ip !== "*")
        .slice(0, 5)
        .map((h) => `#${h.hop} ${h.ip}${h.latencyMs ? ` (${h.latencyMs}ms)` : ""}`)
        .join(" → ");
      summary = `${result.host}: ${result.totalHops} hops, ${hopSummary}`;
      directReply = [
        `Traceroute ke ${result.host} (${result.totalHops} hop):`,
        ...result.hops.slice(0, 10).map((h) =>
          `  ${h.hop}. ${h.ip}${h.latencyMs ? ` - ${h.latencyMs}ms` : " - *"}`
        )
      ].join("\n");
      contextText = result.raw.slice(0, 1500);
      break;
    }

    case "whois": {
      summary = `${result.domain}: registrar=${result.registrar}, expires=${result.expiryDate}`;
      directReply = [
        `WHOIS info untuk ${result.domain}:`,
        `- Registrar: ${result.registrar}`,
        `- Dibuat: ${result.creationDate}`,
        `- Kadaluarsa: ${result.expiryDate}`,
        `- Name servers: ${result.nameServers.join(", ")}`,
        result.registrant !== "N/A" ? `- Pemilik: ${result.registrant}` : ""
      ].filter(Boolean).join("\n");
      contextText = result.raw;
      break;
    }
  }

  return {
    name: "network.check",
    summary,
    directReply,
    contextText,
    engine: {
      score: 0.90,
      evidence: [{ sourceLabel: "Network diagnostic", sourceType: "official", confidence: 0.90, evidence: summary }]
    }
  };
}

module.exports = {
  needsNetworkDiagnostic,
  runNetworkDiagnostic
};
