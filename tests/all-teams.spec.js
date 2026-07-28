import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { openApp, waitForRefresh, tbaMatch, tbaRanking } from "./helpers/app.js";

/**
 * The All teams tab lists the whole TBA directory: number, name, where they are from,
 * and OPR. OPR belongs to an event, so the column is filled from the events that have
 * actually been loaded rather than pretending a global figure exists.
 */

const MY = 10021;
const MY_EVENT = "2026iri";

// Page 0 of the directory; the app asks for 26 pages and the rest answer empty.
const DIRECTORY = [
  { key: "frc10021", team_number: 10021, nickname: "Golden Gears", city: "Novi", state_prov: "Michigan", country: "USA" },
  { key: "frc2056", team_number: 2056, nickname: "OP Robotics", city: "Stoney Creek", state_prov: "Ontario", country: "Canada" },
  { key: "frc1114", team_number: 1114, nickname: "Simbotics", city: "St. Catharines", state_prov: "Ontario", country: "Canada" },
  { key: "frc254", team_number: 254, nickname: "The Cheesy Poofs", city: "San Jose", state_prov: "California", country: "USA" },
  { key: "frc9999", team_number: 9999, nickname: "Retired Robotics", city: "Nowhere", state_prov: "Texas", country: "USA" },
];
// 9999 is absent, so it is the one the Active filter must drop.
const ACTIVE = ["frc10021", "frc2056", "frc1114", "frc254"];

async function mock(page, { oprs = { frc10021: 42.5, frc2056: 61.25 } } = {}) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    const send = (b) => route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
    });

    if (/\/teams\/2026\/0\/keys/.test(url)) return send(ACTIVE);
    if (/\/teams\/\d+\/keys/.test(url)) return send([]);
    if (/\/teams\/0\/simple/.test(url)) return send(DIRECTORY);
    if (/\/teams\/\d+\/simple/.test(url)) return send([]);
    if (/team\/frc\d+\/events\/2026\/simple/.test(url))
      return send([{ key: MY_EVENT, name: "Indiana Robotics Invitational", start_date: "2026-07-10", end_date: "2026-07-11" }]);
    if (/team\/frc\d+\/events\/\d+\/simple/.test(url)) return send([]);
    if (url.includes("/oprs")) return send({ oprs });
    if (url.includes("/rankings")) return send({ rankings: [tbaRanking(MY, 3)] });
    if (url.includes("/matches")) return send([tbaMatch({ num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], played: true })]);
    return send([]);
  });
  await page.route("https://api.statbotics.io/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const openAll = async (page) => {
  await page.click('.tab[data-page="allteams"]');
  await expect(page.locator("#page-allteams")).toBeVisible();
  // The directory downloads on first open of the tab.
  await expect(page.locator("#allTeamsList .allteam-item").first()).toBeVisible();
};
const rows = (page) => page.locator("#allTeamsList .allteam-item");
const cells = (page) => rows(page).evaluateAll((els) =>
  els.map((e) => [...e.children].map((c) => c.textContent.trim())));

const start = async (page) => {
  await mock(page);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
};

test("has its own tab", async ({ page }) => {
  await start(page);
  await expect(page.locator('.tab[data-page="allteams"]')).toHaveText("All");
});

test("lists number, name, state/country and OPR", async ({ page }) => {
  await start(page);
  await openAll(page);

  const header = await page.$$eval("#allTeamsList .allteams-header > *", (els) => els.map((e) => e.textContent.trim()));
  expect(header).toEqual(["Team", "Name", "State / Country", "OPR"]);

  // Sorted by number, and the country is dropped for USA teams to save the column.
  expect(await cells(page)).toEqual([
    ["254", "The Cheesy Poofs", "California", "—"],
    ["1114", "Simbotics", "Ontario, Canada", "—"],
    ["2056", "OP Robotics", "Ontario, Canada", "61.3"],
    ["9999", "Retired Robotics", "Texas", "—"],
    ["10021 ⭐", "Golden Gears", "Michigan", "42.5"],
  ]);
});

test("the filter matches number, name and location", async ({ page }) => {
  await start(page);
  await openAll(page);

  await page.fill("#allTeamSearch", "simb");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Simbotics");

  await page.fill("#allTeamSearch", "Ontario");
  await expect(rows(page)).toHaveCount(2);

  await page.fill("#allTeamSearch", "100");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("10021");
});

test("the active checkbox drops teams that are not competing this season", async ({ page }) => {
  await start(page);
  await openAll(page);
  await expect(rows(page)).toHaveCount(5);

  await page.check("#activeOnly");
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).filter({ hasText: "Retired Robotics" })).toHaveCount(0);
  await expect(page.locator("#allTeamsNote")).toContainText(`4 active ${2026} teams`);

  await page.uncheck("#activeOnly");
  await expect(rows(page)).toHaveCount(5);
});

test("the filter and the active checkbox combine", async ({ page }) => {
  await start(page);
  await openAll(page);
  await page.check("#activeOnly");
  await page.fill("#allTeamSearch", "Texas");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator("#allTeamsNote")).toHaveText("No teams match this filter.");
});

