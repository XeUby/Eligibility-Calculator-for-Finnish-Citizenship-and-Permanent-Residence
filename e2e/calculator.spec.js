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
