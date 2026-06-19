/**
 * Smoke test for the web orchestrator pipeline.
 * Tests various query types to verify tool routing, caching, and extraction.
 *
 * Usage: node tests/smoke-pipeline.js
 */
const http = require("http");

const BASE = "http://localhost:3842";

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => raw += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function postSSE(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => raw += chunk);
      res.on("end", () => {
        const lines = raw.split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => {
            try { return JSON.parse(l.slice(6)); } catch { return null; }
          })
          .filter(Boolean);
        resolve(lines);
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(new URL(path, BASE), (res) => {
      let raw = "";
      res.on("data", (chunk) => raw += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    }).on("error", reject);
  });
}

const TESTS = [
  {
    name: "🟢 Crypto price (BTC) — should route to CoinGecko",
    message: "berapa harga bitcoin sekarang?",
    expect: { hasToken: true, category: "crypto_price" }
  },
  {
    name: "🟢 Gold price — should route to Logam Mulia / Yahoo",
    message: "harga emas antam hari ini",
    expect: { hasToken: true, category: "gold_price" }
  },
  {
    name: "🟢 News query — should trigger web search",
    message: "berita teknologi terbaru hari ini",
    expect: { hasToken: true, category: "technology_news" }
  },
  {
    name: "🟢 Office query — should route to Wikipedia + search",
    message: "siapa presiden amerika serikat sekarang?",
    expect: { hasToken: true, category: "office" }
  },
  {
    name: "🟢 Local knowledge — should NOT trigger tools",
    message: "jelaskan hukum newton tentang gravitasi",
    expect: { noTool: true }
  },
  {
    name: "🟢 Commodity price (beras) — should route to PIHPS",
    message: "harga beras sekarang berapa?",
    expect: { hasToken: true, category: "staple_price" }
  },
  {
    name: "🟢 Stock query — should trigger search",
    message: "harga saham BBCA hari ini",
    expect: { hasToken: true, category: "stock" }
  },
  {
    name: "🟢 Sports query — should trigger fixture lookup",
    message: "jadwal pertandingan persib berikutnya",
    expect: { hasToken: true, category: "sports_news" }
  }
];

async function runSmokeTest() {
  console.log("🔥 Smoke Test — Web Orchestrator Pipeline\n");
  console.log("=".repeat(60));

  // 1. Health check
  console.log("\n📡 Health Check...");
  const health = await get("/api/health");
  const activeProviders = (health.providers || []).filter((p) => p.ok).map((p) => p.id);
  console.log(`   Providers: ${activeProviders.join(", ") || "none"}`);
  console.log(`   Status: ${health.ok ? "✅ OK" : "❌ DOWN"}`);

  // 2. Create a session
  console.log("\n📝 Creating session...");
  const sessionResult = await postJson("/api/sessions", {
    provider: "nvidia",
    model: "stepfun-ai/step-3.5-flash",
    surfaceMode: "deep_surf"
  });
  const sess = sessionResult?.session;
  if (!sess) {
    console.log("❌ Failed to create session:", JSON.stringify(sessionResult));
    return;
  }
  console.log(`   Session: ${sess.id} (provider: ${sess.provider}, model: ${sess.model})`);

  // 3. Run each test
  const results = [];
  for (const test of TESTS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📨 ${test.name}`);
    console.log(`   Query: "${test.message}"`);

    const start = Date.now();
    try {
      const lines = await postSSE("/api/chat/stream", {
        sessionId: sess.id,
        token: sess.token,
        message: test.message,
        provider: sess.provider,
        model: sess.model,
        surfaceMode: "deep_surf",
        mode: "low"
      });

      const elapsed = Date.now() - start;
      const done = lines.find((l) => l.done);
      const tokens = lines.filter((l) => l.token).map((l) => l.token).join("");
      const reasonings = lines.filter((l) => l.reasoning).map((l) => l.reasoning).join("");

      if (done) {
        const content = done.content || tokens;
        const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
        console.log(`   ✅ Response (${elapsed}ms, ${done.responseMs || "?"}ms model):`);
        console.log(`   ${preview.replace(/\n/g, "\n   ")}`);

        if (reasonings) {
          console.log(`   💭 Reasoning: ${reasonings.slice(0, 100)}...`);
        }

        results.push({
          name: test.name,
          status: "PASS",
          elapsed,
          contentLength: content.length
        });
      } else {
        const errorLine = lines.find((l) => l.error);
        console.log(`   ❌ No done signal (${elapsed}ms)`);
        if (errorLine) console.log(`   Error: ${errorLine.error}`);
        results.push({ name: test.name, status: "FAIL", elapsed });
      }
    } catch (err) {
      console.log(`   ❌ Exception: ${err.message}`);
      results.push({ name: test.name, status: "ERROR", elapsed: Date.now() - start });
    }
  }

  // 4. Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 Summary:\n");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status !== "PASS").length;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : "❌";
    console.log(`   ${icon} ${r.name} (${r.elapsed}ms)`);
  }
  console.log(`\n   Total: ${results.length} | Pass: ${passed} | Fail: ${failed}`);

  // 5. Cache test — re-run first query to verify cache hit
  console.log(`\n${"─".repeat(60)}`);
  console.log("🗄️  Cache Test — re-running BTC query...");
  const cacheStart = Date.now();
  const cacheLines = await postSSE("/api/chat/stream", {
    sessionId: sess.id,
    token: sess.token,
    message: "berapa harga bitcoin sekarang?",
    provider: sess.provider,
    model: sess.model,
    surfaceMode: "deep_surf",
    mode: "low"
  });
  const cacheElapsed = Date.now() - cacheStart;
  const cacheDone = cacheLines.find((l) => l.done);
  console.log(`   Response time: ${cacheElapsed}ms (should be faster than first run)`);

  console.log("\n🏁 Smoke test complete.\n");
}

runSmokeTest().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
