const { test, expect } = require("@playwright/test");

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
  await expect(page.locator("#pr-path option[value=high_income]")).toHaveText("४ वर्ष + वार्षिक आम्दानी €40,000 भन्दा बढी");
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

test("has no horizontal overflow on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".primary")).toBeVisible();
  for (const locale of ["en", "fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"]) {
    await page.locator("#language").selectOption(locale);
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth), `${locale} must fit on a phone`).toBeTruthy();
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
  await page.locator("#as-of").fill("2026-01-02");
  await page.locator("#pr-path").selectOption("degree_finland");
  await page.locator("#conditions-met").check();
  await page.getByRole("button", { name: "Calculate my estimate" }).click();

  await expect(page.locator("#pr-required")).toHaveText("No residence-time requirement");
  await expect(page.locator("#pr-status")).toHaveText("Meets residence time");
});

test("publishes search metadata and a site icon", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", "https://xeuby.github.io/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/");
  await expect(page.locator("link[rel=icon]")).toHaveAttribute("href", /favicon\.svg$/);
  await expect(page.locator("meta[property='og:site_name']")).toHaveAttribute("content", "FEE.fi");
});

test("translates every static calculator string in each advertised language", async ({ page }) => {
  await page.goto("/");
  const readStrings = () => page.locator("[data-i18n]").evaluateAll((elements) =>
    elements.map((element) => ({ key: element.dataset.i18n, text: element.textContent.trim() }))
  );
  const english = new Map((await readStrings()).map(({ key, text }) => [key, text]));

  for (const locale of ["fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"]) {
    await page.locator("#language").selectOption(locale);
    const fallbackKeys = (await readStrings())
      .filter(({ key, text }) => text === english.get(key))
      .map(({ key }) => key);
    expect(fallbackKeys, `${locale} must not use an English static-string fallback`).toEqual([]);
  }
});
