import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Mechanical export of the versioned vector source; no network, fonts or runtime dependency.
const root = new URL("../docs/", import.meta.url);
const source = await readFile(new URL("favicon.svg", root), "utf8");
const outputs = new Map([
  [48, "favicon-48.png"],
  [96, "favicon-96.png"],
  [180, "apple-touch-icon.png"],
  [192, "icon-192.png"],
  [512, "icon-512.png"],
]);
const browser = await chromium.launch();
const images = new Map();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, ...outputs.keys()]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${source}`);
    const png = await page.screenshot({ omitBackground: true, animations: "disabled" });
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    images.set(size, png);
    if (outputs.has(size)) await writeFile(new URL(outputs.get(size), root), png);
  }
} finally {
  await browser.close();
}

// PNG-in-ICO entries are supported by modern Windows browsers and retain alpha.
const icoSizes = [16, 32, 48];
const header = Buffer.alloc(6 + icoSizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  const png = images.get(size);
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(new URL("favicon.ico", root), Buffer.concat([header, ...icoSizes.map((size) => images.get(size))]));
console.log(`Exported ${outputs.size} PNG icons and 16/32/48px ICO to ${fileURLToPath(root)}`);
