const { test, expect } = require("@playwright/test");
const locales = ["en", "fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"];

async function fillPermit(page, index, type, start, end) {
  await page.locator(".permit-type").nth(index).selectOption(type);
  await page.locator(".permit-start").nth(index).fill(start);
  await page.locator(".permit-end").nth(index).fill(end);
}

async function expectLocalizedWarnings(page, codes) {
  const english = await page.evaluate((codes) => codes.map((code) => window.i18n.warning("en", code, "__UNTRANSLATED__")), codes);
  for (const locale of locales) {
    await page.locator("#language").selectOption(locale);
    const expected = await page.evaluate(({ locale, codes }) => codes.map((code) => window.i18n.warning(locale, code, "__UNTRANSLATED__")), { locale, codes });
    for (const [index, text] of expected.entries()) {
      expect(text, `${locale} must translate ${codes[index]}`).not.toBe("__UNTRANSLATED__");
      if (locale !== "en") expect(text, `${locale} must not reuse English ${codes[index]}`).not.toBe(english[index]);
      await expect(page.locator("#warnings li").filter({ hasText: text })).toHaveCount(1);
    }
    await expect(page.locator("#results")).toBeVisible();
  }
}

test("calculates common citizenship and permanent-residence routes", async ({ page }) => {
  await page.goto("/");
  await page.locator(".permit-start").fill("2020-01-01");
  await page.locator(".permit-end").fill("2026-12-31");
  await page.getByLabel("Citizenship route").selectOption("language");
  await page.getByLabel("Permanent residence path").selectOption("high_income");
  await page.getByLabel("Calculate as of").fill("2026-08-26");
  await page.getByLabel(/I confirm that I meet/).check();
  await page.getByRole("button", { name: "Calculate my estimate" }).click();

  await expect(page.getByRole("heading", { name: "Your estimate" })).toBeVisible();
  await expect(page.locator("#citizenship-status")).toHaveText("Meets residence time");
  await expect(page.locator("#pr-status")).toHaveText("Meets residence time");
});

test("rejects a permit period with reversed dates before calculation", async ({ page }) => {
  await page.goto("/");
  await page.locator(".permit-start").fill("2026-01-02");
  await page.locator(".permit-end").fill("2026-01-01");
  await page.getByRole("button", { name: "Calculate my estimate" }).click();
  await expect(page.getByRole("alert")).toHaveText("A permit end date cannot be before its start date.");
});

test("requires a calculation date and explains the error in every language", async ({ page }) => {
  await page.goto("/");
  await fillPermit(page, 0, "A", "2020-01-01", "2035-12-31");
  await page.locator("#as-of").fill("");
  const englishError = await page.evaluate(() => window.i18n.t("en", "errAsOf"));
  for (const locale of locales) {
    await page.locator("#language").selectOption(locale);
    await page.locator(".primary").click();
    const expected = await page.evaluate((locale) => window.i18n.t(locale, "errAsOf"), locale);
    if (locale !== "en") expect(expected).not.toBe(englishError);
    await expect(page.locator("#form-error")).toHaveText(expected);
    await expect(page.locator("#results")).toBeHidden();
  }
});

test("translates all primary Russian form controls", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Language").selectOption("ru");
  await expect(page.locator("#residence-heading")).toHaveText("1. История разрешений на проживание");
  await expect(page.locator("#citizenship-route option[value=standard]")).toHaveText("Стандартный путь — 8 лет");
  await expect(page.locator("#pr-path option[value=six_years]")).toHaveText("6 лет + язык B1 + 2 года работы");
  await expect(page.locator("[data-i18n=tripHelp]")).toHaveText(/День выезда из Финляндии/);
});

test("does not fall back to English for the Nepali calculator controls", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Language").selectOption("ne");
  await expect(page.locator("[data-i18n=residenceIntro]")).toHaveText("तपाईंको गणनासँग सम्बन्धित सबै अविच्छिन्न अनुमति अवधिहरू थप्नुहोस्।");
  await expect(page.locator(".permit-type option[value=A]")).toHaveText("A — निरन्तर");
  await expect(page.locator("#citizenship-route option[value=standard]")).toHaveText("साधारण मार्ग — ८ वर्ष");
  const incomeLabel = await page.evaluate(() => window.i18n.t("ne", "prIncome"));
  expect(incomeLabel).toContain("€40,000");
  expect(incomeLabel).not.toBe(await page.evaluate(() => window.i18n.t("en", "prIncome")));
  await expect(page.locator("#pr-path option[value=high_income]")).toHaveText(incomeLabel);
  await expect(page.locator("[data-i18n=tripHelp]")).toContainText("फिनल्यान्ड छोड्ने दिन");
});

