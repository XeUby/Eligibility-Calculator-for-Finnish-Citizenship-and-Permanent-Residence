import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  addCalendarMonths, checkReview, checkVisibleDates, issueBody, issueMarker,
  issueTitle, loadReview, mergeIssueBody, parseDate, primarySources, syncReviewIssue,
} from "./check-review.mjs";

const repository = "XeUby/example";
const token = "synthetic-token-never-log";
const source = "https://migri.fi/en/permanent-residence-permit";
const sources = Array.from({ length: 9 }, (_, index) => `[Official source ${index + 1}](${source})`);
const metadata = () => ({
  schemaVersion: 1, lastReviewed: "2026-10-05", reviewIntervalMonths: 3, nextReview: "2026-12-15",
  checkpoints: [
    { id: "citizenship-entry", label: "Entry-into-force review", reviewBy: "2026-12-15", changeDate: "2027-01-01", reviewedOn: null, source },
    { id: "citizenship-applications", label: "Application cut-off review", reviewBy: "2027-02-15", changeDate: "2027-03-01", reviewedOn: null, source },
  ],
});
const dueStatus = () => checkReview(metadata(), "2026-12-15");
const botIssue = (body = issueBody(dueStatus(), sources), state = "open") => ({
  number: 21, title: issueTitle, user: { login: "github-actions[bot]" }, body, state,
});

function mockGitHub(initial = []) {
  const issues = structuredClone(initial);
  const writes = [];
  const calls = [];
  return {
    issues, writes, calls,
    request: async (url, options) => {
      calls.push({ url, ...options });
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      let body;
      if (options.method === "GET") {
        const page = Number(new URL(url).searchParams.get("page"));
        body = issues.slice((page - 1) * 100, page * 100);
      } else {
        const data = JSON.parse(options.body);
        writes.push({ method: options.method, data });
        if (options.method === "POST") {
          body = { number: 22, ...data, user: { login: "github-actions[bot]" }, state: "open" };
          issues.push(body);
        } else {
          const number = Number(new URL(url).pathname.split("/").at(-1));
          body = issues.find((item) => item.number === number);
          Object.assign(body, data);
        }
      }
      return { ok: true, status: 200, json: async () => structuredClone(body) };
    },
  };
}

const sync = (status, mock) => syncReviewIssue({ status, sources, repository, token, request: mock.request });

