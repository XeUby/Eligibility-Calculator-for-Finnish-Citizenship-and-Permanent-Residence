import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

export const issueTitle = "[Maintenance] Review Finnish residence rules and fees";
export const issueMarker = "<!-- finresidence-rules-review:v1 -->";
const managedEnd = "<!-- /finresidence-rules-review:v1 -->";
const locales = ["en", "fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"];
const dayMs = 86_400_000;

export function parseDate(value, field = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be a calendar date in YYYY-MM-DD format.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} is not a valid calendar date: ${value}`);
  }
  return date;
}

export function addCalendarMonths(value, months) {
  const date = parseDate(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const target = new Date(date);
  target.setUTCDate(1);
  target.setUTCFullYear(year, month, 1);
  const last = new Date(target);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  target.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()));
  return target.toISOString().slice(0, 10);
}

export function checkReview(metadata, asOf = new Date().toISOString().slice(0, 10)) {
  parseDate(asOf, "asOf");
  if (metadata?.schemaVersion !== 1 || metadata.reviewIntervalMonths !== 3 || !Array.isArray(metadata.checkpoints)) {
    throw new Error("Review metadata must use schemaVersion 1, a three-calendar-month interval and a checkpoints array.");
  }
  const last = parseDate(metadata.lastReviewed, "lastReviewed");
  parseDate(metadata.nextReview, "nextReview");
  if (metadata.lastReviewed > asOf) throw new Error("lastReviewed cannot be in the future.");
  const ids = new Set();
  const pending = [];
  for (const checkpoint of metadata.checkpoints) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(checkpoint.id ?? "") || ids.has(checkpoint.id)) {
      throw new Error("Each review checkpoint must have a unique, nonempty lowercase id.");
    }
    ids.add(checkpoint.id);
    if (typeof checkpoint.label !== "string" || !checkpoint.label.trim() || /[\r\n]/.test(checkpoint.label)) {
      throw new Error(`${checkpoint.id}: label must be a nonempty single line.`);
    }
    parseDate(checkpoint.reviewBy, `${checkpoint.id}.reviewBy`);
    parseDate(checkpoint.changeDate, `${checkpoint.id}.changeDate`);
    if (checkpoint.reviewBy >= checkpoint.changeDate) {
      throw new Error(`${checkpoint.id}: reviewBy must precede changeDate.`);
    }
    const source = new URL(checkpoint.source);
    if (source.protocol !== "https:" || source.hostname !== "migri.fi" || source.username || source.password) {
      throw new Error(`${checkpoint.id}: use an official HTTPS Migri source.`);
    }
    if (checkpoint.reviewedOn !== null) {
      parseDate(checkpoint.reviewedOn, `${checkpoint.id}.reviewedOn`);
      if (checkpoint.reviewedOn > metadata.lastReviewed) {
        throw new Error(`${checkpoint.id}: reviewedOn cannot be later than the recorded source review.`);
      }
    } else {
      pending.push(checkpoint);
    }
  }
  const quarterlyDue = addCalendarMonths(metadata.lastReviewed, metadata.reviewIntervalMonths);
  const nextReview = [quarterlyDue, ...pending.map((checkpoint) => checkpoint.reviewBy)].sort()[0];
  if (metadata.nextReview !== nextReview) {
    throw new Error(`nextReview is out of sync: expected ${nextReview}, got ${metadata.nextReview}. Update it only after a source review or checkpoint acknowledgement.`);
  }
  const due = [];
  if (asOf >= quarterlyDue) {
    due.push({ id: "quarterly", deadline: quarterlyDue, label: "Quarterly rules and fees source review" });
  }
  due.push(...pending.filter((checkpoint) => asOf >= checkpoint.reviewBy).map((checkpoint) => ({
    id: checkpoint.id, deadline: checkpoint.reviewBy, label: checkpoint.label,
    changeDate: checkpoint.changeDate, source: checkpoint.source,
  })));
  return {
    asOf, lastReviewed: metadata.lastReviewed, nextReview, quarterlyDue,
    reviewAgeDays: (parseDate(asOf).getTime() - last.getTime()) / dayMs,
    due: due.length > 0, reasons: due,
    // Deliberately exclude the run date, so daily runs do not edit the same issue.
    cycle: `${metadata.lastReviewed}:${due.map((item) => item.id).sort().join(",")}`,
  };
}

export function checkVisibleDates(lastReviewed, { readme, html, reviewRecord, i18nSource }) {
  const englishDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(parseDate(lastReviewed));
  for (const [name, content] of [["README.md", readme], ["docs/RULES_REVIEW.md", reviewRecord]]) {
    if (!content.includes(`Last reviewed: **${englishDate}**.`)) {
      throw new Error(`${name}: Last reviewed must match metadata (${englishDate}).`);
    }
  }
  const fallback = html.match(/<p\b[^>]*data-i18n="reviewed"[^>]*>([^<]*)<\/p>/)?.[1];
  if (!fallback?.includes(`Last reviewed: ${englishDate}.`)) {
    throw new Error(`docs/index.html: visible review date must match metadata (${englishDate}).`);
  }
  const window = {};
  runInNewContext(i18nSource, { window, Intl }, { timeout: 1_000, filename: "docs/i18n.js" });
  if (!window.i18n?.t("en", "reviewed")?.includes(`Last reviewed: ${englishDate}.`)) {
    throw new Error(`docs/i18n.js: English review date must match metadata (${englishDate}).`);
  }
  const actual = window.i18n.languages.map(({ code }) => code).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...locales].sort())) {
    throw new Error("Review metadata requires the site's complete set of ten languages.");
  }
  for (const locale of locales) {
    const copy = window.i18n.t(locale, "reviewed");
    if (typeof copy !== "string" || !copy.trim()) throw new Error(`${locale}: missing review-date copy.`);
  }
}

export function primarySources(reviewRecord) {
  const normalized = reviewRecord.replace(/\r\n?/g, "\n");
  const section = normalized.split("## Required primary sources\n")[1]?.split("\n## ")[0];
  if (!section) throw new Error("docs/RULES_REVIEW.md: missing required primary-source checklist.");
  const sources = [...section.matchAll(/^\d+\. (\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/gm)].map((match) => match[1]);
  if (sources.length < 9) throw new Error("The primary-source review checklist is incomplete.");
  return sources;
}

export function issueBody(status, sources) {
  return `${issueMarker}
