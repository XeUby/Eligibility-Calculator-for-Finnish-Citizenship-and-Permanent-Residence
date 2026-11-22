import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const asset = (name) => readFileSync(new URL(`../docs/${name}`, import.meta.url));
const pngSize = (buffer) => {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
};

test("brand PNGs have the declared search, Apple and installable icon dimensions", () => {
  for (const [name, size] of [
    ["favicon-48.png", 48], ["favicon-96.png", 96],
    ["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512],
  ]) {
    assert.deepEqual(pngSize(asset(name)), [size, size], name);
  }
});

test("the scalable brand icon is self-contained and the ICO has usable fallback sizes", () => {
  const svg = asset("favicon.svg").toString("utf8");
  assert.match(svg, /<svg\b[^>]*viewBox=["']0 0 \d+ \d+["']/);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|(?:href|src)\s*=\s*["'](?:https?:|\/\/)|@import/i);
  const ico = asset("favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  assert.ok(count > 0 && count < 16);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const start = 6 + i * 16;
    const width = ico[start] || 256;
    const height = ico[start + 1] || 256;
    assert.equal(width, height);
    const length = ico.readUInt32LE(start + 8);
    const offset = ico.readUInt32LE(start + 12);
    assert.ok(length > 0 && offset >= 6 + count * 16 && offset + length <= ico.length);
    sizes.push(width);
  }
  for (const size of [16, 32, 48]) assert.ok(sizes.includes(size), `ICO contains ${size}px`);
});

test("manifest icon paths stay portable and declared raster sizes match their files", () => {
  const manifest = JSON.parse(asset("site.webmanifest").toString("utf8"));
  assert.equal(manifest.short_name, "FinResidence");
  assert.equal(manifest.start_url, "./");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(({ sizes, type }) => sizes === `${size}x${size}` && type === "image/png");
    assert.ok(icon, `manifest includes a ${size}px PNG`);
    assert.doesNotMatch(icon.src, /^(?:\/|https?:)|\.\./);
    assert.deepEqual(pngSize(asset(icon.src)), [size, size]);
  }
});