test("strict date parsing rejects rollovers, non-ISO values and timestamps", () => {
  assert.equal(parseDate("2028-02-29").toISOString(), "2028-02-29T00:00:00.000Z");
  for (const invalid of [undefined, 20261005, "", "2026-2-05", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-10-00", "2026-10-05T00:00:00Z", "2026-10-05\n"]) {
    assert.throws(() => parseDate(invalid), /date/i, String(invalid));
  }
});

test("quarterly arithmetic uses calendar months and clamps short months", () => {
  assert.equal(addCalendarMonths("2026-10-05", 3), "2027-01-05");
  assert.equal(addCalendarMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addCalendarMonths("2027-11-30", 3), "2028-02-29");
  assert.equal(addCalendarMonths("2028-02-29", 3), "2028-05-29");
});

test("review is healthy before the exact first checkpoint", () => {
  const status = checkReview(metadata(), "2026-12-14");
  assert.equal(status.due, false);
  assert.equal(status.nextReview, "2026-12-15");
  assert.equal(status.quarterlyDue, "2027-01-05");
  assert.equal(status.reviewAgeDays, 70);
});

test("first checkpoint is due on its exact date, before 2027", () => {
  const status = dueStatus();
  assert.equal(status.due, true);
  assert.deepEqual(status.reasons.map(({ id }) => id), ["citizenship-entry"]);
  assert.equal(status.reasons[0].changeDate, "2027-01-01");
});

test("quarterly and application deadlines have inclusive date boundaries", () => {
  assert.deepEqual(checkReview(metadata(), "2027-01-04").reasons.map(({ id }) => id), ["citizenship-entry"]);
  assert.deepEqual(checkReview(metadata(), "2027-01-05").reasons.map(({ id }) => id), ["quarterly", "citizenship-entry"]);
  assert.equal(checkReview(metadata(), "2027-02-14").reasons.length, 2);
  assert.equal(checkReview(metadata(), "2027-02-15").reasons.length, 3);
});

test("early explicit review acknowledgement resolves a checkpoint", () => {
  const record = metadata();
  record.lastReviewed = "2026-12-10";
  record.checkpoints[0].reviewedOn = "2026-12-10";
  record.nextReview = "2027-02-15";
  const status = checkReview(record, "2026-12-16");
  assert.equal(status.due, false);
  assert.equal(status.quarterlyDue, "2027-03-10");
  assert.equal(status.nextReview, "2027-02-15");
});

test("advancing a general review does not silently acknowledge a checkpoint", () => {
  const record = metadata();
  record.lastReviewed = "2026-12-16";
  assert.equal(checkReview(record, "2026-12-16").due, true);
});

test("completed checkpoints never reopen merely because their dates pass", () => {
  const record = metadata();
  record.lastReviewed = "2027-02-10";
  record.checkpoints[0].reviewedOn = "2026-12-10";
  record.checkpoints[1].reviewedOn = "2027-02-10";
  record.nextReview = "2027-05-10";
  assert.equal(checkReview(record, "2027-03-01").due, false);
  assert.deepEqual(checkReview(record, "2027-05-10").reasons.map(({ id }) => id), ["quarterly"]);
});

test("review age is unaffected by DST transitions and leap days", () => {
  for (const [last, asOf, age] of [["2026-03-28", "2026-03-30", 2], ["2026-10-24", "2026-10-26", 2], ["2028-02-28", "2028-03-01", 2]]) {
    const record = { schemaVersion: 1, lastReviewed: last, reviewIntervalMonths: 3, nextReview: addCalendarMonths(last, 3), checkpoints: [] };
    assert.equal(checkReview(record, asOf).reviewAgeDays, age);
  }
});

test("invalid/future dates and inconsistent metadata fail closed", () => {
  assert.throws(() => checkReview(metadata(), "2026-10-04"), /future/);
  assert.throws(() => checkReview(metadata(), "not-a-date"), /calendar date/);
  for (const mutate of [
    (record) => { record.schemaVersion = 2; },
    (record) => { record.reviewIntervalMonths = 90; },
    (record) => { record.lastReviewed = "2026-02-30"; },
    (record) => { record.nextReview = "2027-01-05"; },
    (record) => { record.checkpoints[0].reviewBy = "2027-01-01"; },
    (record) => { record.checkpoints[0].reviewedOn = "2026-10-06"; },
    (record) => { record.checkpoints[0].reviewedOn = "2026-02-29"; },
    (record) => { record.checkpoints[0].label = "unsafe\nheading"; },
    (record) => { record.checkpoints[0].source = "https://example.com/migri"; },
    (record) => { record.checkpoints[0].source = "http://migri.fi/en"; },
    (record) => { record.checkpoints[0].id = record.checkpoints[1].id; },
  ]) {
    const record = metadata();
    mutate(record);
    assert.throws(() => checkReview(record, "2026-10-06"));
  }
});

function visibleFixture() {
  const date = "5 October 2026";
  return {
    readme: `Last reviewed: **${date}**.`, reviewRecord: `Last reviewed: **${date}**.`,
    html: `<p class="help" data-i18n="reviewed">Rules and fees can change. Last reviewed: ${date}.</p>`,
    i18nSource: `window.i18n = {languages: ${JSON.stringify(["en", "fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"].map((code) => ({ code })))}, t: () => "Last reviewed: ${date}."};`,
  };
}

test("visible review dates must match the machine-readable manual record", () => {
  const content = visibleFixture();
  assert.doesNotThrow(() => checkVisibleDates("2026-10-05", content));
  for (const key of Object.keys(content)) {
    assert.throws(() => checkVisibleDates("2026-10-05", { ...content, [key]: content[key].replaceAll("5 October", "6 October") }), /match metadata/);
  }
});

test("primary source checklist is required and extracted without network access", () => {
  const record = `# Record\n\n## Required primary sources\n\n${sources.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n## Next section\n`;
  assert.deepEqual(primarySources(record), sources);
  assert.deepEqual(primarySources(record.replaceAll("\n", "\r\n")), sources);
  assert.throws(() => primarySources("No source section"), /missing/);
  assert.throws(() => primarySources("## Required primary sources\n\n1. [Source](https://migri.fi)\n"), /incomplete/);
});

test("real repository metadata and all visible canonical dates agree", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const record = JSON.parse(await readFile(new URL("../docs/rules-review.json", import.meta.url), "utf8"));
  const result = await loadReview(root, record.lastReviewed);
  assert.equal(result.status.lastReviewed, record.lastReviewed);
  assert.equal(result.status.nextReview, record.nextReview);
  assert.equal(result.status.reviewAgeDays, 0);
  assert.equal(result.sources.length, 9);
});

test("same review cycle preserves checkboxes and user notes", () => {
  const managed = issueBody(dueStatus(), sources);
  const current = `User introduction\n${managed.replace("- [ ] [Official source 1]", "- [x] [Official source 1]")}\n\nUser evidence: source confirmed.`;
  const merged = mergeIssueBody(current, managed);
  assert.equal(merged, current);
  assert.match(merged, /User evidence: source confirmed/);
});

test("CRLF managed bodies retain checkbox progress and surrounding notes without an edit", () => {
  const managed = issueBody(dueStatus(), sources);
  const current = `User notes before\n${managed.replace("- [ ] [Official source 1]", "- [x] [Official source 1]")}\nUser notes after\n`.replaceAll("\n", "\r\n");
  assert.equal(mergeIssueBody(current, managed), current);
});

