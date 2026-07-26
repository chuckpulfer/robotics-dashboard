import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, openSettings, readConfig } from "./helpers/app.js";

/**
 * Venue wifi often accepts a connection and then never answers. `hang: true` routes
 * reproduce that: the request is neither fulfilled nor aborted.
 *
 * These wait out the real 25s operation timeout, so they are tagged @slow and skipped
 * by `npm run test:fast`.
 */

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

test("a hanging request aborts on its own signal", async ({ page }) => {
  await mockTba(page, {}, { hang: true });
  await openApp(page, server.baseURL);

  const result = await page.evaluate(async () => {
    const started = Date.now();
    try {
      await fetch("https://www.thebluealliance.com/api/v3/status", { signal: timeoutSignal(3000) });
      return { settled: "resolved", ms: Date.now() - started };
    } catch (e) {
      return { settled: e.name, ms: Date.now() - started };
    }
  });
  // AbortSignal.timeout() rejects with TimeoutError; the iOS<16 fallback uses AbortError.
  expect(["TimeoutError", "AbortError"]).toContain(result.settled);
  expect(result.ms).toBeLessThan(5000);
});

test("@slow saving recovers instead of sticking on Saving…", async ({ page }) => {
  await mockTba(page, {}, { hang: true });
  await openApp(page, server.baseURL);
  await openSettings(page);
  await page.fill("#refreshSeconds", "77");

  const started = Date.now();
  await page.click("#saveApiBtn");
  await expect(page.locator("#saveApiBtn")).not.toHaveText("Saving…", { timeout: 45_000 });
  const elapsed = Date.now() - started;

  expect(elapsed).toBeLessThan(35_000);
  await expect(page.locator("#saveApiBtn")).toHaveText(/refresh failed/i);
  await expect(page.locator("#saveApiBtn")).toBeEnabled();
  await expect(page.locator("#statusDetail")).toContainText(/timed out/i);
  // The settings are written before any network work, so a dead link cannot lose them.
  expect((await readConfig(page)).refreshSeconds).toBe(77);
});

test("@slow the refresh button recovers and re-enables", async ({ page }) => {
  await mockTba(page, {}, { hang: true });
  await openApp(page, server.baseURL);

  await page.click("#refreshBtn");
  await expect(page.locator("#statusTime")).toContainText(/timed out/i, { timeout: 45_000 });
  await expect(page.locator("#refreshBtn")).toBeEnabled();
});

test("a healthy network is unaffected", async ({ page }) => {
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openSettings(page);
  await page.fill("#refreshSeconds", "55");

  const started = Date.now();
  await page.click("#saveApiBtn");
  await expect(page.locator("#saveApiBtn")).toHaveText("Saved!", { timeout: 20_000 });

  expect(Date.now() - started).toBeLessThan(10_000);
  expect((await readConfig(page)).refreshSeconds).toBe(55);
});
