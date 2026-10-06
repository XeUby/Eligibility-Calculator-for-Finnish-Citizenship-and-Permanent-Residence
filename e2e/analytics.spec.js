const { test, expect } = require("@playwright/test");

const canonicalOrigin = "https://finresidence.fi";
const analyticsScript = "https://static.cloudflareinsights.com/beacon.min.js";
const analyticsEndpoint = "https://cloudflareinsights.com/cdn-cgi/rum";
const analyticsToken = "1922ab2430ff4142ba48812ec64ba179";

// Exercise the actual shipped HTML and assets with their canonical browser
// origin. No production settings or network services are changed by this test.
async function serveLocalSiteAs(page, baseURL, origin = canonicalOrigin) {
  await page.route((url) => url.origin === origin, async (route) => {
    expect(route.request().method()).toBe("GET");
    const original = new URL(route.request().url());
    const response = await page.request.get(new URL(original.pathname + original.search, baseURL).href);
    await route.fulfill({ response });
  });
}

async function exerciseCalculator(page) {
  await page.locator(".permit-start").fill("2011-03-17");
  await page.locator(".permit-end").fill("2035-12-31");
  await page.locator("#as-of").fill("2026-10-05");
  await page.locator("#citizenship-route").selectOption("language");
  await page.locator("#pr-path").selectOption("high_income");
  await page.locator("#conditions-met").check();
  await page.locator("#add-absence").click();
  await page.locator(".absence-start").fill("2025-08-20");
  await page.locator(".absence-end").fill("2025-08-31");
  await page.locator("#save-draft").click();
  await page.locator(".primary").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#form-error")).toBeEmpty();
  await expect(page.locator("#citizenship-status")).toHaveText("Meets residence time");
  await expect(page.locator("#pr-status")).toHaveText("Meets residence time");
  await expect(page.locator("#breakdown-trip-days")).toHaveText("10 days");
}

test("production-only analytics has the exact public configuration and never receives calculator input", async ({ page, baseURL }) => {
  await serveLocalSiteAs(page, baseURL);
  const requests = [];
  const beacons = [];
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url(), body: request.postData() || "" }));

  // This disclosed minimal shim is NOT Cloudflare's implementation or a claim
  // about its data handling. It simulates delayed page metrics so app wiring,
  // configuration and the separation from form/draft data stay testable offline.
  await page.route(analyticsScript, async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: `
      (() => {
        const config = JSON.parse(document.getElementById("cloudflare-web-analytics").getAttribute("data-cf-beacon"));
        const send = () => navigator.sendBeacon("${analyticsEndpoint}", JSON.stringify({
          token: config.token, location: location.href, eventType: "pageview"
        }));
        send();
        window.addEventListener("pagehide", send);
      })();
    ` });
  });
  await page.route(analyticsEndpoint, async (route) => {
    expect(route.request().method()).toBe("POST");
    beacons.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 204, headers: { "access-control-allow-origin": canonicalOrigin }, body: "" });
  });
  await page.goto(canonicalOrigin + "/");
  await expect.poll(() => beacons.length).toBe(1);
  const script = page.locator("#cloudflare-web-analytics");
  await expect(script).toHaveCount(1);
  await expect(script).toHaveAttribute("src", analyticsScript);
  await expect(script).toHaveAttribute("defer", "");
  await expect(script).toHaveAttribute("type", "module");
  const config = JSON.parse(await script.getAttribute("data-cf-beacon"));
  expect(config).toEqual({ token: analyticsToken, spa: false });
  await exerciseCalculator(page);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => beacons.length).toBe(2);

  for (const request of requests) {
    for (const input of ["2011-03-17", "2035-12-31", "2026-10-05", "2025-08-20", "2025-08-31", "finresidence-calculator-draft-v1"]) {
      expect(request.url + request.body, `No request may contain the entered value ${input}`).not.toContain(input);
      expect(request.url + request.body).not.toContain(encodeURIComponent(input));
    }
    if (request.method === "GET" && new URL(request.url).origin === canonicalOrigin) continue;
    if (request.method === "GET" && request.url === analyticsScript) continue;
    expect({ method: request.method, url: request.url }).toEqual({ method: "POST", url: analyticsEndpoint });
    expect(Object.keys(JSON.parse(request.body)).sort()).toEqual(["eventType", "location", "token"]);
  }
  for (const beacon of beacons) expect(beacon).toEqual({ token: config.token, location: canonicalOrigin + "/", eventType: "pageview" });
  expect(runtimeErrors).toEqual([]);
});

test("a blocked optional analytics script does not affect real Go/WASM calculations", async ({ page, baseURL }) => {
  await serveLocalSiteAs(page, baseURL);
  const blocked = [];
  const unexpected = [];
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "GET" && (new URL(request.url()).origin === canonicalOrigin || request.url() === analyticsScript)) return;
    unexpected.push(`${request.method()} ${request.url()}`);
  });
  await page.route(analyticsScript, async (route) => {
    blocked.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  await page.goto(canonicalOrigin + "/");
  await exerciseCalculator(page);
  expect(blocked).toEqual([analyticsScript]);
  expect(unexpected).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

for (const url of [
  "http://finresidence.fi/",
  "https://www.finresidence.fi/",
  "https://finresidence.fi/?permitStart=2011-03-17",
  "https://finresidence.fi/#private-trip-2025-08-20"
]) {
  test(`does not enable analytics outside a clean canonical HTTPS URL: ${url}`, async ({ page, baseURL }) => {
    await serveLocalSiteAs(page, baseURL, new URL(url).origin);
    const external = [];
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== new URL(url).origin || request.method() !== "GET") external.push(request.url());
    });
    await page.goto(url);
    await expect(page.locator("#cloudflare-web-analytics")).toHaveCount(0);
    await exerciseCalculator(page);
    expect(external).toEqual([]);
  });
}

test("local development and previews do not create visitor statistics", async ({ page, baseURL }) => {
  const external = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL).origin || request.method() !== "GET") external.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("#cloudflare-web-analytics")).toHaveCount(0);
  await exerciseCalculator(page);
  expect(external).toEqual([]);
});
