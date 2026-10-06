const { test, expect } = require("@playwright/test");

test("one-day result and breakdown are correctly inflected after switching languages", async ({ page }) => {
  await page.goto("/");
  await page.locator(".permit-start").fill("2026-10-05");
  await page.locator(".permit-end").fill("2035-12-31");
  await page.locator("#as-of").fill("2026-10-05");
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();

  const expected = {
    en: ["1 day", "0 days", "8 calendar years", "6 calendar years"],
    fi: ["1 päivä", "0 päivää", "8 kalenterivuotta", "6 kalenterivuotta"],
    sv: ["1 dag", "0 dagar", "8 kalenderår", "6 kalenderår"],
    ru: ["1 день", "0 дней", "8 календарных лет", "6 календарных лет"],
    uk: ["1 день", "0 днів", "8 календарних років", "6 календарних років"],
    ar: ["يوم واحد", null, null, null],
    ne: [null, null, null, null],
    so: ["1 maalin", "0 maalmood", "8 sannado taariikheed", "6 sannado taariikheed"],
    et: ["1 päev", "0 päeva", "8 kalendriaastat", "6 kalendriaastat"],
    hi: ["1 दिन", "0 दिन", "8 कैलेंडर वर्ष", "6 कैलेंडर वर्ष"]
  };
  const words = { ar: ["يوم", "سنوات تقويمية"], ne: ["दिन", "क्यालेन्डर वर्ष"] };
  for (const [locale, values] of Object.entries(expected)) {
    await page.locator("#language").selectOption(locale);
    const localizedNumber = await page.evaluate((locale) => [0, 1, 6, 8].map(value => new Intl.NumberFormat(locale).format(value)), locale);
    const one = values[0] || `${localizedNumber[1]} ${words[locale][0]}`;
    const zero = values[1] || `${localizedNumber[0]} ${words[locale][0]}`;
    const eight = values[2] || `${localizedNumber[3]} ${words[locale][1]}`;
    const six = values[3] || `${localizedNumber[2]} ${words[locale][1]}`;
    await expect(page.locator("#citizenship-days")).toHaveText(one);
    await expect(page.locator("#pr-days")).toHaveText(one);
    await expect(page.locator("#breakdown-ap-credit")).toHaveText(one);
    for (const selector of ["#breakdown-b-credit", "#breakdown-trip-days", "#breakdown-absence-deduction"]) await expect(page.locator(selector)).toHaveText(zero);
    await expect(page.locator("#citizenship-required")).toHaveText(eight);
    await expect(page.locator("#pr-required")).toHaveText(six);
    await expect(page.locator(".permit-start")).toHaveValue("2026-10-05");
    await expect(page.locator("#results")).toBeVisible();
  }
});

test("Russian day endings remain correct for two, teen, twenty-one and large counts", async ({ page }) => {
  await page.goto("/");
  await page.locator("#language").selectOption("ru");
  await page.locator(".permit-end").fill("2035-12-31");
  await page.locator("#as-of").fill("2026-10-05");
  const fixtures = [["2026-10-04", "2 дня"], ["2026-09-25", "11 дней"], ["2026-09-15", "21 день"], ["2020-01-01", "2\u00a0470 дней"]];
  for (const [start, expected] of fixtures) {
    await page.locator(".permit-start").fill(start);
    await page.locator(".primary").click();
    await expect(page.locator("#citizenship-days")).toHaveText(expected);
    await expect(page.locator("#pr-days")).toHaveText(expected);
  }
});

test("Arabic dual and four-year requirements are natural complete phrases", async ({ page }) => {
  await page.goto("/");
  await page.locator("#language").selectOption("ar");
  await page.locator(".permit-start").fill("2026-10-04");
  await page.locator(".permit-end").fill("2035-12-31");
  await page.locator("#as-of").fill("2026-10-05");
  await page.locator("#pr-path").selectOption("high_income");
  await page.locator(".primary").click();
  await expect(page.locator("#citizenship-days")).toHaveText("يومان");
  const four = await page.evaluate(() => new Intl.NumberFormat("ar").format(4));
  await expect(page.locator("#pr-required")).toHaveText(`${four} سنوات تقويمية`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