<!-- review-cycle:${status.cycle} -->
## Source review due

The last completed source review was **${status.lastReviewed}**. Automated link checks confirm availability, not unchanged law or fees.

${status.reasons.map((reason) => `- **${reason.deadline}**: ${reason.label}${reason.changeDate ? ` (change/application date: ${reason.changeDate}; [official source](${reason.source}))` : ""}.`).join("\n")}

## Official-source checklist

${sources.map((source) => `- [ ] ${source}`).join("\n")}

## Required release checks

- [ ] Distinguish enacted law, entry into force, application cut-offs and proposals; review permit, trip and route exceptions against detailed current guidance.
- [ ] Verify electronic/paper application fees and YKI fees. Publish upcoming citizenship-test costs or booking details only after official publication.
- [ ] Update every affected sentence in all ten locales: en, fi, sv, ru, uk, ne, ar, so, et, hi; check dynamic results and mobile/RTL layout.
- [ ] Add or adjust Go boundary tests around effective/application dates, permit credit and trips; run Go checks and the Chromium/iPhone WebKit suite.
- [ ] Record sources, discrepancies, limitations and actual completion date in docs/RULES_REVIEW.md and README.md; synchronize visible dates in docs/index.html and docs/i18n.js.
- [ ] Manually update docs/rules-review.json lastReviewed and nextReview; set reviewedOn only for checkpoints actually reviewed (early reviews are allowed). Run npm run test:unit and npm run test:review.
- [ ] After publication, verify the public HTTPS/WASM calculation with Site health. Never advance dates just because an automated check passed.

