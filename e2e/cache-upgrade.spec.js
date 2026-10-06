const { test, expect } = require("@playwright/test");

test("an updated page never reuses stale unversioned scripts or WASM", async ({ page }) => {
  const legacyRequests = [];
  const assetRequests = [];
  const assetNames = ["i18n.js", "wasm_exec.js", "main.wasm"];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (assetNames.includes(url.pathname.slice(1))) assetRequests.push(url);
  });
  // Model an existing visitor's old cached asset URLs. Routing disables real
  // browser caching, so these explicitly provide stale responses only when an
  // unversioned URL is requested. Content-versioned URLs use the real server.
  await page.route((url) => assetNames.includes(url.pathname.slice(1)) && !url.search, async (route) => {
    legacyRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "throw new Error('Stale unversioned asset was reused');" });
  });
  await page.goto("/");
  await page.getByLabel("Start date", { exact: true }).fill("2026-10-05");
  await page.getByLabel("End date", { exact: true }).fill("2035-12-31");
  await page.getByLabel("Calculate as of", { exact: true }).fill("2026-10-05");
  await page.getByRole("button", { name: "Calculate my estimate", exact: true }).click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#form-error")).toBeEmpty();
  await expect(page.locator("#citizenship-days")).toHaveText("1 day");
  expect(legacyRequests).toEqual([]);
  expect(assetRequests.map((url) => url.pathname.slice(1)).sort()).toEqual([...assetNames].sort());
  for (const url of assetRequests) expect(url.search).toMatch(/^\?v=[a-f0-9]{64}$/);
});
