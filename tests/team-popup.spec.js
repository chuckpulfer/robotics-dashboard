import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import {
  mockTba, openApp, waitForRefresh,
  tbaMatch, tbaRanking, tbaTeam, tbaAlliance,
} from "./helpers/app.js";

/** Tapping a team number anywhere should open the same detail popup. */

const DATA = {
  matches: [
    tbaMatch({ num: 6, red: [8085, 3641, 469], blue: [10021, 2056, 2767] }),
    tbaMatch({ comp: "sf", set: 1, num: 1, red: [10021, 2056, 2767], blue: [469, 3641, 8085], redScore: 88, blueScore: 70, played: true }),
  ],
  rankings: [tbaRanking(10021, 7, 8, 3), tbaRanking(2056, 3, 9, 1)],
  eventTeams: [tbaTeam(10021, "Golden Gears"), tbaTeam(2056, "OP Robotics"), tbaTeam(2767, "Stryke Force")],
  alliances: [tbaAlliance([10021, 2056, 2767])],
  oprs: { frc2056: 61.4, frc10021: 44.2 },
  teamSimple: { 2056: { city: "Hamilton", state_prov: "Ontario", country: "Canada" } },
};

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
  await page.waitForSelector("#matchList .teamrow");
});

const popupText = async (page) => {
  await expect(page.locator("#teamDetail")).toHaveAttribute("open", "");
  return (await page.textContent("#teamDetailBody")).replace(/\s+/g, " ").trim();
};

test("opens from a team number in a match card", async ({ page }) => {
  await page.click('#matchList .teamrow[data-team="2056"] .tnum-tap');
  const text = await popupText(page);
  expect(text).toContain("2056");
  expect(text).toContain("OP Robotics");
  expect(text).toContain("#3");      // event rank
  expect(text).toContain("9-1-0");   // qual record
});

test("the whole row is tappable, not just the number", async ({ page }) => {
  await page.click('#matchList .teamrow[data-team="2056"] .tname');
  expect(await popupText(page)).toContain("2056");
});

test("resolves the team's location", async ({ page }) => {
  await page.click('#matchList .teamrow[data-team="2056"]');
  await expect(page.locator("#teamDetailBody")).toContainText("Hamilton, Ontario", { timeout: 5000 });
});

test("opens from the Quals tab", async ({ page }) => {
  await page.click('.tab[data-page="allmatches"]');
  await page.waitForSelector("#allMatchList .teamrow");
  await page.click('#allMatchList .teamrow[data-team="2056"] .tnum-tap');
  expect(await popupText(page)).toContain("OP Robotics");
});

test("opens from the playoff bracket", async ({ page }) => {
  await page.click('.tab[data-page="playoffs"]');
  await page.waitForSelector("#playoffContent [data-team]");
  await page.click('#playoffContent [data-team="2056"]');
  expect(await popupText(page)).toContain("OP Robotics");
});

test("opens from the Teams tab", async ({ page }) => {
  await page.click('.tab[data-page="teams"]');
  await page.waitForSelector("#teamList .team-item");
  await page.click('#teamList .team-item[data-team="2056"]');
  expect(await popupText(page)).toContain("OP Robotics");
});

test("closes again", async ({ page }) => {
  await page.click('#matchList .teamrow[data-team="2056"]');
  await expect(page.locator("#teamDetail")).toHaveAttribute("open", "");
  await page.click("#teamDetailClose");
  expect(await page.$eval("#teamDetail", (d) => d.open)).toBe(false);
});

test("the power-help button is not swallowed by the team handler", async ({ page }) => {
  const help = page.locator("#matchList [data-open-power-help]").first();
  await expect(help).toBeVisible();
  await help.click();
  await expect(page.locator("#page-settings")).toHaveClass(/active/);
});
