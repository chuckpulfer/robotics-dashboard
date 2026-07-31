import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, waitForRefresh, KEYS, tbaMatch, tbaRanking } from "./helpers/app.js";

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

// An offseason event with no teams yet is exactly the case that was invisible.
const EVENTS_2026 = [
  { key: MY_EVENT, name: "Indiana Robotics Invitational", start_date: "2026-07-10", end_date: "2026-07-11" },
  { key: "2026wvrox", name: "WVROX", start_date: "2026-08-15", end_date: "2026-08-16" },
];
const EVENTS_2025 = [
  { key: "2025onta", name: "Ontario District Champs", start_date: "2025-04-01", end_date: "2025-04-03" },
];

async function mock(page, { oprs = { frc10021: 42.5, frc2056: 61.25 }, failPages = new Set(), onRequest = null } = {}) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    if (onRequest) onRequest(url);
    // Reproduces a page that TBA drops under a burst of parallel requests.
    const dir = url.match(/\/teams\/(\d+)\/simple/);
    const yr = url.match(/\/teams\/\d{4}\/(\d+)\/keys/);
    const page_ = dir ? `dir${dir[1]}` : yr ? `yr${yr[1]}` : null;
    if (page_ && failPages.has(page_)) {
      failPages.delete(page_); // fails once, so a retry can succeed
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }
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
    if (/\/events\/(\d+)\/simple/.test(url))
      return send(RegExp.$1 === "2026" ? EVENTS_2026 : EVENTS_2025);
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

/**
 * Opens the tab. Active-this-season now defaults to on, so specs about the directory as
 * a whole turn it off explicitly rather than depending on the default either way.
 */
