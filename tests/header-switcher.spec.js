import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { openApp, waitForRefresh, KEYS, tbaMatch, tbaRanking } from "./helpers/app.js";

/**
 * The header carries the current team and event, and both chips open one switcher sheet.
 * The property that matters: picking one of your team's events is your own selection,
 * while any other event opens in research mode — so someone else's data still never
 * lands in your saved event.
 */

const MY = 10021;
const MY_EVENT = "2026iri";
const AWAY = "2026onta";

const teamEvents = {
  [MY]: [
    { key: MY_EVENT, name: "Indiana Robotics Invitational", start_date: "2026-07-10", end_date: "2026-07-11" },
    { key: "2026mifoo", name: "Michigan District Foo", start_date: "2026-03-05", end_date: "2026-03-07" },
  ],
  2056: [{ key: "2026onwa", name: "Waterloo District", start_date: "2026-04-01", end_date: "2026-04-03" }],
};

async function mock(page) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    const send = (b) => route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
    });

    const ev = url.match(/team\/frc(\d+)\/events\/(\d+)\/simple/);
    if (ev) return send(ev[2] === "2026" ? teamEvents[ev[1]] ?? [] : []);
    if (/\/events\/\d+\/simple/.test(url)) return send([
      ...teamEvents[MY], ...teamEvents[2056],
      { key: AWAY, name: "Ontario District Champs", start_date: "2026-04-01", end_date: "2026-04-03" },
    ]);
    if (/\/teams\/\d+\/simple/.test(url)) return send([{ key: "frc2056", nickname: "OP Robotics" }]);
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

const start = async (page) => {
  await mock(page);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);
};

const rows = (page) => page.locator("#switcherList .sheetrow");

test("the header shows the current team and event with the refresh button", async ({ page }) => {
  await start(page);
  await expect(page.locator("#teamChipValue")).toHaveText(`${MY} · Golden Gears`);
  await expect(page.locator("#eventChipValue")).toHaveText("Indiana Robotics Invitational");
  await expect(page.locator("#refreshBtn")).toBeVisible();
});

test("the team chip opens the recents and switches team", async ({ page }) => {
  await start(page);
  await page.click("#teamChip");
  await expect(page.locator("#switcher")).toBeVisible();
  await expect(page.locator("#switcherList .sheetgroup").first()).toHaveText("Recent teams");
  await expect(rows(page).first()).toHaveText(new RegExp(String(MY)));

  await page.fill("#switcherSearch", "2056");
  await rows(page).filter({ hasText: "2056" }).first().click();

  await expect(page.locator("#switcher")).toBeHidden();
  await expect(page.locator("#teamChipValue")).toHaveText(/^2056/);
  // The new team's own event is picked up, not the old team's.
  await expect(page.locator("#eventChipValue")).toHaveText("Waterloo District");
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEYS.config)).team).toBe(2056);
});

test("both switched teams stay in the recents for bouncing back", async ({ page }) => {
  await start(page);
  await page.click("#teamChip");
  await page.fill("#switcherSearch", "2056");
  await rows(page).filter({ hasText: "2056" }).first().click();
  await expect(page.locator("#teamChipValue")).toHaveText(/^2056/);

  await page.click("#teamChip");
  await expect(rows(page)).toHaveText([/2056/, new RegExp(String(MY))]);
  await rows(page).filter({ hasText: String(MY) }).first().click();
  await expect(page.locator("#teamChipValue")).toHaveText(new RegExp(`^${MY}`));
});

test("the event chip lists your team's events and switches between them", async ({ page }) => {
  await start(page);
  await page.click("#eventChip");
  await expect(page.locator("#switcherList .sheetgroup").first()).toHaveText(`Team ${MY} events`);
  await expect(rows(page)).toHaveText([/Indiana Robotics Invitational/, /Michigan District Foo/]);

  await rows(page).filter({ hasText: "Michigan District Foo" }).click();
  await expect(page.locator("#eventChipValue")).toHaveText("Michigan District Foo");
  await expect(page.locator("#researchBanner")).toBeHidden();
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEYS.config)).eventKey).toBe("2026mifoo");
});

test("an event your team is not at opens in research mode and leaves your own saved", async ({ page }) => {
  await start(page);
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEYS.config);

  await page.click("#eventChip");
  await page.fill("#switcherSearch", "Ontario");
  await rows(page).filter({ hasText: "Ontario District Champs" }).click();

  await expect(page.locator("#researchBanner")).toBeVisible();
  await expect(page.locator("#eventChipValue")).toHaveText("Ontario District Champs");
  await expect(page.locator("#eventChip")).toHaveClass(/away/);

  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEYS.config);
  expect(after.eventKey).toBe(before.eventKey);
  expect(after.team).toBe(before.team);
});

