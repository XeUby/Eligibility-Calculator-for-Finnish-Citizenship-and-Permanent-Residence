import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../docs/index.html", import.meta.url), "utf8");
const context = { window: {} };
runInNewContext(readFileSync(new URL("../docs/i18n.js", import.meta.url), "utf8"), context);
const i18n = context.window.i18n;
const locales = ["en", "fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"];
const keys = [
  "civicUpdateTitle", "civicScope", "civicWhenTitle", "civicWhenBody",
  "civicAlternativesBody", "civicYkiBody", "civicDeclarationBody",
  "civicFormatTitle", "civicFormatBody", "civicPreparationTitle", "civicPreparationBody",
  "civicSessionsTitle", "civicSessionsBody", "civicSupportTitle", "civicSupportBody",
  "civicSummaryLink", "upcomingText", "costCivicNote",
];
const english = (key) => i18n.t("en", key);
const normalizeDigits = (value) => value.replace(/[०-९٠-٩]/g, (digit) => {
  const code = digit.codePointAt(0);
  return String(code >= 0x966 ? code - 0x966 : code - 0x660);
});
const hasNumber = (text, value) => new RegExp(`(?<![0-9])${value}(?![0-9])`).test(normalizeDigits(text));

test("the dated civic update has real translations for all ten supported languages", () => {
  assert.deepEqual(Array.from(i18n.languages, ({ code }) => code), locales);
  for (const locale of locales) {
    for (const key of keys) {
      const text = i18n.t(locale, key);
      assert.equal(typeof text, "string", `${locale}: ${key} must exist`);
      assert.ok(text.trim().length > 0, `${locale}: ${key} must not be empty`);
      if (locale !== "en") assert.notEqual(text, english(key), `${locale}: ${key} must not fall back to English`);
      assert.ok(html.includes(`data-i18n="${key}"`), `${key} must actually be used by the website`);
    }
    for (const value of [1, 28, 2027, 18, 64]) {
      assert.ok(hasNumber(i18n.t(locale, "civicWhenBody"), value), `${locale}: retain statutory timing/age ${value}`);
    }
    for (const value of [6, 10, 2027]) {
      assert.ok(hasNumber(i18n.t(locale, "civicSessionsBody"), value), `${locale}: retain national-session count/year ${value}`);
    }
    assert.match(i18n.t(locale, "civicYkiBody"), /YKI/, `${locale}: keep YKI separate from the civic test`);
    assert.doesNotMatch(i18n.t(locale, "civicFormatBody"), /€\s*\d|\d\s*€/, `${locale}: do not invent a test price`);
  }
});

test("entry into force is not confused with the application cut-off or transition", () => {
  const when = english("civicWhenBody");
  assert.match(when, /take effect on 1 January 2027/);
  assert.match(when, /transition through 28 February/);
  assert.match(when, /applications submitted from 1 March 2027/);
  assert.match(when, /aged 18[–-]64/);
  assert.match(when, /pass the test before submitting your application/);
  assert.match(english("civicUpdateTitle"), /9 October 2026/);
  assert.match(english("civicScope"), /residence time only.*does not assess civic knowledge/);
});

test("education alternatives, YKI and declarations are not presented as the same requirement", () => {
  const alternatives = english("civicAlternativesBody");
  assert.match(alternatives, /matriculation examination completed in Finland in Finnish or Swedish/);
  assert.match(alternatives, /Finnish- or Swedish-language higher education degree completed in Finland/);
  assert.match(alternatives, /exemptions.*long-term health or disability.*Migri assesses/s);
  assert.match(english("civicYkiBody"), /YKI.*does not replace the civic-knowledge requirement/);
  assert.match(english("civicDeclarationBody"), /does not apply to citizenship declarations/);
});

test("format, validity, fee and future registration remain faithful to the bulletin", () => {
  const format = english("civicFormatBody");
  assert.match(format, /computer-based multiple-choice test in Finnish or Swedish/);
  assert.match(format, /taken at a test venue/);
  assert.match(format, /result does not expire/);
  assert.match(format, /fee.*amount has not yet been published/s);
  assert.match(english("costCivicBody"), /fee has not been published/);
  assert.match(english("costCivicNote"), /turn of 2026\/2027/);
  assert.doesNotMatch(english("costCivicNote"), /autumn/i);
  const preparation = english("civicPreparationBody");
  assert.match(preparation, /University of Helsinki/);
  assert.match(preparation, /self-study material at the turn of 2026\/2027/);
  assert.match(preparation, /society and legislation, rights, equality, history and culture/);
  const sessions = english("civicSessionsBody");
  assert.match(sessions, /6[–-]10 test sessions per year on national test days/);
  for (const city of ["Helsinki", "Tampere", "Turku", "Oulu", "Kuopio", "Vaasa", "Rovaniemi"]) {
    assert.ok(sessions.includes(city), `retain the announced location ${city}`);
  }
  assert.match(sessions, /dates and registration times.*by the turn of 2026\/2027/s);
  assert.match(sessions, /does not announce booking dates/);
  assert.match(english("civicSupportBody"), /requested in advance.*illness, disability or reading and writing difficulties/s);
  assert.match(english("civicSupportBody"), /unable to read or write may take an oral test/);
});

test("Russian copy independently preserves the important legal distinctions", () => {
  const when = i18n.t("ru", "civicWhenBody");
  assert.match(when, /вступают в силу 1 января 2027/);
  assert.match(when, /по 28 февраля включительно/);
  assert.match(when, /поданным с 1 марта 2027/);
  assert.match(when, /18[–-]64/);
  assert.match(when, /успешно сдать до подачи заявления/);
  assert.match(i18n.t("ru", "civicYkiBody"), /не заменяет требование знания общества/);
  assert.match(i18n.t("ru", "civicDeclarationBody"), /не распространяется.*декларации/s);
  assert.match(i18n.t("ru", "civicAlternativesBody"), /экзамен.*сданный в Финляндии.*диплом.*полученный в Финляндии/s);
});

test("a scoped update has unique accessible headings and consistent canonical review metadata", () => {
  for (const id of ["citizenship-test-update", "civic-update-heading", "upcoming-heading"]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} must be unique`);
  }
  assert.match(html, /id="citizenship-test-update"[^>]*aria-labelledby="civic-update-heading"/);
  assert.match(html, /<h2 id="civic-update-heading"/);
  const review = JSON.parse(readFileSync(new URL("../docs/rules-review.json", import.meta.url), "utf8"));
  const reviewedDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${review.lastReviewed}T00:00:00Z`));
  assert.ok(english("reviewed").includes(`Last reviewed: ${reviewedDate}`));
});