const openAll = async (page, { active = false } = {}) => {
  await page.click('.tab[data-page="allteams"]');
  await expect(page.locator("#page-allteams")).toBeVisible();
  if ((await page.isChecked("#activeOnly")) !== active) await page.setChecked("#activeOnly", active);
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

test("active this season is on by default", async ({ page }) => {
  await start(page);
  await page.click('.tab[data-page="allteams"]');
  await expect(page.locator("#activeOnly")).toBeChecked();
  await expect(rows(page).filter({ hasText: "Retired Robotics" })).toHaveCount(0);
  await expect(page.locator("#activeOnlyLabel")).toHaveText("Active this season");
});

test("the choice is remembered across a reload", async ({ page }) => {
  await start(page);
  await openAll(page, { active: false });
  await page.reload();
  await page.waitForSelector(".tab");
  await page.click('.tab[data-page="allteams"]');
  await expect(page.locator("#activeOnly")).not.toBeChecked();
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

/**
 * TBA pages both team lists by team number. Losing one page silently drops a whole
 * 500-number band — and team 254 lives on page 0, so a single dropped page was enough
 * to make a team that is plainly competing look retired.
 */
test.describe("a dropped page must not become permanent", () => {
  test("retries the page that failed, so 254 still arrives", async ({ page }) => {
    await mock(page, { failPages: new Set(["dir0", "yr0"]) });
    await openApp(page, server.baseURL);
    await waitForRefresh(page);
    await openAll(page);

    await page.check("#activeOnly");
    await page.fill("#allTeamSearch", "254");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("The Cheesy Poofs");
  });

  test("a partial download is not cached as complete", async ({ page }) => {
    // Fails on both the first attempt and the retry, so the copy really is short.
    await page.route("https://www.thebluealliance.com/**", (route) => {
      const url = route.request().url();
      const send = (b) => route.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
      });
      if (/\/teams\/0\/simple/.test(url)) return route.fulfill({ status: 503, body: "{}" });
      if (/\/teams\/1\/simple/.test(url)) return send([DIRECTORY[0]]);
      if (/\/teams\/\d+\/simple/.test(url)) return send([]);
      if (/\/teams\/\d+\/keys/.test(url)) return send([]);
      if (/team\/frc\d+\/events\/\d+\/simple/.test(url)) return send([]);
      return send([]);
    });
    await openApp(page, server.baseURL);
    await page.click('.tab[data-page="allteams"]');
    await page.setChecked("#activeOnly", false);
    await expect(page.locator("#allTeamsList .allteam-item").first()).toBeVisible();

    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem("gg_all_teams_v2")));
    expect(cache.complete).toBe(false);
    await expect(page.locator("#allTeamsNote")).toContainText("Part of the list failed to download");
  });

  test("a cache left partial is retried on the next visit, not kept forever", async ({ page }) => {
    const seen = [];
    await mock(page, { onRequest: (u) => seen.push(u) });
    // Seed the state a dropped page used to leave behind: teams present, complete false.
    await openApp(page, server.baseURL, {
      state: { allTeams: { updated: Date.now(), complete: false, teams: { 10021: "Golden Gears" }, loc: {} } },
    });
    await waitForRefresh(page);
    seen.length = 0;
    await openAll(page);

    await expect
      .poll(() => seen.filter((u) => /\/teams\/\d+\/simple/.test(u)).length)
      .toBeGreaterThan(0);
    await page.fill("#allTeamSearch", "254");
    await expect(rows(page)).toHaveCount(1);
  });

  test("a complete cache is not re-downloaded", async ({ page }) => {
    const seen = [];
    await mock(page, { onRequest: (u) => seen.push(u) });
    await openApp(page, server.baseURL);
    await waitForRefresh(page);
    await openAll(page);
    await expect.poll(async () =>
      (await page.evaluate(() => JSON.parse(localStorage.getItem("gg_all_teams_v2"))?.complete)) === true).toBe(true);

    seen.length = 0;
    await page.click('.tab[data-page="matches"]');
    await page.click('.tab[data-page="allteams"]');
    await page.waitForTimeout(500);
    expect(seen.filter((u) => /\/teams\/\d+\/simple/.test(u))).toEqual([]);
  });

  test("the directory is fetched a few pages at a time, not all at once", async ({ page }) => {
    let inFlight = 0, peak = 0;
    await page.route("https://www.thebluealliance.com/**", async (route) => {
      const url = route.request().url();
      const isPage = /\/teams\/\d+\/simple/.test(url);
      if (isPage) { inFlight++; peak = Math.max(peak, inFlight); }
      const send = (b) => route.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
      });
      if (isPage) await new Promise((r) => setTimeout(r, 40));
      try {
        if (/\/teams\/0\/simple/.test(url)) return await send(DIRECTORY);
        if (/\/teams\/\d+\/simple/.test(url)) return await send([]);
        if (/\/teams\/\d+\/keys/.test(url)) return await send([]);
        return await send([]);
      } finally { if (isPage) inFlight--; }
    });
    await openApp(page, server.baseURL);
    await page.click('.tab[data-page="allteams"]');
    await page.setChecked("#activeOnly", false);
    await expect(page.locator("#allTeamsList .allteam-item").first()).toBeVisible();
    expect(peak).toBeLessThanOrEqual(5);
  });
});


/**
 * The tab shows either all teams or all events. An event with no teams registered yet is
 * still a real event, so it has to appear — the reason it did not was a cached event
 * list that was downloaded once and then kept forever.
 */
