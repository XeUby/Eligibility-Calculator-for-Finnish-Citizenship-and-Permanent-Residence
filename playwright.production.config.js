// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const site = new URL(process.env.FINRESIDENCE_SMOKE_BASE_URL || "https://finresidence.fi/");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
if (site.username || site.password || site.search || site.hash || site.pathname !== "/"
  || (!local && (site.origin !== "https://finresidence.fi"))
  || (local && !["http:", "https:"].includes(site.protocol))) {
  throw new Error("Production smoke tests may target https://finresidence.fi/ or an explicit loopback HTTP(S) server only.");
}

module.exports = defineConfig({
  testDir: "./production-e2e",
  globalSetup: require.resolve("./production-e2e/readiness.js"),
  outputDir: "./test-results/production",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report/production", open: "never" }]],
  use: {
    baseURL: site.href,
    ignoreHTTPSErrors: false,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    extraHTTPHeaders: { "Cache-Control": "no-cache" },
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    // These public checks use synthetic inputs only. Do not record browsing data.
    trace: "off",
    screenshot: "off",
    video: "off"
  },
  // No local webServer: this config exercises the actual deployed application.
  projects: [{ name: "production-chromium", use: { ...devices["Desktop Chrome"] } }]
});
