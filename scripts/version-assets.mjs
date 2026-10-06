import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const references = [
  ["i18n.js", /(<script\b[^>]*\s+src=["'])i18n\.js([^"']*)(["'])/g],
  ["wasm_exec.js", /(<script\b[^>]*\s+src=["'])wasm_exec\.js([^"']*)(["'])/g],
  ["main.wasm", /(\bfetch\(["'])main\.wasm([^"']*)(["'])/g]
];

export function versionHtml(html, files) {
  if (typeof html !== "string") throw new TypeError("Asset versioning needs HTML text.");
  let result = html;
  for (const [file, expression] of references) {
    const bytes = files?.[file];
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new TypeError(`Asset ${file} must have nonempty binary content.`);
    }
    const matches = [...html.matchAll(expression)];
    if (matches.length !== 1) throw new Error(`Expected exactly one supported ${file} reference, found ${matches.length}.`);
    const suffix = matches[0][2];
    if (suffix !== "" && !/^\?v=(?:[a-f0-9]{16}|[a-f0-9]{64})$/.test(suffix)) {
      throw new Error(`Unsupported query or suffix for ${file}.`);
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    result = result.replace(expression, (_, before, _suffix, after) => `${before}${file}?v=${hash}${after}`);
  }
  return result;
}

export async function stampDocs(root = "docs", { check = false } = {}) {
  const names = references.map(([file]) => file);
  const [html, ...assets] = await Promise.all([
    readFile(resolve(root, "index.html"), "utf8"),
    ...names.map((file) => readFile(resolve(root, file)))
  ]);
  const files = Object.fromEntries(names.map((file, index) => [file, assets[index]]));
  const versioned = versionHtml(html, files);
  const changed = html !== versioned;
  if (check && changed) throw new Error("Asset versions do not match the built files. Run npm run build:assets after building WASM and copying its matching Go runtime.");
  if (changed && !check) await writeFile(resolve(root, "index.html"), versioned);
  return { changed, hashes: Object.fromEntries(names.map((file) => [file, createHash("sha256").update(files[file]).digest("hex")])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    console.error("Usage: node scripts/version-assets.mjs [--check]");
    process.exitCode = 1;
  } else {
    stampDocs("docs", { check: args[0] === "--check" })
      .then(({ changed }) => console.log(changed ? "Versioned scripts and WASM from their built content." : "Script and WASM versions match their content."))
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