test("keeps a completed estimate localised after the language changes", async ({ page }) => {
  await page.goto("/");
  await page.locator(".permit-start").fill("2020-01-01");
  await page.locator(".permit-end").fill("2026-12-31");
  await page.getByLabel("Citizenship route").selectOption("language");
  await page.getByLabel("Permanent residence path").selectOption("high_income");
  await page.getByLabel("Calculate as of").fill("2026-08-26");
  await page.getByLabel(/I confirm that I meet/).check();
  await page.getByRole("button", { name: "Calculate my estimate" }).click();
  await page.getByLabel("Language").selectOption("ru");

  await expect(page.locator("#citizenship-status")).toHaveText("Срок проживания выполнен");
  await expect(page.locator("#warnings")).toContainText("дополнительные законные условия");
});

test("fits translated path details and a completed estimate at phone and tablet widths", async ({ page }) => {
  await page.goto("/");
  await fillPermit(page, 0, "A", "2020-01-01", "2035-12-31");
  await page.locator("#as-of").fill("2026-10-05");
  await page.locator("#pr-path").selectOption("foreign_degree");
  await page.locator("#conditions-met").check();
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator(".primary")).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const locale of locales) {
      await page.locator("#language").selectOption(locale);
      await expect(page.locator("#pr-details")).not.toBeEmpty();
      await expect(page.locator("#results")).toBeVisible();
      const fits = await page.locator("body").evaluate((body) => {
        const viewport = document.documentElement.clientWidth;
        const details = document.querySelector("#pr-details");
        const results = document.querySelector("#results");
        return body.scrollWidth <= viewport + 1 && document.documentElement.scrollWidth <= viewport + 1
          && details.scrollWidth <= details.clientWidth + 1 && results.scrollWidth <= results.clientWidth + 1;
      });
      expect(fits, `${locale} form, long path details and result must fit ${width}px`).toBeTruthy();
    }
  }
});

test("shows the published application and YKI fees without inventing a citizenship-test fee", async ({ page }) => {
  await page.goto("/");
  const costs = page.locator("section:has(#costs-heading)");
  await expect(costs).toContainText("€550 online · €650 paper application");
  await expect(costs).toContainText("€380 online · €600 paper application");
  await expect(costs).toContainText("Basic €165 · Intermediate €190 · Advanced €216");
  await expect(costs).toContainText("The fee has not been published by Migri yet.");
});

test("offers a privacy-preserving feedback route and project source", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer).toContainText("Created by Boris");
  await expect(footer).toContainText("does not collect personal data");
  await expect(footer.getByRole("link", { name: "View source code" })).toHaveAttribute("href", /XeUby\/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence$/);
  await expect(footer.getByRole("link", { name: "Report an issue" })).toHaveAttribute("href", /issues\/new\?template=bug_report\.md$/);
  await expect(footer.getByRole("link", { name: "Suggest an improvement" })).toHaveAttribute("href", /issues\/new\?template=improvement\.md$/);
});

test("saves an optional local draft and clears it on request", async ({ page }) => {
  await page.goto("/");
  await page.locator(".permit-start").fill("2020-01-01");
  await page.locator(".permit-end").fill("2026-12-31");
  await page.locator("#as-of").fill("2026-08-26");
  await page.locator("#language").selectOption("ru");
  await page.locator("#save-draft").click();
  await expect(page.locator("#draft-status")).toContainText("Черновик сохранён");

  await page.reload();
  await expect(page.locator("#language")).toHaveValue("ru");
  await expect(page.locator(".permit-start")).toHaveValue("2020-01-01");
  await expect(page.locator(".permit-end")).toHaveValue("2026-12-31");
  await expect(page.locator("#as-of")).toHaveValue("2026-08-26");

  await page.locator("#clear-draft").click();
  await expect(page.locator(".permit-start")).toHaveValue("");
  await expect(page.locator(".permit-end")).toHaveValue("");
  await expect(page.locator("#draft-status")).toContainText("удалены");
});

