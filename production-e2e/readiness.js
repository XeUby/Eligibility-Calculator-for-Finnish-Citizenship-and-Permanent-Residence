const { request } = require("@playwright/test");

// A deployment can finish before every GitHub Pages edge has the new WASM.
// For post-deploy checks, wait for the exact released Go VCS stamp instead of
// accepting a successful calculation from yesterday's cached application.
module.exports = async function waitForRelease(config) {
  const expectedSha = process.env.FINRESIDENCE_EXPECTED_SHA;
  if (!expectedSha) return;
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error("FINRESIDENCE_EXPECTED_SHA must be a full Git commit SHA.");
  const baseURL = config.projects[0].use.baseURL;
  const client = await request.newContext({ ignoreHTTPSErrors: false });
  const deadline = Date.now() + 180_000;
  let lastObservation = "no response";
  try {
    do {
      const url = new URL("main.wasm", baseURL);
      try {
        const response = await client.get(url.href, {
          timeout: Math.min(20_000, deadline - Date.now()),
          headers: { "Cache-Control": "no-cache" }
        });
        if (response.ok() && new URL(response.url()).origin === new URL(baseURL).origin) {
          const body = await response.body();
          if (body.includes(Buffer.from(`vcs.revision=${expectedSha}`))) {
            console.log(`READY: published WebAssembly matches release ${expectedSha}`);
            return;
          }
          lastObservation = "published WebAssembly still has a different release stamp";
        } else {
          lastObservation = `HTTP ${response.status()} or unexpected origin`;
        }
        await response.dispose();
      } catch (error) {
        lastObservation = error.message;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, remaining)));
    } while (Date.now() < deadline);
    throw new Error(`The exact release ${expectedSha} was not available within three minutes: ${lastObservation}`);
  } finally {
    await client.dispose();
  }
};
