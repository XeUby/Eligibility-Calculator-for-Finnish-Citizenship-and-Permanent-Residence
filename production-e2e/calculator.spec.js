const { test: base, expect } = require("@playwright/test");
const { createHash } = require("node:crypto");

const analyticsScript = "https://static.cloudflareinsights.com/beacon.min.js";
const analyticsToken = "1922ab2430ff4142ba48812ec64ba179";

const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    const analyticsRequests = [];
    const outbound = [];
    const origin = new URL(baseURL).origin;
    // Test-only history survives subsequent edits/removals. Checking only the
    // final form would miss an earlier entered date leaked by a delayed request.
    await page.addInitScript(() => {
      window.__finresidenceSmokePrivateDates = [];
      const remember = (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "date" && event.target.value) {
          window.__finresidenceSmokePrivateDates.push(event.target.value);
        }
      };
      document.addEventListener("input", remember, true);
      document.addEventListener("change", remember, true);
    });
    // Verify the actual published loader and configuration, but do not count
    // scheduled synthetic tests as real visits or rely on a third-party CDN.
    // This inert response is deliberately not a mock of Cloudflare's metrics.
    await page.route(analyticsScript, async (route) => {
      if (route.request().method() !== "GET") return route.abort();
      await route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: "/* Synthetic site-health run: analytics intentionally disabled. */" });
    });
    page.on("pageerror", (error) => errors.push(`JavaScript: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`Console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => errors.push(`Network: ${request.url()} (${request.failure()?.errorText})`));
    page.on("response", (response) => {
      if (new URL(response.url()).origin === origin && response.status() >= 400) {
        errors.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });
    page.on("request", (request) => {
      outbound.push({ url: request.url(), body: request.postData() || "", headers: JSON.stringify(request.headers()) });
      if (request.method() === "GET" && request.url() === analyticsScript) {
        analyticsRequests.push(request);
        return;
      }
      if (request.method() !== "GET" || new URL(request.url()).origin !== origin) {
        errors.push(`Unexpected calculation-data request: ${request.method()} ${request.url()}`);
      }
    });
    await use(page);
    const privateDates = await page.evaluate(() => [...new Set(window.__finresidenceSmokePrivateDates)]);
    for (const request of outbound) {
      const wire = request.url + request.body + request.headers;
      for (const input of privateDates) {
        expect(wire, "No request, including same-origin GETs, may disclose a previously entered date").not.toContain(input);
        expect(wire).not.toContain(encodeURIComponent(input));
      }
    }
    const analytics = page.locator("#cloudflare-web-analytics");
    if (origin === "https://finresidence.fi") {
      await expect(analytics).toHaveCount(1);
      await expect(analytics).toHaveAttribute("src", analyticsScript);
      await expect(analytics).toHaveAttribute("defer", "");
      await expect(analytics).toHaveAttribute("type", "module");
      const config = JSON.parse(await analytics.getAttribute("data-cf-beacon"));
      expect(config, "Only this site's public token and disabled SPA tracking may be configured").toEqual({ token: analyticsToken, spa: false });
      expect(analyticsRequests).toHaveLength(1);
    } else {
      await expect(analytics).toHaveCount(0);
      expect(analyticsRequests).toHaveLength(0);
    }
    expect(errors, "The real public calculator must not emit runtime/network errors or send input data").toEqual([]);
  }
});

async function openCalculator(page) {
  const response = await page.goto("/");
  expect(response.status()).toBe(200);
  await expect(page.locator("#language")).toHaveValue("en");
}

async function fillPermit(page, index, type, start, end) {
  await page.locator(".permit-type").nth(index).selectOption(type);
  await page.locator(".permit-start").nth(index).fill(start);
  await page.locator(".permit-end").nth(index).fill(end);
}

async function calculate(page) {
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#form-error")).toBeEmpty();
}