test("explains calculation inputs and normalises overlapping trips", async ({ page }) => {
  await page.goto("/");
  await page.locator(".permit-start").fill("2015-01-01");
  await page.locator(".permit-end").fill("2026-12-31");
  await page.getByLabel("Citizenship route").selectOption("language");
  await page.getByLabel("Calculate as of").fill("2026-01-01");
  await page.getByRole("button", { name: "Add trip" }).click();
  await page.locator(".absence-start").nth(0).fill("2025-08-20");
  await page.locator(".absence-end").nth(0).fill("2025-12-31");
  await page.getByRole("button", { name: "Add trip" }).click();
  await page.locator(".absence-start").nth(1).fill("2025-09-01");
  await page.locator(".absence-end").nth(1).fill("2026-01-01");
  await page.getByRole("button", { name: "Calculate my estimate" }).click();

  await expect(page.locator("#breakdown-heading")).toHaveText("How this estimate was calculated");
  await expect(page.locator("#breakdown-trip-days")).toHaveText("133 days");
  await expect(page.locator("#warnings")).toContainText("Overlapping or duplicate trips were counted only once.");
});

test("includes the Finnish-degree permanent-residence path", async ({ page }) => {
  await page.goto("/");
  await page.locator(".permit-start").fill("2026-01-01");
  await page.locator(".permit-end").fill("2030-01-01");
  await page.locator("#as-of").fill("2026-01-08");
  await page.locator("#pr-path").selectOption("degree_finland");
  await page.locator("#conditions-met").check();
  await page.getByRole("button", { name: "Calculate my estimate" }).click();

  await expect(page.locator("#pr-required")).toHaveText("No residence-time requirement");
  await expect(page.locator("#pr-status")).toHaveText("Meets residence time");
});

test("publishes search metadata and a site icon", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", "https://finresidence.fi/");
  await expect(page.locator("link[rel=icon]")).toHaveAttribute("href", /favicon\.svg$/);
  await expect(page.locator("meta[property='og:site_name']")).toHaveAttribute("content", "FinResidence");
  await expect(page).toHaveTitle(/^FinResidence — /);
});

test("translates every static calculator string in each advertised language", async ({ page }) => {
  await page.goto("/");
  const readStrings = () => page.locator("[data-i18n]").evaluateAll((elements) =>
    elements.map((element) => ({ key: element.dataset.i18n, text: element.textContent.trim() }))
  );
  const english = new Map((await readStrings()).map(({ key, text }) => [key, text]));

  for (const locale of locales.filter((locale) => locale !== "en")) {
    await page.locator("#language").selectOption(locale);
    const fallbackKeys = (await readStrings())
      .filter(({ key, text }) => text === english.get(key))
      .map(({ key }) => key);
    expect(fallbackKeys, `${locale} must not use an English static-string fallback`).toEqual([]);
  }
});

test("changing the permanent-residence path resets its confirmation and explains the new conditions", async ({ page }) => {
  await page.goto("/");
  const sixYearDetails = await page.locator("#pr-details").textContent();
  await page.locator("#conditions-met").check();
  await page.locator("#pr-path").selectOption("degree_finland");
  await expect(page.locator("#conditions-met")).not.toBeChecked();
  await expect(page.locator("#pr-details")).not.toHaveText(sixYearDetails);
  await expect(page.locator("#pr-details")).toContainText("A2");
  await page.locator("#conditions-met").check();
  await page.locator("#pr-path").selectOption("high_income");
  await expect(page.locator("#conditions-met")).not.toBeChecked();
  await expect(page.locator("#pr-details")).toContainText("€40,000");
  await page.locator("#language").selectOption("ru");
  const russianIncomeDetails = await page.evaluate(() => window.i18n.t("ru", "prDetailIncome"));
  expect(russianIncomeDetails).toMatch(/40[\s\u00a0]?000\s*€/);
  await expect(page.locator("#pr-details")).toHaveText(russianIncomeDetails);
  await expect(page.locator("#pr-details")).not.toHaveText(await page.evaluate(() => window.i18n.t("en", "prDetailIncome")));
});

test("hides a stale estimate whenever its calculation inputs change", async ({ page }) => {
  await page.goto("/");
  await fillPermit(page, 0, "A", "2020-01-01", "2035-12-31");
  await page.locator("#as-of").fill("2026-10-05");
  await page.locator("#conditions-met").check();
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();
  await page.locator(".permit-start").fill("2025-01-01");
  await expect(page.locator("#results")).toBeHidden();
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();
  await page.locator("#pr-path").selectOption("high_income");
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#conditions-met")).not.toBeChecked();
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();
  await page.locator("#add-absence").click();
  await expect(page.locator("#results")).toBeHidden();
});

test("does not publish stale inputs changed while the calculation engine is loading", async ({ page }) => {
  let resumeEngine;
  let notifyRequest;
  const resume = new Promise((resolve) => { resumeEngine = resolve; });
  const requested = new Promise((resolve) => { notifyRequest = resolve; });
  await page.route("**/main.wasm", async (route) => {
    notifyRequest();
    await resume;
    await route.continue();
  });
  await page.goto("/");
  await fillPermit(page, 0, "A", "2020-01-01", "2035-12-31");
  await page.locator("#as-of").fill("2026-10-05");
  await page.locator(".primary").click();
  await requested;
  await page.locator(".permit-start").fill("2025-01-01");
  resumeEngine();
  await expect(page.locator(".primary")).toBeEnabled();
  await expect(page.locator("#results")).toBeHidden();
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#citizenship-status")).toHaveText("More time or conditions needed");
});

