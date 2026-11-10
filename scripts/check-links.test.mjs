import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { checkLinks, summarizeResults } from "./check-links.mjs";

const migri = ["https://migri.fi/en/citizenship-for-adults", "https://migri.fi/en/permanent-residence-permit"];
const outside = "https://example.org/guidance";

async function checkSequence(replies) {
  const methods = [];
  const delays = [];
  const [result] = await checkLinks([outside], {
    async request(url, method) {
      const reply = replies[methods.length];
      methods.push(method);
      assert.equal(url, outside);
      assert.notEqual(reply, undefined, `Unexpected ${method} request`);
      if (reply instanceof Error) throw reply;
      return typeof reply === "number" ? { status: reply, finalUrl: url } : { finalUrl: url, ...reply };
    },
    async wait(ms) { delays.push(ms); },
    now: () => Date.parse("2026-11-10T12:00:00Z"),
  });
  return { result, methods, delays };
}

test("HEAD success needs no GET; HEAD rejection alone cannot establish a broken link", async () => {
  const head = await checkSequence([200]);
  assert.deepEqual(head.methods, ["HEAD"]);
  assert.equal(head.result.outcome, "ok");
  const fallback = await checkSequence([404, 200]);
  assert.deepEqual(fallback.methods, ["HEAD", "GET"]);
  assert.equal(fallback.result.outcome, "ok");
  assert.equal(fallback.result.status, 200);
});

test("confirmed GET 404 and 410 stay broken and do not retry", async () => {
  for (const status of [404, 410]) {
    const { result, methods, delays } = await checkSequence([405, status]);
    assert.deepEqual(methods, ["HEAD", "GET"]);
    assert.deepEqual(delays, []);
    assert.equal(result.status, status);
    assert.equal(result.outcome, "broken");
    const summary = summarizeResults([result], { githubRunner: true });
    assert.deepEqual(summary.broken, [result]);
    assert.deepEqual(summary.failed, [result]);
  }
});

test("temporary responses retry at most once and a recovered link is verified", async () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    const { result, methods, delays } = await checkSequence([405, status, 200]);
    assert.deepEqual(methods, ["HEAD", "GET", "GET"]);
    assert.equal(delays.length, 1);
    assert.equal(result.outcome, "ok");
  }
  const exhausted = await checkSequence([405, 503, 503]);
  assert.deepEqual(exhausted.methods, ["HEAD", "GET", "GET"]);
  assert.equal(exhausted.result.status, 503);
  assert.equal(exhausted.result.outcome, "unverified");
  assert.deepEqual(summarizeResults([exhausted.result], { githubRunner: true }).failed, [exhausted.result]);
});

test("Retry-After accepts delta seconds and HTTP dates without exceeding the retry budget", async () => {
  for (const retryAfter of ["3", "Tue, 10 Nov 2026 12:00:03 GMT"]) {
    const retried = await checkSequence([405, { status: 429, retryAfter }, 200]);
    assert.deepEqual(retried.methods, ["HEAD", "GET", "GET"]);
    assert.deepEqual(retried.delays, [3_000]);
    assert.equal(retried.result.outcome, "ok");
  }
  for (const retryAfter of ["120", "Tue, 10 Nov 2026 12:02:00 GMT"]) {
    const postponed = await checkSequence([405, { status: 429, retryAfter }]);
    assert.deepEqual(postponed.methods, ["HEAD", "GET"]);
    assert.deepEqual(postponed.delays, []);
    assert.equal(postponed.result.outcome, "unverified");
  }
});

test("a temporary transport failure may retry, but a certificate failure does not", async () => {
  const timeout = Object.assign(new Error("connection timed out"), { code: 28 });
  const certificate = Object.assign(new Error("certificate validation failed"), { code: 60 });
  const recovered = await checkSequence([405, timeout, 200]);
  assert.deepEqual(recovered.methods, ["HEAD", "GET", "GET"]);
  assert.equal(recovered.result.outcome, "ok");
  const rejected = await checkSequence([certificate, certificate]);
  assert.deepEqual(rejected.methods, ["HEAD", "GET"]);
  assert.deepEqual(rejected.delays, []);
  assert.equal(rejected.result.outcome, "unverified");
  assert.deepEqual(summarizeResults([rejected.result], { githubRunner: true }).failed, [rejected.result]);
});

