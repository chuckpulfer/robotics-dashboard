import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, waitForRefresh, tbaMatch, tbaRanking, tbaAlliance } from "./helpers/app.js";

/**
 * The Mine tab is a single timeline: played matches above, upcoming below, with the
 * next match given a taller card carrying the title, start time and win estimate.
 */

const MY = 10021;
const DATA = {
  matches: [
    tbaMatch({ num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], redScore: 84, blueScore: 71, played: true }),
    tbaMatch({ num: 11, red: [2377, MY, 359], blue: [2056, 1024, 3176], redScore: 66, blueScore: 52, played: true }),
    tbaMatch({ num: 27, red: [1792, 1768, 8608], blue: [5687, 4028, MY] }),
    tbaMatch({ num: 37, red: [234, MY, 5907], blue: [1023, 27, 1987] }),
  ],
  rankings: [tbaRanking(MY, 7, 8, 3)],
  alliances: [tbaAlliance([MY, 2056, 2767])],
  oprs: { [`frc${MY}`]: 44.2, frc2056: 61.4, frc1792: 30 },
};

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

test("there is no separate Next tab", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  const tabs = await page.$$eval(".tab", (els) => els.map((e) => e.textContent));
  expect(tabs).toEqual(["Mine", "Quals", "Playoffs", "Teams", "All", "Settings"]);
  await expect(page.locator(".tab.active")).toHaveAttribute("data-page", "matches");
});

test("shows the status header above the match cards", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  const metrics = await page.$$eval("#matchList .mystatus .metric", (els) =>
    els.map((e) => ({ value: e.querySelector("b")?.textContent, label: e.querySelector("span")?.textContent })));
  expect(metrics).toContainEqual({ value: "#7", label: "Event rank" });
  expect(metrics).toContainEqual({ value: "8-3-0", label: "Qual record" });

  const statusFirst = await page.evaluate(() => {
    const kids = [...document.getElementById("matchList").children];
    return kids.findIndex((k) => k.classList.contains("mystatus")) < kids.findIndex((k) => k.id.startsWith("match-"));
  });
  expect(statusFirst).toBe(true);
});

test("marks exactly one next match, in chronological position", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  const order = await page.$$eval("#matchList [id^=match-]", (els) =>
    els.map((e) => e.id + (e.classList.contains("nexthero") ? "*" : "")));
  // qm27 is the first unplayed match and keeps its slot after the two played ones.
  // The trailing card is the placeholder for the playoff slot the alliance is in.
  expect(order).toEqual(["match-qm6", "match-qm11", "match-qm27*", "match-qm37", "match-pending_sf1"]);
});

test("the next match keeps the title, start time and win estimate", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  const hero = page.locator("#matchList .nexthero");
  await expect(hero.locator(".eyebrow")).toHaveText(/Next match · (RED|BLUE) alliance/);
  await expect(hero.locator(".hero-title")).toHaveText("Qualification 27");
  await expect(hero.locator(".countdown")).not.toBeEmpty();
  await expect(hero.locator(".metrics .metric span").filter({ hasText: /estimate/i })).toHaveCount(1);
  await expect(hero.locator("[data-open-power-help]")).toBeVisible();
});

test("opening the tab parks on the next match, clear of the sticky header", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  // Scrolling happens when the tab is opened. The startup pass runs against cached
  // data, before the refresh has replaced the list, so drive the tab explicitly.
  await page.click('.tab[data-page="quals"], .tab[data-page="allmatches"]');
  await page.click('.tab[data-page="matches"]');
  await page.waitForTimeout(800);

  const pos = await page.evaluate(() => {
    const hero = document.querySelector(".nexthero").getBoundingClientRect();
    const header = document.querySelector("header").getBoundingClientRect();
    return { scrollY: window.scrollY, heroTop: hero.top, headerBottom: header.bottom };
  });
  expect(pos.scrollY).toBeGreaterThan(50);
  expect(pos.heroTop).toBeGreaterThanOrEqual(pos.headerBottom - 1);
});

test("shows a message instead of a blank page when there are no matches", async ({ page }) => {
  await mockTba(page, { rankings: [tbaRanking(4242, 1)] });
  await openApp(page, server.baseURL, { config: { eventKey: "2026iri", tbaKey: "k", refreshSeconds: 300, team: 4242, eventManual: true, statbotics: false } });
  await waitForRefresh(page);

  await expect(page.locator("#matchList .mystatus")).toBeVisible();
  await expect(page.locator("#matchList .empty")).toHaveText("No matches loaded.");
});