test("tapping a team opens its season with rank and playoff result per event", async ({ page }) => {
  await start(page);
  await openAll(page);
  await rows(page).filter({ hasText: "Simbotics" }).click();

  await expect(page.locator("#page-team")).toBeVisible();
  await expect(page.locator("#teamPage")).toContainText("1114");

  // Back returns to the tab it was opened from.
  await page.click("#teamPageBack");
  await expect(page.locator("#page-allteams")).toBeVisible();
});

test("OPR carries over from an event once it has been loaded", async ({ page }) => {
  await start(page);
  await openAll(page);
  // 2056 is at the loaded event, so its OPR is known even though it is not my team.
  await expect(rows(page).filter({ hasText: "OP Robotics" })).toContainText("61.3");
  // 254 is at no event we have loaded, so the column is honest about not knowing.
  await expect(rows(page).filter({ hasText: "Cheesy Poofs" })).toContainText("—");
  await expect(page.locator("#allTeamsNote")).toContainText("OPR comes from the events you have loaded");
});

test("the OPR catalogue survives a reload", async ({ page }) => {
  await start(page);
  await openAll(page);
  await expect(rows(page).filter({ hasText: "OP Robotics" })).toContainText("61.3");

  await page.reload();
  await page.waitForSelector(".tab");
  await openAll(page);
  await expect(rows(page).filter({ hasText: "OP Robotics" })).toContainText("61.3");
});

test("says what to do when there is no API key", async ({ page }) => {
  await mock(page);
  await openApp(page, server.baseURL, {
    config: { eventKey: MY_EVENT, tbaKey: "", refreshSeconds: 300, team: MY, eventManual: true, statbotics: false },
  });
  await page.click('.tab[data-page="allteams"]');
  await expect(page.locator("#allTeamsNote")).toContainText("Add a TBA API key");
});

/**
 * The filter keeps a history, the way the team and event pickers do. It is recorded when
 * a filter settles — never per keystroke, or the list fills with prefixes of the word
 * actually wanted.
 */
test.describe("filter history", () => {
  const suggestions = (page) => page.locator("#allTeamSearchList [data-filter]");

  const useFilter = async (page, text) => {
    await page.fill("#allTeamSearch", text);
    await page.locator("#allTeamSearch").blur();
  };

  test("a used filter comes back as a suggestion", async ({ page }) => {
    await start(page);
    await openAll(page);
    await useFilter(page, "Ontario");

    await page.fill("#allTeamSearch", "");
    await page.click("#allTeamSearch");
    await expect(page.locator("#allTeamSearchList")).toBeVisible();
    await expect(suggestions(page)).toHaveText(["Ontario"]);

    await suggestions(page).first().click();
    await expect(page.locator("#allTeamSearch")).toHaveValue("Ontario");
    await expect(rows(page)).toHaveCount(2);
  });

  test("keeps them newest first, without duplicates", async ({ page }) => {
    await start(page);
    await openAll(page);
    await useFilter(page, "Ontario");
    await useFilter(page, "Simbotics");
    await useFilter(page, "ontario"); // same filter, different case

    await page.fill("#allTeamSearch", "");
    await page.click("#allTeamSearch");
    await expect(suggestions(page)).toHaveText(["ontario", "Simbotics"]);
  });

  test("does not record every keystroke", async ({ page }) => {
    await start(page);
    await openAll(page);
    // Typed but never settled: no blur, no Enter, no team opened.
    await page.type("#allTeamSearch", "Onta");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gg_recent_filters_v1") || "[]"));
    expect(stored).toEqual([]);
  });

  test("a single character is not worth remembering", async ({ page }) => {
    await start(page);
    await openAll(page);
    await useFilter(page, "O");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gg_recent_filters_v1") || "[]"));
    expect(stored).toEqual([]);
  });

  test("opening a team records the filter that found it", async ({ page }) => {
    await start(page);
    await openAll(page);
    await page.fill("#allTeamSearch", "Simb");
    await rows(page).first().click();
    await expect(page.locator("#page-team")).toBeVisible();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gg_recent_filters_v1") || "[]"));
    expect(stored).toEqual(["Simb"]);
  });

  test("the history is capped at 10", async ({ page }) => {
    await start(page);
    await openAll(page);
    for (let i = 0; i < 12; i++) await useFilter(page, `filter${i}`);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gg_recent_filters_v1") || "[]"));
    expect(stored.length).toBe(10);
    expect(stored[0]).toBe("filter11");
    expect(stored).not.toContain("filter0");
  });

  test("suggestions only show while the box is empty", async ({ page }) => {
    await start(page);
    await openAll(page);
    await useFilter(page, "Ontario");

    await page.fill("#allTeamSearch", "");
    await page.click("#allTeamSearch");
    await expect(page.locator("#allTeamSearchList")).toBeVisible();
    await page.fill("#allTeamSearch", "S");
    await expect(page.locator("#allTeamSearchList")).toBeHidden();
  });

  test("the history survives a reload", async ({ page }) => {
    await start(page);
    await openAll(page);
    await useFilter(page, "Ontario");

    await page.reload();
    await page.waitForSelector(".tab");
    await openAll(page);
    await page.click("#allTeamSearch");
    await expect(suggestions(page)).toHaveText(["Ontario"]);
  });
});
