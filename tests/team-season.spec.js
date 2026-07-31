import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { openApp, waitForRefresh, tbaMatch, tbaRanking } from "./helpers/app.js";

/**
 * The dedicated team season view: every event a team played that year, with rank,
 * record, alliance and playoff result.
 *
 * TBA's /events/{year}/statuses returns all of that in one call, so the view costs two
 * requests no matter how many events the team attended.
 */

const MY = 10021;
const LOOKUP = 2056;

const SEASON = {
  2026: {
    events: [
      { key: "2026onta", name: "Ontario District Champs", start_date: "2026-04-01", end_date: "2026-04-03" },
      { key: "2026cmptx", name: "Einstein Field", start_date: "2026-04-20", end_date: "2026-04-23" },
    ],
    statuses: {
      "2026onta": {
        qual: { ranking: { rank: 3, record: { wins: 9, losses: 1, ties: 0 } } },
        alliance: { name: "Alliance 1" },
        playoff: { status: "won" },
      },
      // Attended, but nothing posted yet.
      "2026cmptx": null,
    },
  },
  2025: { events: [{ key: "2025onta", name: "Ontario 2025", start_date: "2025-04-02", end_date: "2025-04-04" }], statuses: {} },
};

async function mockSeason(page) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    const headers = { "Access-Control-Expose-Headers": "ETag" };
    const send = (body) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(body) });

    const season = url.match(/team\/frc(\d+)\/events\/(\d+)\/(simple|statuses)/);
    if (season) {
      const [, , year, kind] = season;
      const data = SEASON[year] ?? { events: [], statuses: {} };
      return send(kind === "simple" ? data.events : data.statuses);
    }
    if (/team\/frc\d+\/simple/.test(url)) return send({ city: "Hamilton", state_prov: "Ontario", country: "Canada" });
    if (/\/teams\/\d+\/simple/.test(url)) return send([{ key: `frc${LOOKUP}`, nickname: "OP Robotics" }]);
    if (url.includes("/matches")) return send([tbaMatch({ num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], redScore: 84, blueScore: 71, played: true })]);
    if (url.includes("/rankings")) return send({ rankings: [tbaRanking(MY, 7), tbaRanking(LOOKUP, 3)] });
    return send([]);
  });
  await page.route("https://api.statbotics.io/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const start = async (page) => {
  await mockSeason(page);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
};

/** The All teams tab is where a team is looked up now: filter, then tap the row. */
async function lookUpTeam(page, team) {
  await page.click('.tab[data-page="allteams"]');
  // Active-this-season defaults to on, and this spec's mock lists no active teams.
  await page.setChecked("#activeOnly", false);
  await page.fill("#allTeamSearch", String(team));
  const row = page.locator(`#allTeamsList [data-team="${team}"]`);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator("#page-team")).toHaveClass(/active/);
}

test("looking up a team opens its season", async ({ page }) => {
  await start(page);
  await lookUpTeam(page, LOOKUP);

  await expect(page.locator("#teamPage .hero-title")).toHaveText(String(LOOKUP));
  await expect(page.locator("#teamPage .tdloc")).toContainText("Hamilton, Ontario");
});

test("lists every event with rank, record, alliance and playoff result", async ({ page }) => {
  await start(page);
  await lookUpTeam(page, LOOKUP);

  const cards = page.locator("#teamPage .scard");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Ontario District Champs");
  await expect(cards.first()).toContainText("#3");
  await expect(cards.first()).toContainText("9-1-0");
  await expect(cards.first()).toContainText("Alliance 1");
  await expect(cards.first()).toContainText("Winner");
});

test("an event with nothing posted says so rather than showing blanks", async ({ page }) => {
  await start(page);
  await lookUpTeam(page, LOOKUP);

  const einstein = page.locator("#teamPage .scard").nth(1);
  await expect(einstein).toContainText("Einstein Field");
  await expect(einstein).toContainText("No results posted.");
});

test("events are ordered by date", async ({ page }) => {
  await start(page);
  await lookUpTeam(page, LOOKUP);

  const names = await page.$$eval("#teamPage .sname", (els) => els.map((e) => e.textContent));
  expect(names).toEqual(["Ontario District Champs", "Einstein Field"]);
});

test("the season year can be switched", async ({ page }) => {
  await start(page);
  await lookUpTeam(page, LOOKUP);

  await page.click('#teamPage [data-season-year="2025"]');
  await expect(page.locator("#teamPage .scard")).toHaveCount(1);
  await expect(page.locator("#teamPage .sname")).toHaveText("Ontario 2025");
});

test("Back returns to the tab you came from", async ({ page }) => {
  await start(page);
  await page.click('.tab[data-page="playoffs"]');
  await page.click('.tab[data-page="teams"]');

  // Reach the season view from the popup rather than Settings this time.
  await page.click(`#teamList .team-item[data-team="${LOOKUP}"]`);
  await page.click("[data-team-season]");
  await expect(page.locator("#page-team")).toHaveClass(/active/);

  await page.click("#teamPageBack");
  await expect(page.locator("#page-teams")).toHaveClass(/active/);
  await expect(page.locator('.tab[data-page="teams"]')).toHaveClass(/active/);
});

test("the season view is reachable from the team popup", async ({ page }) => {
  await start(page);
  await page.click('.tab[data-page="teams"]');
  await page.click(`#teamList .team-item[data-team="${LOOKUP}"]`);
  await expect(page.locator("#teamDetail")).toHaveAttribute("open", "");

  await page.click("[data-team-season]");
  // Opening the view also dismisses the dialog it was launched from.
  expect(await page.$eval("#teamDetail", (d) => d.open)).toBe(false);
  await expect(page.locator("#teamPage .hero-title")).toHaveText(String(LOOKUP));
});

test("the season view has no tab of its own", async ({ page }) => {
  await start(page);
  const tabs = await page.$$eval(".tab", (els) => els.map((e) => e.dataset.page));
  expect(tabs).toEqual(["matches", "allmatches", "playoffs", "teams", "allteams", "settings"]);
});