test("a new review cycle resets tasks but preserves user evidence", () => {
  const current = `${issueBody(dueStatus(), sources).replaceAll("- [ ]", "- [x]")}\n\nUser evidence stays.`;
  const next = issueBody(checkReview(metadata(), "2027-01-05"), sources);
  const merged = mergeIssueBody(current, next);
  assert.match(merged, /- \[ \] \[Official source 1\]/);
  assert.match(merged, /User evidence stays/);
});

test("incomplete managed issue sections never overwrite manual notes", () => {
  assert.throws(() => mergeIssueBody(`${issueMarker}\nManual evidence`, issueBody(dueStatus(), sources)), /repair it manually/);
});

test("healthy state creates no issue and requires no mutation", async () => {
  const mock = mockGitHub();
  assert.deepEqual(await sync(checkReview(metadata(), "2026-10-06"), mock), { action: "none" });
  assert.equal(mock.writes.length, 0);
});

test("due state creates one bot issue; later unchanged days make no writes", async () => {
  const mock = mockGitHub();
  assert.equal((await sync(dueStatus(), mock)).action, "created");
  assert.equal((await sync(checkReview(metadata(), "2026-12-16"), mock)).action, "unchanged");
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0].method, "POST");
  assert.match(mock.writes[0].data.body, /all ten locales/);
});

test("renaming the bot's issue never creates a duplicate or resets its title", async () => {
  const mock = mockGitHub([{ ...botIssue(), title: "Boris's custom review title" }]);
  assert.equal((await sync(dueStatus(), mock)).action, "unchanged");
  assert.equal(mock.writes.length, 0);
});

test("checked task progress and notes remain untouched by repeated due runs", async () => {
  const current = `${issueBody(dueStatus(), sources).replace("- [ ] [Official source 1]", "- [x] [Official source 1]")}\n\nManual review notes.`;
  const mock = mockGitHub([botIssue(current)]);
  assert.equal((await sync(dueStatus(), mock)).action, "unchanged");
  assert.equal((await sync(checkReview(metadata(), "2026-12-16"), mock)).action, "unchanged");
  assert.equal(mock.writes.length, 0);
  assert.equal(mock.issues[0].body, current);
});

test("a prematurely closed issue is reopened rather than duplicated", async () => {
  const mock = mockGitHub([botIssue(undefined, "closed")]);
  assert.deepEqual(await sync(dueStatus(), mock), { action: "reopened", number: 21 });
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0].method, "PATCH");
});

test("recorded completed review closes only the managed bot issue", async () => {
  const record = metadata();
  record.lastReviewed = "2026-12-10";
  record.checkpoints[0].reviewedOn = "2026-12-10";
  record.nextReview = "2027-02-15";
  const mock = mockGitHub([botIssue(), { number: 99, state: "open", title: "User bug", body: "Do not touch me" }]);
  assert.deepEqual(await sync(checkReview(record, "2026-12-16"), mock), { action: "closed", number: 21 });
  assert.equal(mock.issues[1].state, "open");
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0].data.state, "closed");
});

test("lookalike user issues and pull requests are never edited", async () => {
  const mock = mockGitHub([
    { ...botIssue(), number: 98, user: { login: "Boris" } },
    { ...botIssue(), number: 99, pull_request: {} },
  ]);
  assert.equal((await sync(dueStatus(), mock)).action, "created");
  assert.equal(mock.writes[0].method, "POST");
});

test("pagination finds the closed issue beyond the first page", async () => {
  const ordinary = Array.from({ length: 100 }, (_, index) => ({ number: 100 + index, title: `Other ${index}`, state: "closed" }));
  const mock = mockGitHub([...ordinary, botIssue(undefined, "closed")]);
  assert.equal((await sync(dueStatus(), mock)).action, "reopened");
  assert.equal(mock.calls.filter(({ method }) => method === "GET").length, 2);
});

test("duplicate managed issues require manual reconciliation instead of more writes", async () => {
  const mock = mockGitHub([botIssue(), { ...botIssue(), number: 22 }]);
  await assert.rejects(sync(dueStatus(), mock), /Multiple managed/);
  assert.equal(mock.writes.length, 0);
});

test("API failures are surfaced without disclosing the token", async () => {
  const request = async () => ({ ok: false, status: 403 });
  await assert.rejects(syncReviewIssue({ status: dueStatus(), sources, repository, token, request }), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.equal(error.message.includes(token), false);
    return true;
  });
});

test("invalid repository or absent token fails before any API request", async () => {
  const mock = mockGitHub();
  for (const values of [{ repository: "owner/repo?redirect=other", token }, { repository, token: "" }]) {
    await assert.rejects(syncReviewIssue({ status: dueStatus(), sources, ...values, request: mock.request }), /scoped GITHUB_TOKEN/);
  }
  assert.equal(mock.calls.length, 0);
});