Closing this issue alone does not acknowledge a source review. The next scheduled run reopens it while metadata still records a due review. No law, fee or review date is edited automatically.
${managedEnd}`;
}

export function mergeIssueBody(current, managed) {
  const start = current.indexOf(issueMarker);
  const end = current.indexOf(managedEnd, start);
  if (start < 0 || end < 0) throw new Error("Existing review issue has an incomplete managed section; repair it manually instead of overwriting notes.");
  const oldManaged = current.slice(start, end + managedEnd.length);
  const cycle = /<!-- review-cycle:([^>]+) -->/;
  if (oldManaged.match(cycle)?.[1] === managed.match(cycle)?.[1]) {
    const checked = new Set([...oldManaged.replace(/\r\n?/g, "\n").matchAll(/^- \[[xX]\] (.+)$/gm)].map((match) => match[1]));
    managed = managed.replace(/^- \[ \] (.+)$/gm, (line, text) => checked.has(text) ? `- [x] ${text}` : line);
  }
  if (oldManaged.replace(/\r\n?/g, "\n") === managed.replace(/\r\n?/g, "\n")) return current;
  return current.slice(0, start) + managed + current.slice(end + managedEnd.length);
}

export async function syncReviewIssue({ status, sources, repository, token, request = fetch }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !token) {
    throw new Error("Issue synchronization needs GITHUB_REPOSITORY (owner/repo) and the scoped GITHUB_TOKEN.");
  }
  const base = `https://api.github.com/repos/${repository}/issues`;
  async function api(url, method = "GET", body) {
    const response = await request(url, {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10", "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub issues ${method} failed: HTTP ${response.status}. Check repository Issues and workflow permissions; no token is logged.`);
    return response.json();
  }
  const matches = [];
  for (let page = 1; ; page++) {
    const issues = await api(`${base}?state=all&per_page=100&page=${page}`);
    if (!Array.isArray(issues)) throw new Error("GitHub returned an invalid issues list.");
    matches.push(...issues.filter((issue) => !issue.pull_request
      && issue.user?.login === "github-actions[bot]"
      && issue.body?.includes(issueMarker)));
    if (issues.length < 100) break;
  }
  if (matches.length > 1) throw new Error("Multiple managed review issues exist; reconcile them manually rather than creating more.");
  const existing = matches[0];
  if (!status.due) {
    if (existing?.state === "open") {
      await api(`${base}/${existing.number}`, "PATCH", { state: "closed", state_reason: "completed" });
      return { action: "closed", number: existing.number };
    }
    return { action: "none" };
  }
  const managed = issueBody(status, sources);
  if (!existing) {
    const created = await api(base, "POST", {
      title: issueTitle,
      body: `${managed}\n\n## Review notes\n\nRecord review evidence and unresolved questions here. Notes outside the managed section are preserved.\n`,
    });
    return { action: "created", number: created.number };
  }
  const body = mergeIssueBody(existing.body, managed);
  if (existing.state === "open" && existing.body === body) return { action: "unchanged", number: existing.number };
  await api(`${base}/${existing.number}`, "PATCH", {
    body, state: "open", ...(existing.state === "closed" ? { state_reason: "reopened" } : {}),
  });
  return { action: existing.state === "closed" ? "reopened" : "updated", number: existing.number };
}

export async function loadReview(root = ".", asOf) {
  const files = ["docs/rules-review.json", "README.md", "docs/index.html", "docs/RULES_REVIEW.md", "docs/i18n.js"];
  const [json, readme, html, reviewRecord, i18nSource] = await Promise.all(files.map((file) => readFile(resolve(root, file), "utf8")));
  const metadata = JSON.parse(json);
  const status = checkReview(metadata, asOf);
  checkVisibleDates(metadata.lastReviewed, { readme, html, reviewRecord, i18nSource });
  return { status, sources: primarySources(reviewRecord) };
}

async function main() {
  const args = process.argv.slice(2);
  let asOf;
  let issue = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--as-of" && args[index + 1]) asOf = args[++index];
    else if (args[index] === "--issue") issue = true;
    else throw new Error("Usage: node scripts/check-review.mjs [--as-of YYYY-MM-DD] [--issue]");
  }
  const { status, sources } = await loadReview(".", asOf);
  console.log(JSON.stringify(status, null, 2));
  if (issue) {
    const result = await syncReviewIssue({ status, sources, repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
    console.log(`Review issue: ${result.action}${result.number ? ` #${result.number}` : ""}`);
  }
  // Due reviews are maintenance reminders, not failed builds. Invalid metadata and API errors still fail.
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
