import assert from "node:assert/strict";

const site = new URL("https://finresidence.fi/");
const timeoutMs = 20_000;
const assets = [
  { path: "", type: /text\/html/, contains: /id=["']calculator["']/ },
  { path: "i18n.js", type: /(?:text|application)\/javascript/ },
  { path: "wasm_exec.js", type: /(?:text|application)\/javascript/ },
  { path: "main.wasm", wasm: true },
  { path: "favicon.svg", type: /image\/svg\+xml/, contains: /<svg\b/ },
  { path: "site.webmanifest", contains: /"name"\s*:/ },
  { path: "robots.txt", contains: /Sitemap:\s*https:\/\/finresidence\.fi\/sitemap\.xml/ },
  { path: "sitemap.xml", contains: /<loc>https:\/\/finresidence\.fi\/<\/loc>/ }
];

async function checkAsset(asset) {
  const url = new URL(asset.path, site);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "FinResidence-site-health/1.0" }
  });
  assert.equal(response.status, 200, `${url} must return HTTP 200`);
  const finalUrl = new URL(response.url);
  assert.equal(finalUrl.protocol, "https:", `${url} must remain on HTTPS`);
  assert.equal(finalUrl.hostname, site.hostname, `${url} must stay on the production domain`);
  if (asset.type) {
    assert.match(response.headers.get("content-type") ?? "", asset.type, `${url} has an unexpected content type`);
  }
  const body = await response.arrayBuffer();
  assert.ok(body.byteLength > 0, `${url} is empty`);
  if (asset.wasm) {
    assert.deepEqual([...new Uint8Array(body).slice(0, 4)], [0, 97, 115, 109], "main.wasm must be a WebAssembly binary");
    await WebAssembly.compile(body);
  } else if (asset.contains) {
    assert.match(new TextDecoder().decode(body), asset.contains, `${url} does not contain the expected site content`);
  }
  console.log(`OK ${response.status} ${url} (${body.byteLength} bytes)`);
}

async function checkRedirect(from, destination) {
  const response = await fetch(from, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "FinResidence-site-health/1.0" }
  });
  assert.ok([301, 302, 303, 307, 308].includes(response.status), `${from} must return a redirect, received HTTP ${response.status}`);
  const location = response.headers.get("location");
  assert.ok(location, `${from} must supply a Location header`);
  const target = new URL(location, from);
  assert.equal(target.protocol, "https:", `${from} must redirect to HTTPS`);
  assert.equal(target.hostname, destination.hostname, `${from} must redirect to ${destination.hostname}`);
  assert.equal(target.pathname, destination.pathname, `${from} must preserve the root path`);
  await response.body?.cancel();
  console.log(`OK ${response.status} ${from} -> ${target}`);
}

const httpRoot = new URL("http://finresidence.fi/");
const wwwRoot = new URL("https://www.finresidence.fi/");
const checks = [
  ...assets.map((asset) => ({ url: new URL(asset.path, site), run: () => checkAsset(asset) })),
  { url: httpRoot, run: () => checkRedirect(httpRoot, site) },
  { url: wwwRoot, run: () => checkRedirect(wwwRoot, site) }
];

const results = await Promise.allSettled(checks.map((check) => check.run()));
const failures = results.flatMap((result, index) => result.status === "rejected"
  ? [`${checks[index].url} — ${result.reason.message}${result.reason.cause?.code ? ` (${result.reason.cause.code})` : ""}`]
  : []);

if (failures.length) {
  console.error("Production site health check failed:\n" + failures.join("\n"));
  process.exitCode = 1;
}