test.describe("events mode", () => {
  const eventRows = (page) => page.locator("#allTeamsList .allevent-item[data-event]");

  const openEvents = async (page) => {
    await page.click('.tab[data-page="allteams"]');
    await page.click("#segEvents");
    await expect(eventRows(page).first()).toBeVisible();
  };

  test("switches between teams and events", async ({ page }) => {
    await start(page);
    await page.click('.tab[data-page="allteams"]');
    await expect(page.locator("#allTitle")).toHaveText("All teams");

    await page.click("#segEvents");
    await expect(page.locator("#allTitle")).toHaveText("All events");
    await expect(page.locator("#activeOnlyLabel")).toHaveText("2026 events only");
    await expect(page.locator("#allTeamSearch")).toHaveAttribute("placeholder", /event name or key/i);
    await expect(rows(page)).toHaveCount(0); // no team rows in events mode

    await page.click("#segTeams");
    await expect(page.locator("#allTitle")).toHaveText("All teams");
  });

  test("lists an event that has no teams yet", async ({ page }) => {
    await start(page);
    await openEvents(page);
    await expect(eventRows(page).filter({ hasText: "WVROX" })).toHaveCount(1);

    await page.fill("#allTeamSearch", "wvrox");
    await expect(eventRows(page)).toHaveCount(1);
    await expect(eventRows(page).first()).toContainText("2026wvrox");
  });

  test("the season checkbox widens to earlier seasons", async ({ page }) => {
    await start(page);
    await openEvents(page);
    await expect(eventRows(page).filter({ hasText: "Ontario" })).toHaveCount(0);

    await page.setChecked("#activeOnly", false);
    await expect(eventRows(page).filter({ hasText: "Ontario" })).toHaveCount(1);
  });

  test("tapping an event switches to it", async ({ page }) => {
    await start(page);
    await openEvents(page);
    await eventRows(page).filter({ hasText: "WVROX" }).click();

    // Not one of my team's events, so it opens in research mode and leaves mine saved.
    await expect(page.locator("#eventChipValue")).toHaveText("WVROX");
    await expect(page.locator("#researchBanner")).toBeVisible();
    expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEYS.config)).eventKey).toBe(MY_EVENT);
  });

  test("the mode is remembered across a reload", async ({ page }) => {
    await start(page);
    await openEvents(page);
    await page.reload();
    await page.waitForSelector(".tab");
    await page.click('.tab[data-page="allteams"]');
    await expect(page.locator("#allTitle")).toHaveText("All events");
  });
});

/**
 * Both lists were downloaded once and kept forever, so a team or event registered with
 * FIRST afterwards stayed invisible until app data was cleared by hand.
 */
test.describe("stale caches", () => {
  const eventsFetched = async (page, seed) => {
    const seen = [];
    await mock(page, { onRequest: (u) => seen.push(u) });
    await openApp(page, server.baseURL, { state: { allEvents: seed } });
    await page.click('.tab[data-page="allteams"]');
    await page.click("#segEvents");
    await page.waitForTimeout(800);
    // Anchored on /v3/: the team's own /team/frcN/events/YYYY/simple would match a
    // looser pattern and make a skipped download look like it happened.
    return seen.filter((u) => /\/v3\/events\/\d+\/simple/.test(u)).length;
  };

  test("a day-old event list is re-downloaded", async ({ page }) => {
    const yesterday = Date.now() - 25 * 60 * 60 * 1000;
    const n = await eventsFetched(page, { 2026: { updated: yesterday, events: [EVENTS_2026[0]] } });
    expect(n).toBeGreaterThan(0);
    await expect(page.locator('#allTeamsList [data-event="2026wvrox"]')).toBeVisible();
  });

  test("a fresh event list is left alone", async ({ page }) => {
    const n = await eventsFetched(page, { 2026: { updated: Date.now(), events: [EVENTS_2026[0]] } });
    // Only the other season is fetched; this year's copy is current.
    expect(n).toBeLessThanOrEqual(1);
  });

  test("a week-old team directory is re-downloaded", async ({ page }) => {
    const seen = [];
    await mock(page, { onRequest: (u) => seen.push(u) });
    await openApp(page, server.baseURL, {
      state: { allTeams: { updated: Date.now() - 8 * 24 * 60 * 60 * 1000, complete: true, teams: { 10021: "Golden Gears" }, loc: {} } },
    });
    seen.length = 0;
    await page.click('.tab[data-page="allteams"]');
    await expect.poll(() => seen.filter((u) => /\/teams\/\d+\/simple/.test(u)).length).toBeGreaterThan(0);
  });
});
