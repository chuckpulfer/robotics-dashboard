import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, waitForRefresh, tbaRanking } from "./helpers/app.js";

/**
 * The sticky header must reserve the iOS status-bar strip. It pins to the viewport
 * edge, so padding on an ancestor does not hold it down once the page scrolls — that
 * was the bug where the clock and battery overlapped the title.
 *
 * Headless Chromium reports env(safe-area-inset-*) as 0, so the inset is injected
 * through the same `--sat` variable the stylesheet reads.
 */

const SAT = 59; // iPhone 14 Pro
let server;

test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

async function withInset(page) {
  await page.addStyleTag({ content: `:root{--sat:${SAT}px}` });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(300);
}

test("the header stays clear of the status bar when scrolled", async ({ page }) => {
  await mockTba(page, { rankings: [tbaRanking(10021, 7)] });
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
  await withInset(page);

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(300);

  const box = await page.$eval("header", (h) => {
    const r = h.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  expect(Math.abs(box.top)).toBeLessThan(1);
  expect(box.bottom).toBeGreaterThan(SAT + 20);
});

test("nothing but the header is painted in the status-bar strip", async ({ page }) => {
  await mockTba(page, { rankings: [tbaRanking(10021, 7)] });
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
  await withInset(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(300);

  // Content scrolling behind an opaque header still overlaps geometrically, so this
  // hit-tests what is actually on top rather than comparing rectangles.
  const intruders = await page.evaluate((sat) => {
    const bad = [];
    for (const x of [20, 120, 200, 300, 370]) {
      for (const y of [2, Math.round(sat / 2), sat - 2, sat + 8]) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest("header")) bad.push(`${x},${y} -> ${el.tagName}.${el.className}`);
      }
    }
    return bad;
  }, SAT);
  expect(intruders).toEqual([]);
});

test("the Teams tab bars stack below the header without overlapping", async ({ page }) => {
  await mockTba(page, { rankings: Array.from({ length: 40 }, (_, i) => tbaRanking(1000 + i, i + 1)) });
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
  await withInset(page);

  await page.click('.tab[data-page="teams"]');
  await page.waitForSelector("#teamList .teams-header");
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(400);

  const rects = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    return { header: box("header"), search: box(".teams-sticky"), columns: box(".teams-header") };
  });
  expect(rects.search.top).toBeGreaterThanOrEqual(rects.header.bottom - 1);
  expect(rects.columns.top).toBeGreaterThanOrEqual(rects.search.bottom - 1);
});

test("the page does not scroll sideways at phone width", async ({ page }) => {
  await mockTba(page, { rankings: [tbaRanking(10021, 7)] });
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflows).toBe(false);
});