test("published UI executes Go/WASM with half-credit B permits and continuous A residence", async ({ page }) => {
  const downloaded = [];
  const criticalAssets = ["i18n.js", "wasm_exec.js", "main.wasm"];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (criticalAssets.includes(url.pathname.slice(1))) {
      downloaded.push(response.body().then((bytes) => ({ url, hash: createHash("sha256").update(bytes).digest("hex") })));
    }
  });
  await openCalculator(page);
  await fillPermit(page, 0, "B", "2020-01-01", "2020-12-31");
  await page.locator("#add-permit").click();
  await fillPermit(page, 1, "A", "2021-01-01", "2035-12-31");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#pr-path").selectOption("high_income");
  await page.locator("#as-of").fill("2026-01-08");
  await page.locator("#conditions-met").check();

  // Real click, downloaded Go runtime and adapter: no mocked responses or JS
  // reimplementation. 366 B days / 2 + 1,834 inclusive A days = 2,017.
  const wasm = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/main.wasm"));
  await calculate(page);
  const wasmResponse = await wasm;
  expect(wasmResponse.status()).toBe(200);
  if (process.env.FINRESIDENCE_EXPECTED_SHA) {
    expect((await wasmResponse.body()).includes(Buffer.from(`vcs.revision=${process.env.FINRESIDENCE_EXPECTED_SHA}`)),
      "The actual browser-downloaded WASM must match the deployed commit, not only the readiness probe").toBeTruthy();
  }
  const assets = await Promise.all(downloaded);
  expect(assets.map(({ url }) => url.pathname.slice(1)).sort()).toEqual([...criticalAssets].sort());
  for (const { url, hash } of assets) {
    expect(url.searchParams.get("v"), `The actual downloaded ${url.pathname} must match its content version`).toBe(hash);
  }
  await expect(page.locator("#citizenship-days")).toHaveText("2,017 days");
  await expect(page.locator("#pr-days")).toHaveText("1,834 days");
  await expect(page.locator("#breakdown-b-credit")).toHaveText("183 days");
  await expect(page.locator("#breakdown-ap-credit")).toHaveText("1,834 days");
  await expect(page.locator("#citizenship-status")).toHaveText("Meets residence time");
  await expect(page.locator("#pr-status")).toHaveText("Meets residence time");
  await expect(page.locator("#citizenship-date")).toHaveText("Jan 8, 2026");
  await expect(page.locator("#pr-date")).toHaveText("Jan 8, 2026");
  await expect(page.locator("#warnings")).toContainText("at least one uninterrupted year");
  await expect(page.locator("#warnings")).toContainText("before Migri’s decision");
});

test("real trips preserve departure/return days and enforce 90/91 and 365/366 boundaries", async ({ page }) => {
  await openCalculator(page);
  await fillPermit(page, 0, "A", "2021-01-01", "2035-12-31");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#as-of").fill("2026-01-01");
  await page.locator("#add-absence").click();
  // Independent fixed examples also guard inclusive permit and exclusive trip
  // endpoints. No dates depend on the day that the scheduled check runs.
  for (const scenario of [
    { depart: "2025-09-30", returned: "2025-12-30", tripDays: 90, penalty: 0, credit: "1,827 days", date: "Jan 1, 2026", status: "Meets residence time" },
    { depart: "2025-09-29", returned: "2025-12-30", tripDays: 91, penalty: 1, credit: "1,826 days", date: "Jan 2, 2026", status: "More time or conditions needed" },
    { depart: "2022-01-01", returned: "2023-01-02", tripDays: 365, penalty: 0, credit: "1,827 days", date: "Jan 1, 2026", status: "Meets residence time" },
    { depart: "2022-01-01", returned: "2023-01-03", tripDays: 366, penalty: 1, credit: "1,826 days", date: "Jan 2, 2026", status: "More time or conditions needed" },
    { depart: "2025-12-29", returned: "2025-12-30", tripDays: 0, penalty: 0, credit: "1,827 days", date: "Jan 1, 2026", status: "Meets residence time" }
  ]) {
    await page.locator(".absence-start").fill(scenario.depart);
    await page.locator(".absence-end").fill(scenario.returned);
    await expect(page.locator("#results")).toBeHidden();
    await calculate(page);
    await expect(page.locator("#breakdown-trip-days")).toHaveText(`${scenario.tripDays} days`);
    // Accept the grammar correction from "1 days" to "1 day" independently of
    // deploy order, but still require an exact numerical boundary calculation.
    await expect(page.locator("#breakdown-absence-deduction")).toHaveText(new RegExp(`^${scenario.penalty} days?$`));
    await expect(page.locator("#citizenship-days")).toHaveText(scenario.credit);
    await expect(page.locator("#citizenship-status")).toHaveText(scenario.status);
    await expect(page.locator("#citizenship-date")).toHaveText(scenario.date);
  }
});