test("going back to one of your own events leaves research mode", async ({ page }) => {
  await start(page);
  await page.click("#eventChip");
  await page.fill("#switcherSearch", "Ontario");
  await rows(page).filter({ hasText: "Ontario District Champs" }).click();
  await expect(page.locator("#researchBanner")).toBeVisible();

  await page.click("#eventChip");
  await rows(page).filter({ hasText: "Indiana Robotics Invitational" }).click();
  await expect(page.locator("#researchBanner")).toBeHidden();
  await expect(page.locator("#eventChip")).not.toHaveClass(/away/);
});

test("a researched event is remembered for bouncing back", async ({ page }) => {
  await start(page);
  await page.click("#eventChip");
  await page.fill("#switcherSearch", "Ontario");
  await rows(page).filter({ hasText: "Ontario District Champs" }).click();
  await expect(page.locator("#researchBanner")).toBeVisible();

  await page.click("#eventChip");
  await rows(page).filter({ hasText: "Indiana" }).click();

  // Now it should be one tap away under Recent events, without searching again.
  await page.click("#eventChip");
  const groups = await page.locator("#switcherList .sheetgroup").allTextContents();
  expect(groups).toContain("Recent events");
  await expect(rows(page).filter({ hasText: "Ontario District Champs" })).toHaveCount(1);
});

test("recents survive a reload", async ({ page }) => {
  await start(page);
  await page.click("#eventChip");
  await page.fill("#switcherSearch", "Ontario");
  await rows(page).filter({ hasText: "Ontario District Champs" }).click();
  await expect(page.locator("#researchBanner")).toBeVisible();

  await page.reload();
  await page.waitForSelector(".tab");
  await page.click("#eventChip");
  await expect(rows(page).filter({ hasText: "Ontario District Champs" })).toHaveCount(1);
});

test("the sheet closes on the backdrop and the Close button", async ({ page }) => {
  await start(page);
  await page.click("#teamChip");
  await page.click("#switcherClose");
  await expect(page.locator("#switcher")).toBeHidden();

  await page.click("#teamChip");
  await page.mouse.click(5, 5); // the dim area above the sheet
  await expect(page.locator("#switcher")).toBeHidden();
});

test("the directory arriving late still fills the team search", async ({ page }) => {
  await start(page);
  // Opening the chip is what starts the download, so the sheet is up before it lands.
  await page.click("#teamChip");
  await page.fill("#switcherSearch", "2056");
  await expect(page.locator('#switcherList [data-pick="2056"]')).toBeVisible();
});

/**
 * The Settings research panel carried a Season dropdown, which scoped which season's
 * events were downloaded. It went with the panel, so both seasons are fetched when the
 * event chip opens — otherwise last season's events become unreachable.
 */
test("the event search reaches last season too", async ({ page }) => {
  await start(page);
  const years = [];
  // Registered after the base mock so it takes precedence, and falls back for the rest.
  await page.route("https://www.thebluealliance.com/**", async (route) => {
    const url = route.request().url();
    const y = url.match(/\/events\/(\d+)\/simple/);
    if (y) {
      years.push(y[1]);
      return route.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Expose-Headers": "ETag" },
        body: JSON.stringify(y[1] === "2025"
          ? [{ key: "2025onta", name: "Ontario 2025", start_date: "2025-04-01", end_date: "2025-04-03" }]
          : []),
      });
    }
    return route.fallback();
  });

  await page.click("#eventChip");
  await expect.poll(() => years.sort()).toEqual(["2025", "2026"]);

  await page.fill("#switcherSearch", "Ontario 2025");
  await expect(page.locator('#switcherList [data-pick="2025onta"]')).toBeVisible();
});

test("Settings no longer duplicates the header", async ({ page }) => {
  await start(page);
  await page.click('.tab[data-page="settings"]');
  const summaries = await page.$$eval("#page-settings details summary", (els) => els.map((e) => e.textContent));
  expect(summaries).not.toContain("Research another event");
  // Its event picker and team lookup are the event chip and the All teams tab now.
  for (const id of ["eventPicker", "teamLookup", "researchYear"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  }
  // The manual list refreshes it also held are kept.
  await expect(page.locator("#refreshEventsBtn")).toBeVisible();
  await expect(page.locator("#refreshTeamsBtn")).toBeVisible();
});
