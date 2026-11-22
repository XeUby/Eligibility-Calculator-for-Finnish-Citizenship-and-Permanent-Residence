const { test, expect } = require("@playwright/test");
const locales = ["en", "fi", "sv", "ru", "uk", "ne", "ar", "so", "et", "hi"];

test("publishes discoverable icons and a keyboard-accessible brand header", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("link[rel=icon][type='image/svg+xml']")).toHaveAttribute("href", "favicon.svg");
  await expect(page.locator("link[rel=icon][type='image/png'][sizes='96x96']")).toHaveAttribute("href", "favicon-96.png");
  await expect(page.locator("link[rel='shortcut icon']")).toHaveAttribute("href", "favicon.ico");
  await expect(page.locator("link[rel=apple-touch-icon]")).toHaveAttribute("href", "apple-touch-icon.png");
  const topbar = page.locator(".site-topbar");
  await expect(topbar).toBeVisible();
  const brand = topbar.locator("a[href='#main-content']");
  await expect(brand).toContainText("FinResidence");
  const image = brand.locator("img");
  await expect(image).toHaveAttribute("src", "favicon.svg");
  expect(await image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBeTruthy();
  await brand.focus();
  await expect(brand).toBeFocused();
  await expect(brand).toHaveCSS("outline-style", "solid");
  await expect(brand).not.toHaveCSS("outline-width", "0px");
  await topbar.locator("#language").focus();
  await expect(topbar.locator("#language")).toBeFocused();
  await expect(page.locator(".hero-art")).toHaveAttribute("aria-hidden", "true");
});

for (const width of [320, 390, 768, 1440]) {
  test(`brand header and complete calculator fit all ten languages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator(".permit-start").fill("2020-01-01");
    await page.locator(".permit-end").fill("2035-12-31");
    await page.locator("#as-of").fill("2026-11-22");
    await page.locator("#conditions-met").check();
    await page.locator(".primary").click();
    await expect(page.locator("#results")).toBeVisible();
    for (const locale of locales) {
      await page.locator("#language").selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      const layout = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const selectors = [".site-topbar", "h1", "#language", "#calculator", "#results"];
        return {
          viewport,
          document: document.documentElement.scrollWidth,
          failures: selectors.flatMap((selector) => {
            const element = document.querySelector(selector);
            const box = element.getBoundingClientRect();
            return box.left < -1 || box.right > viewport + 1 || element.scrollWidth > element.clientWidth + 1
              ? [{ selector, client: element.clientWidth, scroll: element.scrollWidth, left: box.left, right: box.right }] : [];
          }),
          touchSizes: [...document.querySelectorAll("#language, .primary, #add-permit, #add-absence")]
            .map((element) => ({ id: element.id, height: element.getBoundingClientRect().height })),
        };
      });
      expect(layout.document, `${locale}: document fits ${width}px`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.failures, `${locale}: no clipping at ${width}px: ${JSON.stringify(layout)}`).toEqual([]);
      for (const control of layout.touchSizes) expect(control.height, `${control.id} touch target`).toBeGreaterThanOrEqual(44);
      await expect(page.locator("#results")).toBeVisible();
      await expect(page.locator("#form-error")).toBeEmpty();
    }
  });
}