test("public form rejects reversed dates and produces a fresh projection after correction", async ({ page }) => {
  await openCalculator(page);
  await fillPermit(page, 0, "A", "2025-01-02", "2025-01-01");
  await page.locator(".primary").click();
  await expect(page.locator("#form-error")).toHaveText("A permit end date cannot be before its start date.");
  await expect(page.locator("#results")).toBeHidden();
  await fillPermit(page, 0, "A", "2025-01-01", "2035-12-31");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#as-of").fill("2026-10-05");
  await calculate(page);
  await expect(page.locator("#citizenship-status")).toHaveText("More time or conditions needed");
  await expect(page.locator("#citizenship-date")).toHaveText("Jan 1, 2030");
  await expect(page.locator("#pr-date")).toHaveText("Jan 1, 2031");
});

test("ten translated live results fit narrow phones, including Arabic RTL", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openCalculator(page);
  await fillPermit(page, 0, "A", "2020-01-01", "2035-12-31");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#pr-path").selectOption("high_income");
  await page.locator("#as-of").fill("2026-10-05");
  await page.locator("#conditions-met").check();
  await calculate(page);
  // Expected user-visible translations, not assertions against window.i18n.
  const translations = [
    ["en", "Your estimate", "Meets residence time"],
    ["fi", "Arviosi", "Asumisaikavaatimus täyttyy"],
    ["sv", "Din uppskattning", "Bosättningstiden uppfylls"],
    ["ru", "Ваш результат", "Срок проживания выполнен"],
    ["uk", "Ваш результат", "Строк проживання виконано"],
    ["ne", "तपाईंको अनुमान", "बसोबास अवधि पूरा भयो"],
    ["ar", "تقديرك", "تم استيفاء مدة الإقامة"],
    ["so", "Qiyaastaada", "Muddada deganaanshaha waa la buuxiyey"],
    ["et", "Teie hinnang", "Elamisaja nõue on täidetud"],
    ["hi", "आपका अनुमान", "निवास अवधि पूरी है"]
  ];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [locale, heading, status] of translations) {
      await page.locator("#language").selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.locator("#results-heading")).toHaveText(heading);
      await expect(page.locator("#citizenship-status")).toHaveText(status);
      await expect(page.locator("#pr-status")).toHaveText(status);
      await expect(page.locator(".permit-start")).toHaveValue("2020-01-01");
      const layout = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const result = document.querySelector("#results");
        const details = document.querySelector("#pr-details");
        return {
          viewport, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
          result: [result.clientWidth, result.scrollWidth], details: [details.clientWidth, details.scrollWidth]
        };
      });
      expect(layout.document, `${locale} document at ${width}px`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.body, `${locale} body at ${width}px`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.result[1], `${locale} result at ${width}px`).toBeLessThanOrEqual(layout.result[0] + 1);
      expect(layout.details[1], `${locale} path details at ${width}px`).toBeLessThanOrEqual(layout.details[0] + 1);
    }
  }
});