test("explains uncredited later B permits and excessive PR absences in every language", async ({ page }) => {
  await page.goto("/");
  await fillPermit(page, 0, "A", "2020-01-01", "2020-12-31");
  await page.locator("#add-permit").click();
  await fillPermit(page, 1, "B", "2021-01-01", "2024-12-31");
  await page.locator("#add-permit").click();
  await fillPermit(page, 2, "A", "2025-01-01", "2040-12-31");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#as-of").fill("2030-01-08");
  await page.locator("#add-absence").click();
  await page.locator(".absence-start").fill("2026-01-01");
  await page.locator(".absence-end").fill("2030-01-01");
  await page.locator("#conditions-met").check();
  await page.locator(".primary").click();
  await expect(page.locator("#citizenship-status")).toHaveText("More time or conditions needed");
  await expect(page.locator("#pr-status")).toHaveText("More time or conditions needed");
  await expect(page.locator("#pr-date")).toHaveText("—");
  await expectLocalizedWarnings(page, ["citizenship_later_b", "pr_absence_review"]);
});

test("localises the decision-time B credit condition and the PR effective-date limitation", async ({ page }) => {
  await page.goto("/");
  await fillPermit(page, 0, "B", "2015-01-01", "2024-12-31");
  await page.locator("#add-permit").click();
  await fillPermit(page, 1, "A", "2025-01-01", "2040-12-31");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#as-of").fill("2025-10-01");
  await page.locator("#pr-path").selectOption("degree_finland");
  await page.locator("#conditions-met").check();
  await page.locator(".primary").click();
  await expect(page.locator("#citizenship-status")).toHaveText("More time or conditions needed");
  await expect(page.locator("#pr-status")).toHaveText("More time or conditions needed");
  await expect(page.locator("#pr-date")).toHaveText("—");
  await expectLocalizedWarnings(page, ["citizenship_b_credit_year", "pr_rules_date"]);
});

test("shows a translated manual assessment instead of an invented citizenship date after a long stay abroad", async ({ page }) => {
  await page.goto("/");
  await fillPermit(page, 0, "A", "2010-01-01", "2040-12-31");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#as-of").fill("2030-01-08");
  await page.locator("#add-absence").click();
  await page.locator(".absence-start").fill("2020-01-01");
  await page.locator(".absence-end").fill("2026-01-02");
  await page.locator(".primary").click();
  await expect(page.locator("#citizenship-status")).toHaveText("More time or conditions needed");
  await expect(page.locator("#citizenship-date")).toHaveText("—");
  await expectLocalizedWarnings(page, ["citizenship_absence_review"]);
});

test("restores a legacy draft, saves under FinResidence and clears both storage keys", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("fee.fi-calculator-draft-v1", JSON.stringify({
      version: 1, language: "fi", permits: [{ type: "A", start: "2020-01-01", end: "2035-12-31" }],
      absences: [{ start: "2024-07-01", end: "2024-07-20" }], asOf: "2026-10-05",
      citizenshipRoute: "language", prPath: "high_income", conditionsMet: true
    }));
  });
  await page.reload();
  await expect(page.locator("#language")).toHaveValue("fi");
  await expect(page.locator(".permit-start")).toHaveValue("2020-01-01");
  await expect(page.locator(".absence-start")).toHaveValue("2024-07-01");
  await expect(page.locator("#as-of")).toHaveValue("2026-10-05");
  await expect(page.locator("#pr-path")).toHaveValue("high_income");
  await expect(page.locator("#conditions-met")).toBeChecked();
  await page.locator("#save-draft").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("finresidence-calculator-draft-v1")));
  expect(saved).toMatchObject({ version: 1, language: "fi", asOf: "2026-10-05", prPath: "high_income" });
  await page.locator("#clear-draft").click();
  expect(await page.evaluate(() => [localStorage.getItem("finresidence-calculator-draft-v1"), localStorage.getItem("fee.fi-calculator-draft-v1")])).toEqual([null, null]);
  await page.reload();
  await expect(page.locator(".permit-start")).toHaveValue("");
  await expect(page.locator(".absence-start")).toHaveCount(0);
  await expect(page.locator("#conditions-met")).not.toBeChecked();
});