test("a Retry-After on HEAD also applies before falling back to GET", async () => {
  const recovered = await checkSequence([{ status: 503, retryAfter: "2" }, 200]);
  assert.deepEqual(recovered.methods, ["HEAD", "GET"]);
  assert.deepEqual(recovered.delays, [2_000]);
  assert.equal(recovered.result.outcome, "ok");
  const postponed = await checkSequence([{ status: 429, retryAfter: "60" }]);
  assert.deepEqual(postponed.methods, ["HEAD"]);
  assert.deepEqual(postponed.delays, []);
  assert.equal(postponed.result.outcome, "unverified");
});

const response = (url, status = 403, finalUrl = url) => ({
  url, status, finalUrl,
  outcome: status === 200 ? "ok" : [404, 410].includes(status) ? "broken" : "unverified",
});

test("only the known mass Migri refusal is a GitHub warning; it is never a verified link", async () => {
  const denied = migri.map((url) => response(url));
  const ok = response(outside, 200);
  const all = [...denied, ok];
  const strict = summarizeResults(all);
  assert.deepEqual(strict.ok, [ok]);
  assert.deepEqual(strict.warningOnly, []);
  assert.deepEqual(strict.failed, denied);

  const ci = summarizeResults(all, { githubRunner: true });
  assert.deepEqual(ci.ok, [ok]);
  assert.deepEqual(ci.warningOnly, denied);
  assert.deepEqual(ci.failed, []);

  const unrelatedDenied = response(outside);
  const broken = response("https://example.org/gone", 410);
  const mixed = summarizeResults([...denied, unrelatedDenied, broken], { githubRunner: true });
  assert.deepEqual(mixed.warningOnly, denied);
  assert.deepEqual(mixed.failed, [unrelatedDenied, broken]);
});

test("single or partial Migri refusals and redirects to another origin are still failures", () => {
  for (const results of [
    [response(migri[0])],
    [response(migri[0]), response(migri[0])],
    [response(migri[0]), response(migri[1], 200)],
    [response(migri[0]), response(migri[1], 404)],
    [response(migri[0]), response(migri[1], 403, outside)],
    [response(migri[0]), response(migri[1], 403, "http://migri.fi/en/permanent-residence-permit")],
  ]) {
    const summary = summarizeResults(results, { githubRunner: true });
    assert.deepEqual(summary.warningOnly, []);
    assert.deepEqual(summary.failed, results.filter(({ outcome }) => outcome !== "ok"));
  }
});

test("a final 403 uses the GET response and does not trigger a retry", async () => {
  const { result, methods, delays } = await checkSequence([403, 403]);
  assert.deepEqual(methods, ["HEAD", "GET"]);
  assert.deepEqual(delays, []);
  assert.equal(result.status, 403);
  assert.equal(result.finalUrl, outside);
  assert.equal(result.outcome, "unverified");
});

test("requests are limited per hostname and keep the original result order", async () => {
  const urls = ["https://migri.fi/1", outside, "https://migri.fi/2", "https://migri.fi/3", "https://migri.fi/4"];
  const active = new Map();
  const peak = new Map();
  let independentHostProgress = false;
  const results = await checkLinks(urls, {
    async request(url, method) {
      assert.equal(method, "HEAD");
      const host = new URL(url).hostname;
      const count = (active.get(host) ?? 0) + 1;
      active.set(host, count);
      peak.set(host, Math.max(peak.get(host) ?? 0, count));
      await setImmediate();
      if (url === outside) independentHostProgress = (active.get("migri.fi") ?? 0) > 0;
      active.set(host, active.get(host) - 1);
      return { status: 200, finalUrl: url };
    },
  });
  assert.equal(peak.get("migri.fi"), 2);
  assert.ok(independentHostProgress, "another hostname must not wait for the Migri queue");
  assert.deepEqual(results.map(({ url, outcome }) => [url, outcome]), urls.map((url) => [url, "ok"]));
});
