import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { openApp, waitForRefresh, tbaMatch, tbaRanking, DEFAULT_CONFIG } from "./helpers/app.js";

/**
 * The Teams tab shows OPR and EPA in their own columns. They used to share one "Pwr"
 * column holding whichever of the two had been fetched, so the number's meaning changed
 * with a setting — and because two headings shared one sort key, sorting by Pwr lit up
 * the Wld heading instead of the one that was clicked.
 */

const MY = 10021;
const EVENT = "2026iri";
const FIELD = [MY, 254, 1114, 2056];

const OPRS = { frc10021: 42.5, frc254: 78.9, frc1114: 55.1, frc2056: 61.25 };
// Statbotics answers per team; deliberately a different order from OPR so the two
// columns cannot be confused for each other.
const EPAS = { 10021: 70.2, 254: 30.4, 1114: 88.6, 2056: 50.1 };

async function mock(page, { statbotics = true } = {}) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    const send = (b) => route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
    });
    if (/\/event\/[^/]+$/.test(url)) return send({ key: EVENT, name: "IRI", webcasts: [] });
    if (/team\/frc\d+\/events\/2026\/simple/.test(url))
      return send([{ key: EVENT, name: "IRI", start_date: "2026-07-10", end_date: "2026-07-11" }]);
    if (/team\/frc\d+\/events\/\d+\/simple/.test(url)) return send([]);
    if (url.includes("/oprs")) return send({ oprs: OPRS });
    if (url.includes("/rankings"))
      return send({ rankings: FIELD.map((t, i) => tbaRanking(t, i + 1, 8 - i, i)) });
    if (/\/event\/[^/]+\/matches(\/simple)?(\?|$)/.test(url))
      return send([tbaMatch({ num: 1, red: [254, 1114, 2056], blue: [MY, 1, 2], redScore: 50, blueScore: 60, played: true })]);
    return send([]);
  });
  await page.route("https://api.statbotics.io/**", (route) => {
    const m = route.request().url().match(/team_year\/(\d+)\//);
    const v = m && statbotics ? EPAS[m[1]] : null;
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(v == null ? {} : { epa: { total_points: { mean: v }, ranks: { total: { rank: Math.round(200 - v) } } } }),
    });
  });
}

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const openTeams = async (page, opts = {}) => {
  await mock(page, opts);
  await openApp(page, server.baseURL, {
    config: { ...DEFAULT_CONFIG, eventKey: EVENT, statbotics: opts.statbotics !== false },
  });
  await waitForRefresh(page);
  await page.click('.tab[data-page="teams"]');
  await expect(page.locator("#teamList .teams-header")).toBeVisible();
};

const headings = (page) =>
  page.$$eval("#teamList .teams-header > *", (els) => els.map((e) => e.textContent.trim()));
const activeHeading = (page) => page.locator("#teamList .header-btn.active");
const colValues = (page, i) =>
  page.$$eval(`#teamList .team-item`, (els, idx) =>
    els.map((e) => e.children[idx].textContent.trim()), i);

test("OPR and EPA each have their own column", async ({ page }) => {
  await openTeams(page);
  // Next was dropped to make room: it was the widest column and its value repeats down
  // the table. It is on the team popup instead.
  expect(await headings(page)).toEqual(["Team", "Name", "Event", "OPR", "EPA", "Rec"]);
});

test("the two columns hold different numbers", async ({ page }) => {
  await openTeams(page);
  // Column 3 is OPR, column 4 is EPA. Both are populated at once, which the single
  // "Pwr" column could never do.
  const rows = await page.$$eval("#teamList .team-item", (els) =>
    els.map((e) => [e.children[0].textContent.trim(), e.children[3].textContent.trim(), e.children[4].textContent.trim()]));
  const mine = rows.find((r) => r[0].startsWith(String(MY)));
  expect(mine).toEqual([`${MY} ⭐`, "42.5", "70.2"]);
});

test.describe("sorting", () => {
  test("clicking a heading marks that heading, not another one", async ({ page }) => {
    await openTeams(page);
    for (const label of ["Team", "Name", "Event", "OPR", "EPA", "Rec"]) {
      await page.click(`#teamList .header-btn:text-is("${label}")`);
      await expect(activeHeading(page)).toHaveCount(1);
      await expect(activeHeading(page)).toHaveText(label);
    }
  });

  test("sorting by OPR orders by OPR", async ({ page }) => {
    await openTeams(page);
    await page.click('#teamList .header-btn:text-is("OPR")');
    expect(await colValues(page, 3)).toEqual(["78.9", "61.3", "55.1", "42.5"]);
  });

  test("sorting by EPA orders by EPA, not OPR", async ({ page }) => {
    await openTeams(page);
    await page.click('#teamList .header-btn:text-is("EPA")');
    expect(await colValues(page, 4)).toEqual(["88.6", "70.2", "50.1", "30.4"]);
    // The OPR column is along for the ride, in no particular order.
    expect(await colValues(page, 3)).not.toEqual(["78.9", "61.3", "55.1", "42.5"]);
  });

  test("teams without a rating sort to the bottom", async ({ page }) => {
    await openTeams(page, { statbotics: false });
    await page.click('#teamList .header-btn:text-is("OPR")');
    const opr = await colValues(page, 3);
    expect(opr[0]).toBe("78.9");
    // Everything the OPR response did not cover trails the teams that have one.
    expect(opr.filter((v) => v !== "—").length).toBeGreaterThan(0);
    expect([...opr].sort((a, b) => (a === "—") - (b === "—"))).toEqual(opr);
  });
});

test("EPA is empty rather than showing OPR when Statbotics is off", async ({ page }) => {
  await openTeams(page, { statbotics: false });
  const rows = await page.$$eval("#teamList .team-item", (els) =>
    els.map((e) => [e.children[3].textContent.trim(), e.children[4].textContent.trim()]));
  const withOpr = rows.find((r) => r[0] !== "—");
  expect(withOpr[0]).not.toBe("—");
  // The old single column would have shown the OPR here and called it power.
  expect(rows.every((r) => r[1] === "—")).toBe(true);
});
