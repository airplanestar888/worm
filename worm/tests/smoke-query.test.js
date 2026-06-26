/**
 * Smoke test: Query generation & intent detection
 * Tests 10 queries across crypto, finance, statistics, comparison
 */
const test = require("node:test");
const assert = require("node:assert/strict");

// Import the web-live-tool module
const webLiveTool = require("../server/tools/web-live-tool");

// Test queries
const TEST_QUERIES = [
  // Crypto
  { id: 1, query: "harga bitcoin hari ini", expectKind: "price", expectLookup: true, category: "crypto" },
  { id: 2, query: "Ethereum price now", expectKind: "price", expectLookup: true, category: "crypto" },

  // Finance
  { id: 3, query: "harga emas hari ini", expectKind: "price", expectLookup: true, category: "finance" },
  { id: 4, query: "kurs USD ke IDR sekarang", expectKind: "price", expectLookup: true, category: "finance" },
  { id: 5, query: "harga saham BBCA", expectKind: "stock", expectLookup: true, category: "finance" },

  // Statistics / Comparison
  { id: 6, query: "compare 3 nations GDP in EUROPE", expectKind: "comparison", expectLookup: true, category: "stats" },
  { id: 7, query: "bandingkan GDP Indonesia dan Thailand", expectKind: "comparison", expectLookup: true, category: "stats" },
  { id: 8, query: "peringkat inflasi negara ASEAN 2024", expectKind: "comparison", expectLookup: true, category: "stats" },

  // News
  { id: 9, query: "berita teknologi terbaru", expectKind: "technology_news", expectLookup: true, category: "news" },

  // Office
  { id: 10, query: "siapa presiden Indonesia sekarang", expectKind: "office", expectLookup: true, category: "office" }
];

test("smoke: query kind detection", () => {
  for (const t of TEST_QUERIES) {
    const kind = webLiveTool.classifyLiveIntent(t.query);
    console.log(`  [${t.id}] "${t.query}" → kind=${kind} (expect=${t.expectKind})`);
    assert.equal(kind, t.expectKind, `Query ${t.id}: expected kind="${t.expectKind}", got="${kind}"`);
  }
});

test("smoke: live intent detection", () => {
  for (const t of TEST_QUERIES) {
    const intent = webLiveTool.detectLiveIntent(t.query);
    console.log(`  [${t.id}] "${t.query}" → shouldLookup=${intent.shouldLookup} (expect=${t.expectLookup})`);
    assert.equal(intent.shouldLookup, t.expectLookup, `Query ${t.id}: expected shouldLookup=${t.expectLookup}, got=${intent.shouldLookup}`);
  }
});

test("smoke: cleanLiveQuery produces non-empty output", () => {
  for (const t of TEST_QUERIES) {
    const cleaned = webLiveTool.cleanLiveQuery(t.query);
    console.log(`  [${t.id}] "${t.query}" → cleaned="${cleaned}"`);
    assert.ok(cleaned.length > 0, `Query ${t.id}: cleanLiveQuery returned empty`);
  }
});
