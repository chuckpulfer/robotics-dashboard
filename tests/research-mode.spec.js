import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, waitForRefresh, KEYS, tbaMatch, tbaRanking } from "./helpers/app.js";

/**
 * Research mode points the app at someone else's event.
 *
 * The property that matters most: matches, rankings and epa are not keyed by event, so
 * without separate per-mode contexts, browsing another event would overwrite what was
 * downloaded for your own — and leave it wrong after switching back.
 */

const MY = 10021;
const MY_EVENT = "2026iri";
const OTHER = "2026onta";

// Two events with entirely different fields, so data from one is unmistakable in the other.
const byEvent = {
  [MY_EVENT]: {
    matches: [tbaMatch({ num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], redScore: 84, blueScore: 71, played: true })],
    rankings: [tbaRanking(MY, 7, 8, 3), tbaRanking(2056, 12)],
  },
  [OTHER]: {
    matches: [tbaMatch({ num: 3, red: [1114, 2056, 4039], blue: [610, 1503, 2200], redScore: 55, blueScore: 60, played: true })],
    rankings: [tbaRanking(1114, 1, 11, 0), tbaRanking(610, 2)],
  },
};

/** Serves whichever event the request URL names, so both modes see their own data. */
async function mockEvents(page) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    const headers = { "Access-Control-Expose-Headers": "ETag" };
    const send = (body) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(body) });

    // My team's own schedule. Without it nothing counts as "away", so picking another
    // event would read as changing your own rather than researching someone else's.
    const mine = url.match(/team\/frc(\d+)\/events\/(\d+)\/simple/);
    if (mine) return send(mine[1] === String(MY) && mine[2] === "2026"
      ? [{ key: MY_EVENT, name: "Indiana Robotics Invitational", start_date: "2026-07-10", end_date: "2026-07-11" }]
      : []);
    if (/\/events\/\d+\/simple/.test(url)) {
      return send([
        { key: MY_EVENT, name: "Indiana Robotics Invitational", start_date: "2026-07-10", end_date: "2026-07-11" },
        { key: OTHER, name: "Ontario District Champs", start_date: "2026-04-01", end_date: "2026-04-03" },
      ]);
    }
    const ev = url.match(/\/event\/([^/]+)\//);
    const data = ev ? byEvent[ev[1]] : null;
    if (url.includes("/matches")) return send(data?.matches ?? []);
    if (url.includes("/rankings")) return send({ rankings: data?.rankings ?? [] });
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
  await mockEvents(page);
  await openApp(page, server.baseURL, { config: { eventKey: MY_EVENT, tbaKey: "k", refreshSeconds: 300, team: MY, eventManual: true, statbotics: false } });
  await waitForRefresh(page);
};

/** Research mode is entered from the header event chip: pick an event your team is not at. */
async function enterResearch(page) {
  await page.click("#eventChip");
  await page.fill("#switcherSearch", "Ontario");
  const option = page.locator(`#switcherList [data-pick="${OTHER}"]`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator("#researchBanner")).toBeVisible();
  await waitForRefresh(page);
}

const rankedTeams = (page) =>
  page.$$eval("#teamList .team-item", (els) => els.map((e) => e.dataset.team));

test("the research banner is hidden until a mode switch", async ({ page }) => {
  await start(page);
  await expect(page.locator("#researchBanner")).toBeHidden();
});

test("switching shows the other event's data", async ({ page }) => {
  await start(page);
  await page.click('.tab[data-page="teams"]');
  expect(await rankedTeams(page)).toEqual([String(MY), "2056"]);

  await enterResearch(page);
  await expect(page.locator("#researchBanner")).toContainText("Ontario District Champs");

  await page.click('.tab[data-page="teams"]');
  await expect.poll(() => rankedTeams(page)).toEqual(["1114", "610"]);
});

test("switching back restores your own event", async ({ page }) => {
  await start(page);
  await enterResearch(page);

  await page.click("#researchBanner [data-exit-research]");
  await expect(page.locator("#researchBanner")).toBeHidden();
  await waitForRefresh(page);

  // Switching modes happens from Settings, so come back to Mine before asserting on it:
  // inactive pages are display:none and every element inside counts as hidden.
  await page.click('.tab[data-page="matches"]');
  await expect(page.locator("#matchList #match-qm6")).toBeVisible();

  await page.click('.tab[data-page="teams"]');
  await expect.poll(() => rankedTeams(page)).toEqual([String(MY), "2056"]);
});

test("researching never overwrites your own stored event data", async ({ page }) => {
  await start(page);
  const before = await page.evaluate((k) => localStorage.getItem(k), KEYS.rankings);
  expect(before).toContain(String(MY));

  await enterResearch(page);

  // The other event's rankings must stay out of the keys holding your own downloads.
  const during = await page.evaluate((k) => localStorage.getItem(k), KEYS.rankings);
  expect(during).toBe(before);
  const matchesDuring = await page.evaluate((k) => localStorage.getItem(k), KEYS.matches);
  expect(matchesDuring).toContain("qm6");
  expect(matchesDuring).not.toContain("qm3");
});

test("your saved team and event are untouched by research mode", async ({ page }) => {
  await start(page);
  await enterResearch(page);

  const cfg = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEYS.config);
  expect(cfg.eventKey).toBe(MY_EVENT);
  expect(cfg.team).toBe(MY);
});

test("research mode survives a reload, still clearly flagged", async ({ page }) => {
  await start(page);
  await enterResearch(page);

  await page.reload();
  await page.waitForSelector(".tab");
  await expect(page.locator("#researchBanner")).toBeVisible();
  await expect(page.locator("#researchBanner")).toContainText("Ontario District Champs");
});
