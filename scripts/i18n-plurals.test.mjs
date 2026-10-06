import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const context = { window: {}, Intl, Map };
runInNewContext(readFileSync(new URL("../docs/i18n.js", import.meta.url), "utf8"), context);
const { languages, formatCount } = context.window.i18n;
const number = (locale, value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);

// Expected words are independent fixtures, not read back from the dictionaries.
const forms = {
  en: { days: { one: "day", other: "days" }, years: { one: "calendar year", other: "calendar years" } },
  fi: { days: { one: "päivä", other: "päivää" }, years: { one: "kalenterivuosi", other: "kalenterivuotta" } },
  sv: { days: { one: "dag", other: "dagar" }, years: { one: "kalenderår", other: "kalenderår" } },
  ru: { days: { one: "день", few: "дня", many: "дней", other: "дня" }, years: { one: "календарный год", few: "календарных года", many: "календарных лет", other: "календарного года" } },
  uk: { days: { one: "день", few: "дні", many: "днів", other: "дня" }, years: { one: "календарний рік", few: "календарні роки", many: "календарних років", other: "календарного року" } },
  ne: { days: { one: "दिन", other: "दिन" }, years: { one: "क्यालेन्डर वर्ष", other: "क्यालेन्डर वर्ष" } },
  so: { days: { one: "maalin", other: "maalmood" }, years: { one: "sannad taariikheed", other: "sannado taariikheed" } },
  et: { days: { one: "päev", other: "päeva" }, years: { one: "kalendriaasta", other: "kalendriaastat" } },
  hi: { days: { one: "दिन", other: "दिन" }, years: { one: "कैलेंडर वर्ष", other: "कैलेंडर वर्ष" } }
};
const boundaries = [0, 1, 2, 3, 4, 5, 10, 11, 12, 14, 19, 20, 21, 22, 24, 25, 99, 100, 101, 102, 111, 112, 121, 1001, 2471, 0.5, 1.5, 2.5, 21.5, 1000.5];

for (const { code: locale } of languages) {
  test(`${locale}: day and calendar-year forms cover every cardinal category`, () => {
    const rules = new Intl.PluralRules(locale, { maximumFractionDigits: 3 });
    const categories = new Set();
    for (const value of boundaries) {
      const category = rules.select(value);
      categories.add(category);
      const days = formatCount(locale, "days", value);
      const years = formatCount(locale, "calendarYears", value);
      assert.ok(days.length > 0 && years.length > 0);
      assert.doesNotMatch(days + years, /undefined|\{count\}/);
      if (locale !== "en") assert.doesNotMatch(days + years, /\b(?:day|days|calendar years?)\b/);
      if (locale === "ar") {
        const expectedDays = { zero: `${number(locale, value)} يوم`, one: "يوم واحد", two: "يومان", few: `${number(locale, value)} أيام`, many: `${number(locale, value)} يومًا`, other: `${number(locale, value)} يوم` };
        const expectedYears = { zero: `${number(locale, value)} سنة تقويمية`, one: "سنة تقويمية واحدة", two: "سنتان تقويميتان", few: `${number(locale, value)} سنوات تقويمية`, many: `${number(locale, value)} سنة تقويمية`, other: `${number(locale, value)} سنة تقويمية` };
        assert.equal(days, expectedDays[category]);
        assert.equal(years, expectedYears[category]);
      } else {
        assert.equal(days, `${number(locale, value)} ${forms[locale].days[category]}`);
        assert.equal(years, `${number(locale, value)} ${forms[locale].years[category]}`);
      }
    }
    assert.deepEqual([...categories].sort(), rules.resolvedOptions().pluralCategories.slice().sort());
  });
}

test("Russian and Ukrainian use distinct teen, last-digit and fractional forms", () => {
  const fixtures = {
    ru: [[1, "1 день"], [2, "2 дня"], [5, "5 дней"], [11, "11 дней"], [21, "21 день"], [101, "101 день"], [111, "111 дней"], [1.5, "1,5 дня"]],
    uk: [[1, "1 день"], [2, "2 дні"], [5, "5 днів"], [11, "11 днів"], [21, "21 день"], [101, "101 день"], [111, "111 днів"], [1.5, "1,5 дня"]]
  };
  for (const [locale, values] of Object.entries(fixtures)) {
    for (const [value, expected] of values) assert.equal(formatCount(locale, "days", value), expected);
  }
});

test("fractional half-day credit is neither truncated nor rounded to a whole day", () => {
  for (const { code: locale } of languages) {
    for (const value of [0.5, 1.5, 182.5, 1000.5]) {
      assert.ok(formatCount(locale, "days", value).includes(number(locale, value)));
      assert.notEqual(formatCount(locale, "days", value), formatCount(locale, "days", Math.round(value)));
    }
  }
});

test("unsupported locale/unit and invalid counts cannot silently fall back to English", () => {
  const invalid = [["xx", "days", 1], ["en", "weeks", 1], ["en", "days", -1], ["en", "days", NaN], ["en", "days", Infinity], ["en", "days", "1"]];
  for (const args of invalid) assert.throws(() => formatCount(...args), { name: "RangeError" });
});
