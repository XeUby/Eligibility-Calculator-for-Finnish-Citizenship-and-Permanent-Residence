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
  await expect(page.locator("body")).toEvaluate((body) => body.scrollWidth <= window.innerWidth);
  await expect(page.getByRole("button", { name: "Calculate my estimate" })).toBeVisible();
});
