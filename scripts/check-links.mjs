import { execFile } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const sourceFiles = ["docs/index.html", "docs/RULES_REVIEW.md"];
const urlPattern = /https?:\/\/[^\s"'<>)]+/g;
const ownHostnames = new Set(["finresidence.fi", "www.finresidence.fi"]);
const execFileAsync = promisify(execFile);
const perHost = 2;
const transientHttp = new Set([408, 429, 500, 502, 503, 504]);
const transientCurl = new Set([5, 6, 7, 18, 28, 52, 55, 56, 92]);
const success = (status) => status >= 200 && status < 300;

async function requestWithCurl(url, method) {
  const args = [
    "--disable", "--location", "--max-redirs", "5", "--max-time", "15",
    "--proto", "=http,https", "--proto-redir", "=http,https", "--globoff",
    "--silent", "--show-error", "--output", process.platform === "win32" ? "NUL" : "/dev/null",
    "--user-agent", "FinResidence-link-check/1.0 (+https://github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence)",
    "--write-out", "%{http_code}\n%{url_effective}\n%header{retry-after}",
  ];
  if (method === "HEAD") args.push("--head");
  const { stdout } = await execFileAsync("curl", [...args, "--", url]);
  const [code, finalUrl, retryAfter] = stdout.split(/\r?\n/);
  if (!/^\d{3}$/.test(code) || !URL.canParse(finalUrl)) {
    throw new Error("curl did not report a valid response");
  }
  return { status: Number(code), finalUrl, retryAfter };
}

function retryDelay(retryAfter, now) {
  const value = retryAfter?.trim();
  const requested = !value ? NaN
    : /^\d+$/.test(value) ? Number(value) * 1_000
    : Date.parse(value) - now();
  if (requested > 5_000) return null;
  return Math.max(1_000, Number.isFinite(requested) ? requested : 0);
}

async function check(url, request, wait, now) {
  const attempt = async (method) => {
    try {
      return await request(url, method);
    } catch (error) {
      return { error };
    }
  };
  let response = await attempt("HEAD");
  const headDelay = transientHttp.has(response.status) && response.retryAfter?.trim()
    ? retryDelay(response.retryAfter, now) : 0;
  if (!success(response.status) && headDelay !== null) {
    if (headDelay) await wait(headDelay);
    response = await attempt("GET");
    if (transientHttp.has(response.status) || transientCurl.has(response.error?.code)) {
      const delay = retryDelay(response.retryAfter, now);
      if (delay !== null) {
        await wait(delay);
        response = await attempt("GET");
      }
    }
  }

  const { status, finalUrl, error } = response;
  if (error) {
    return { url, outcome: "unverified", reason: error.code ? `curl error ${error.code}` : "no valid response" };
  }
  return {
    url, status, finalUrl,
    outcome: success(status) ? "ok" : [404, 410].includes(status) ? "broken" : "unverified",
  };
}

export async function checkLinks(urls, { request = requestWithCurl, wait = sleep, now = Date.now } = {}) {
  const groups = new Map();
  urls.forEach((url, index) => {
    const host = new URL(url).hostname;
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push({ url, index });
  });

  const results = new Array(urls.length);
  await Promise.all([...groups.values()].flatMap((group) => (
    Array.from({ length: Math.min(perHost, group.length) }, async (_, worker) => {
      for (let i = worker; i < group.length; i += perHost) {
        const { url, index } = group[i];
        results[index] = await check(url, request, wait, now);
      }
    })
  )));
  return results;
}

function isMigriUrl(url) {
  return URL.canParse(url) && new URL(url).origin === "https://migri.fi";
}

export function summarizeResults(results, { githubRunner = false } = {}) {
  const ok = results.filter(({ outcome }) => outcome === "ok");
  const broken = results.filter(({ outcome }) => outcome === "broken");
  const unverified = results.filter(({ outcome }) => outcome === "unverified");
  const migri = results.filter(({ url }) => isMigriUrl(url));
  // Host-wide access denial is not proof that any individual URL is valid.
  const hostBlocked = githubRunner && new Set(migri.map(({ url }) => url)).size >= 2
    && migri.every(({ status, finalUrl, outcome }) => (
      outcome === "unverified" && status === 403 && isMigriUrl(finalUrl)
    ));
  const warningOnly = hostBlocked ? migri : [];
  const warnings = new Set(warningOnly);
  const failed = results.filter((result) => result.outcome !== "ok" && !warnings.has(result));
  return { ok, broken, unverified, warningOnly, failed };
}

async function main(args) {
  const githubRunner = args.length === 1 && args[0] === "--github-runner" && process.env.GITHUB_ACTIONS === "true";
  if (args.length && !githubRunner) throw new Error("Usage: node scripts/check-links.mjs [--github-runner (GitHub Actions only)]");

  const contents = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));
  const urls = [...new Set(contents
    .flatMap((content) => content.match(urlPattern) ?? [])
    .filter((url) => url !== "http://www.w3.org/2000/svg" && !ownHostnames.has(new URL(url).hostname)))].sort();
  if (!urls.length) throw new Error("No external source URLs were found.");

  const results = await checkLinks(urls);
  const { ok, broken, unverified, warningOnly, failed } = summarizeResults(results, { githubRunner });
  for (const { url, outcome, status, reason } of results) {
    console.log(`${outcome.toUpperCase()} ${status ? `HTTP ${status}` : reason} ${url}`);
  }
  const counts = `${ok.length} verified, ${broken.length} broken, ${unverified.length} unverified.`;
  console.log(counts);
  const note = warningOnly.length
    ? `All ${warningOnly.length} Migri links returned HTTP 403 from GitHub Actions. They remain unverified; run npm run test:links from a network that can access Migri.`
    : "";
  if (note) console.log(`::warning title=Migri links could not be verified::${note}`);
  if (githubRunner && process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Link check\n\n${counts}\n${note ? `\n> ${note}\n` : ""}`);
  }
  if (failed.length) {
    console.error(`${failed.length} broken or unverified link(s) require attention; see the URL results above.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
