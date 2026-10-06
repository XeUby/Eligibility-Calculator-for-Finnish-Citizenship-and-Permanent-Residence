import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { versionHtml } from "./version-assets.mjs";

const assets = ["i18n.js", "wasm_exec.js", "main.wasm"];
const html = `<!doctype html>
<html lang="en"><head><script src="wasm_exec.js"></script></head><body>
<p>Suomi — Українська — नेपाली</p>
<script src="i18n.js"></script>
<script>const response = await fetch("main.wasm", { cache: "no-store" });</script>
</body></html>`;
const fixture = () => ({
  "i18n.js": Buffer.from("window.i18n = { version: 'new translations' };", "utf8"),
  "wasm_exec.js": Buffer.from("/* matching Go WebAssembly runtime */", "utf8"),
  "main.wasm": Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function expectedHtml(source, files) {
  let expected = source;
  for (const asset of assets) expected = expected.replaceAll(`"${asset}"`, `"${asset}?v=${hash(files[asset])}"`);
  return expected;
}

test("critical asset URLs use the complete independent SHA-256 of their bytes", () => {
  const files = fixture();
  const actual = versionHtml(html, files);
  assert.equal(actual, expectedHtml(html, files));
  for (const asset of assets) assert.equal(actual.split(`${asset}?v=${hash(files[asset])}`).length - 1, 1);
});

test("content hashes and HTML output are deterministic and stamping is idempotent", () => {
  const files = fixture();
  const first = versionHtml(html, files);
  assert.equal(versionHtml(html, fixture()), first);
  assert.equal(versionHtml(first, files), first);
});

test("changing each file independently changes only that file's URL", () => {
  const files = fixture();
  const first = versionHtml(html, files);
  for (const asset of assets) {
    const changed = { ...files, [asset]: Buffer.concat([files[asset], Buffer.from([255])]) };
    const result = versionHtml(first, changed);
    assert.notEqual(result, first);
    assert.ok(result.includes(`${asset}?v=${hash(changed[asset])}`));
    for (const unaffected of assets.filter((name) => name !== asset)) {
      assert.ok(result.includes(`${unaffected}?v=${hash(files[unaffected])}`));
    }
  }
});

test("previous supported 16-hex versions are replaced rather than appended", () => {
  const old = html.replaceAll("wasm_exec.js", "wasm_exec.js?v=0123456789abcdef")
    .replaceAll("i18n.js", "i18n.js?v=fedcba9876543210")
    .replaceAll("main.wasm", "main.wasm?v=aaaaaaaaaaaaaaaa");
  assert.equal(versionHtml(old, fixture()), versionHtml(html, fixture()));
});

test("previous supported full-length versions are replaced with current content", () => {
  let old = html;
  for (const asset of assets) old = old.replaceAll(asset, `${asset}?v=${"a".repeat(64)}`);
  assert.equal(versionHtml(old, fixture()), versionHtml(html, fixture()));
});

test("single-quoted critical script/fetch references are supported", () => {
  const single = html.replaceAll('"wasm_exec.js"', "'wasm_exec.js'")
    .replaceAll('"i18n.js"', "'i18n.js'")
    .replaceAll('"main.wasm"', "'main.wasm'");
  const actual = versionHtml(single, fixture());
  for (const asset of assets) assert.ok(actual.includes(`'${asset}?v=${hash(fixture()[asset])}'`));
  assert.equal(versionHtml(actual, fixture()), actual);
});

test("UTF-8 text and CRLF line endings are preserved outside critical references", () => {
  const crlf = html.replaceAll("\n", "\r\n");
  const actual = versionHtml(crlf, fixture());
  assert.equal(actual, expectedHtml(crlf, fixture()));
  assert.match(actual, /Українська — नेपाली/);
  assert.equal(actual.split("\r\n").length, crlf.split("\r\n").length);
});

test("unrelated assets and URLs are left untouched", () => {
  const extras = '<link href="favicon.svg"><img src="logo.svg"><a href="https://migri.fi">Migri</a>';
  const actual = versionHtml(html.replace("</body>", `${extras}</body>`), fixture());
  assert.ok(actual.includes(extras));
});

test("a missing critical reference is rejected for every asset", () => {
  for (const asset of assets) assert.throws(() => versionHtml(html.replace(asset, `absent-${asset}`), fixture()), undefined, asset);
});

test("duplicate critical script or fetch references are rejected", () => {
  for (const asset of assets) {
    const extra = asset === "main.wasm" ? `<script>fetch("${asset}")</script>` : `<script src="${asset}"></script>`;
    assert.throws(() => versionHtml(`${html}\n${extra}`, fixture()), undefined, asset);
  }
});

test("data-src is not mistaken for an actual critical script src", () => {
  for (const asset of ["i18n.js", "wasm_exec.js"]) {
    const ghost = html.replace(`src="${asset}"`, `data-src="${asset}"`);
    assert.throws(() => versionHtml(ghost, fixture()), undefined, asset);
  }
});

test("a supported reference plus an unsupported-query duplicate is rejected", () => {
  for (const asset of assets) {
    const invalid = `${asset}?v=not-a-content-hash`;
    const extra = asset === "main.wasm" ? `<script>fetch("${invalid}")</script>` : `<script src="${invalid}"></script>`;
    assert.throws(() => versionHtml(`${html}\n${extra}`, fixture()), undefined, asset);
  }
});

test("unsupported or ambiguous query strings are rejected instead of silently preserved", () => {
  for (const asset of assets) {
    for (const suffix of ["?v=1234", "?v=0123456789ABCDEF", "?v=0123456789abcdef&lang=fi", "?cache=old", "?v=", "?v=" + "a".repeat(63), "#old"]) {
      assert.throws(() => versionHtml(html.replace(asset, `${asset}${suffix}`), fixture()), undefined, `${asset}${suffix}`);
    }
  }
});

test("asset contents must be provided as nonempty Buffer or Uint8Array values", () => {
  for (const asset of assets) {
    for (const invalid of [undefined, null, "text", [], {}, Buffer.alloc(0), new Uint8Array(0)]) {
      const files = fixture();
      files[asset] = invalid;
      assert.throws(() => versionHtml(html, files), undefined, `${asset}: ${String(invalid)}`);
    }
  }
});

test("Uint8Array byte views hash only their exact visible byte range", () => {
  const files = fixture();
  const backing = new Uint8Array([99, 0, 97, 115, 109, 1, 0, 0, 0, 88]);
  files["main.wasm"] = backing.subarray(1, 9);
  assert.equal(versionHtml(html, files), versionHtml(html, fixture()));
});

test("versioning never mutates input bytes and recomputes after same-buffer changes", () => {
  const files = fixture();
  const before = Object.fromEntries(assets.map((asset) => [asset, Buffer.from(files[asset])]));
  const first = versionHtml(html, files);
  for (const asset of assets) assert.deepEqual(files[asset], before[asset]);
  files["i18n.js"][0] ^= 1;
  const second = versionHtml(first, files);
  assert.notEqual(second, first);
  assert.ok(second.includes(`i18n.js?v=${hash(files["i18n.js"])}`));
  assert.ok(!second.includes(`i18n.js?v=${hash(before["i18n.js"])}`));
  assert.equal(versionHtml(second, files), second);
});
