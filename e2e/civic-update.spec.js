const { test, expect } = require("@playwright/test");
const locales = ["en", "fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"];
const bulletin = "https://migri.fi/en/-/up-to-date-information-on-amendments-to-citizenship-act-learning-material-for-citizenship-test-to-be-published-at-turn-of-the-year";

test("shows the dated citizenship-test update with safe primary-source links", async ({ page }) => {
  await page.goto("/");
  const update = page.locator("#citizenship-test-update");
  await expect(update.getByRole("heading", { level: 2 })).toHaveText("Citizenship test — update of 9 October 2026");
  const when = update.locator("[data-i18n=civicWhenBody]");
  await expect(when).toBeVisible();
  await expect(when).toContainText("take effect on 1 January 2027");
  await expect(when).toContainText("transition through 28 February");
  await expect(when).toContainText("applications submitted from 1 March 2027");
  await expect(when).toContainText("aged 18–64");
  await expect(when).toContainText("pass the test before submitting your application");
  await expect(update.locator("[data-i18n=civicYkiBody]")).toContainText("does not replace");
  await expect(update.locator("[data-i18n=civicDeclarationBody]")).toContainText("does not apply to citizenship declarations");
  for (const [key, url] of [
    ["officialUpdate", bulletin],
    ["civicSummaryLink", "https://migri.fi/en/amendments-to-the-citizenship-act-2027"],
  ]) {
    const link = update.locator(`[data-i18n=${key}]`);
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /\bnoopener\b/);
    await expect(link).toHaveAttribute("rel", /\bnoreferrer\b/);
  }
  await expect(page.locator("[data-i18n=costTestLink]")).toHaveAttribute("href", bulletin);
  await expect(page.locator("[data-i18n=costCivicNote]")).toContainText("turn of 2026/2027");
});

test("every citizenship-test summary can be opened and closed using the keyboard", async ({ page }) => {
  await page.goto("/");
  const entries = page.locator("#citizenship-test-update details");
  await expect(entries).toHaveCount(5);
  for (let index = 0; index < await entries.count(); index++) {
    const entry = entries.nth(index);
    const summary = entry.locator("summary");
    const content = entry.locator("p").first();
    await summary.focus();
    if (index === 0) {
      await expect(content).toBeVisible();
      await summary.press("Enter");
      await expect(content).toBeHidden();
    } else {
      await expect(content).toBeHidden();
    }
    await summary.press("Space");
    await expect(content).toBeVisible();
    await summary.press("Enter");
    await expect(content).toBeHidden();
  }
});

for (const width of [320, 390, 768]) {
  test(`expanded civic guidance fits every language at ${width}px including Arabic RTL`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const update = page.locator("#citizenship-test-update");
    // Keep every paragraph visible, including the longest translated explanations.
    await update.locator("details").evaluateAll((entries) => entries.forEach((entry) => { entry.open = true; }));
    for (const locale of locales) {
      await page.locator("#language").selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(update.locator("[data-i18n=civicDeclarationBody]")).toBeVisible();
      const layout = await update.evaluate((section) => {
        const viewport = document.documentElement.clientWidth;
        const failures = [...section.querySelectorAll("summary, p, strong, span")].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.left < -1 || box.right > viewport + 1 || element.scrollWidth > element.clientWidth + 1;
        }).map((element) => ({ key: element.dataset.i18n, width: element.clientWidth, scroll: element.scrollWidth }));
        return {
          viewport, document: document.documentElement.scrollWidth,
          section: { width: section.clientWidth, scroll: section.scrollWidth }, failures,
        };
      });
      expect(layout.document, `${locale} document fits ${width}px`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.section.scroll, `${locale} update fits ${width}px`).toBeLessThanOrEqual(layout.section.width + 1);
      expect(layout.failures, `${locale} explanations fit ${width}px: ${JSON.stringify(layout)}`).toEqual([]);
    }
  });
}
