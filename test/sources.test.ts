import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFaction } from "../src/vendor/mfm/parse.js";
import { publicFetch, refreshResearch } from "../src/sources.js";
import { Store } from "../src/store.js";
import { extractArticle } from "../src/articles.js";
import type { Evidence } from "../src/model.js";
const html = `<html><body><header>v1.5</header><h1>TEST</h1><div class="flex flex-col space-y-1 m-1"><div><span class="text-xl">TEST UNIT</span></div><div class="bg-slate-200">YOUR 1ST TO 2ND UNITS COST</div><ul class="leaders"><li><span>5 models</span><span>100 pts</span></li></ul><div class="bg-slate-200">YOUR 3RD + UNIT COSTS</div><ul class="leaders"><li><span>5 models</span><span>120 pts</span></li></ul></div></body></html>`;
test("official parser preserves tiers and fails closed on changed fields", () => {
  const p = parseFaction(html, "test", "Test");
  assert.equal(p.units[0].pricing[1].range, "[3,)");
  assert.equal(p.units[0].pricing[1].costs[0].points, 120);
  assert.throws(() =>
    parseFaction(html.replace("120 pts", "unknown"), "test", "Test"),
  );
});
test("source fetch rejects local and unapproved endpoints before network", async () => {
  await assert.rejects(publicFetch("http://127.0.0.1/admin"));
  await assert.rejects(publicFetch("https://attacker.example/data"));
  await assert.rejects(publicFetch("https://user:password@api.github.com/"));
});
test("research discovery deduplicates and leaves format unknown", async () => {
  const s = new Store(":memory:");
  const feed =
    "<rss><channel><item><title>Competitive Innovations in 11th</title><link>https://www.goonhammer.com/example/</link><pubDate>Thu, 01 Oct 2026 13:00:00 GMT</pubDate></item></channel></rss>";
  await refreshResearch(s, async () => feed);
  await refreshResearch(s, async () => feed);
  assert.equal(s.evidence().length, 1);
  assert.equal(s.evidence()[0].pointsLimit, null);
  assert.equal(s.evidence()[0].kind, "research-lead");
  s.close();
});
test("article facts remain unverified and challenges do not become results", () => {
  const lead: Evidence = {
    id: "test",
    event: "Synthetic report",
    eventDate: null,
    publishedAt: null,
    pointsLimit: null,
    edition: "11th",
    rulesVersion: null,
    faction: null,
    placing: null,
    record: null,
    summary: "Lead",
    url: "https://www.goonhammer.com/test/",
    retrievedAt: new Date().toISOString(),
    kind: "research-lead",
  };
  const r = extractArticle(
    "<article><h2>Example event</h2><p>Game size: 2000. MFM v1.5</p><h3>Example player – Black Templars – 1st Place – 5-0</h3></article>",
    lead,
  );
  assert.equal(r.pointsLimit, 2000);
  assert.equal(r.rulesVersion, "MFM 1.5");
  assert.equal(r.kind, "research-lead");
  assert.equal(r.eventDate, null);
  assert.match(r.summary, /placing reported: 1/);
  assert.match(
    extractArticle('<div id="challenge-container"></div>', lead).summary,
    /access challenge/,
  );
});
