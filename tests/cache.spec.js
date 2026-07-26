import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, openSettings, waitForCache, KEYS } from "./helpers/app.js";

/**
 * Service worker behaviour and the cache panel.
 *
 * These specs need a *real* service worker, so unlike the others they do not block it.
 * That means cross-origin requests escape page routing, which is fine here: nothing
 * asserted depends on TBA responses.
 */

const SHELL_FILES = 7;

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });

const cacheEntries = (page) =>
  page.evaluate(async () => {
    const names = await caches.keys();
    const out = [];
    for (const n of names) out.push(...(await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname));
    return out;
  });

test.describe("service worker cache", () => {
  test("caches exactly the app shell, with no error responses", async ({ page }) => {
    await mockTba(page, {});
    await openApp(page, server.baseURL);
    await waitForCache(page, SHELL_FILES);

    const entries = await cacheEntries(page);
    expect(entries).toHaveLength(SHELL_FILES);
    // A 404 for favicon.ico used to be stored alongside the real files.
    expect(entries.filter((p) => p.includes("favicon"))).toEqual([]);
    expect(entries).toContain("/index.html");
    expect(entries).toContain("/assets/js/app.js");
  });

  test("serves the cached copy rather than re-fetching", async ({ page }) => {
    await mockTba(page, {});
    await openApp(page, server.baseURL);
    await waitForCache(page, SHELL_FILES);

    // Cache-first means a reload asks the server for nothing but version.json and the
    // worker script. Measured server-side: page request events also fire for requests
    // the worker answered from cache, which would make this pass either way.
    const mark = server.mark();
    await page.reload();
    await page.waitForSelector(".tab");
    await page.waitForTimeout(1000);

    const refetched = server.hitsSince(mark).filter((p) => /app\.js|styles\.css|index\.html/.test(p));
    expect(refetched).toEqual([]);
  });

  test("still loads with the network offline", async ({ context, page }) => {
    await mockTba(page, {});
    await openApp(page, server.baseURL);
    await waitForCache(page, SHELL_FILES);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".tab")).toHaveCount(5);
    await context.setOffline(false);
  });

  test("clearing the cache re-downloads the shell and keeps settings", async ({ page }) => {
    await mockTba(page, {});
    await openApp(page, server.baseURL);
    await waitForCache(page, SHELL_FILES);
    await page.evaluate(() => localStorage.setItem("keep-me", "yes"));

    await openSettings(page);
    await page.click("#cachePanel summary");
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#clearCacheBtn")]);
    await page.waitForSelector(".tab");
    await waitForCache(page, SHELL_FILES);

    expect(await cacheEntries(page)).toHaveLength(SHELL_FILES);
    expect(await page.evaluate(() => localStorage.getItem("keep-me"))).toBe("yes");
    expect(await page.evaluate((k) => !!localStorage.getItem(k), KEYS.config)).toBe(true);
  });
});

test.describe("cache panel", () => {
  // Assertions below use auto-retrying locators rather than reading the text once:
  // the panel also renders at startup, so a single read can catch the previous result.
  const openPanel = async (page) => {
    await openSettings(page);
    await page.click("#cachePanel summary");
    await expect(page.locator("#cacheFreshness")).not.toHaveText(/Checking for a newer version/, { timeout: 15_000 });
  };
  const details = (page) => page.locator("#cacheDetails");
  const freshness = (page) => page.locator("#cacheFreshness");

  test("reports file count, size and download date", async ({ page }) => {
    await mockTba(page, {});
    await openApp(page, server.baseURL);
    await waitForCache(page, SHELL_FILES);

    await openPanel(page);
    await expect(details(page)).toContainText(/7 files cached/);
    await expect(details(page)).toContainText(/(B|KB|MB) stored/);
    await expect(details(page)).toContainText(/downloaded \w+ \d+, \d{4}/);
  });

  test("says the build is unstamped when run locally", async ({ page }) => {
    await mockTba(page, {});
    await openApp(page, server.baseURL);
    await waitForCache(page, SHELL_FILES);

    await openPanel(page);
    await expect(details(page)).toContainText("not stamped (local build)");
    await expect(freshness(page)).toHaveText(/only run on the deployed site/);
  });

  test("reports a deployed build as up to date", async ({ browser }) => {
    const stamped = await startStaticServer({ stamp: "abc1234" });
    const page = await browser.newPage();
    await mockTba(page, {});
    await openApp(page, stamped.baseURL);
    await waitForCache(page, SHELL_FILES);

    await openPanel(page);
    await expect(details(page)).toContainText("Version abc1234");
    await expect(freshness(page)).toHaveText("Up to date.");
    await expect(freshness(page)).toHaveClass("ok");
    await page.close();
    await stamped.close();
  });

  test("flags a newer deployed version", async ({ browser }) => {
    // Start matching so the auto-updater stays quiet, then advertise a new build.
    // Loading straight into a mismatch just makes the app reload itself on repeat.
    const stale = await startStaticServer({ stamp: "abc1234" });
    const page = await browser.newPage();
    await mockTba(page, {});
    await openApp(page, stale.baseURL);
    await waitForCache(page, SHELL_FILES);
    stale.setDeployed("def5678");

    await openPanel(page);
    await expect(freshness(page)).toContainText("Update available: def5678", { timeout: 15_000 });
    await expect(freshness(page)).toHaveClass("warn");
    await page.close();
    await stale.close();
  });
});
