// @ts-check
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  webServer: {
    command: "go run ./cmd/server",
    url: "http://127.0.0.1:8080/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
