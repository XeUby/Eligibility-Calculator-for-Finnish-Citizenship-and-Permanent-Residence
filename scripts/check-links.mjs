import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const sourceFiles = ["docs/index.html", "docs/RULES_REVIEW.md"];
const urlPattern = /https?:\/\/[^\s"'<>)]+/g;
const timeoutMs = 15_000;
const execFileAsync = promisify(execFile);

const contents = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));
const urls = [...new Set(contents.flatMap((content) => content.match(urlPattern) ?? []))].sort();

if (!urls.length) {
  throw new Error("No external source URLs were found.");
}

async function request(url, method) {
  const args = ["--location", "--fail", "--silent", "--show-error", "--max-time", String(timeoutMs / 1_000), "--user-agent", "FEE.fi-link-check/1.0 (+https://github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence)", "--write-out", "%{http_code}"];
  if (method === "HEAD") args.push("--head");
  else args.push("--output", process.platform === "win32" ? "NUL" : "/dev/null");
  args.push(url);
  const { stdout } = await execFileAsync("curl", args);
  const match = stdout.match(/(\d{3})\s*$/);
  if (!match) throw new Error("curl did not return an HTTP status");
  return Number.parseInt(match[1], 10);
}

async function check(url) {
  let status;
  try {
    status = await request(url, "HEAD");
  } catch (_) {
    status = await request(url, "GET");
  }
  if (status < 200 || status >= 400) {
    throw new Error(`HTTP ${status}`);
  }
  return { url, status };
}

const settled = await Promise.allSettled(urls.map(check));
const failures = settled.flatMap((result, index) => result.status === "rejected" ? [`${urls[index]} — ${result.reason.message}`] : []);

for (const result of settled) {
  if (result.status === "fulfilled") console.log(`OK ${result.value.status} ${result.value.url}`);
}
if (failures.length) {
  console.error("Broken or inaccessible links:\n" + failures.join("\n"));
  process.exitCode = 1;
}
