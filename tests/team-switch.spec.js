import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, openSettings, readConfig, KEYS, DEFAULT_CONFIG } from "./helpers/app.js";

/**
 * Regression cover for the empty event dropdown after switching teams.
 *
 * Switching teams cleared the cached event list but kept the ETags standing for it.
 * TBA then answered 304 for data the app no longer held, so the dropdown ended up
 * empty — permanently, since the ETag kept matching on every retry.
 */

const EVENTS = {
  10021: [{ key: "2026iri", name: "Indiana Robotics Invitational", start_date: "2026-07-10", end_date: "2026-07-11" }],
  2056: [
    { key: "2026onta", name: "Ontario District Champs", start_date: "2026-04-01", end_date: "2026-04-03" },
    { key: "2026cmptx", name: "Einstein", start_date: "2026-04-20", end_date: "2026-04-23" },
  ],
};

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });

// Block the service worker: these specs assert on network behaviour, and a controlling
// worker lets cross-origin requests escape page routing.
test.use({ serviceWorkers: "block" });

const eventOptions = (page) =>
  page.evaluate(() => ({
    options: [...document.getElementById("eventSelect").options].map((o) => o.value).filter(Boolean),
    value: document.getElementById("eventSelect").value,
  }));

async function switchTeam(page, team) {
  await page.fill("#teamPicker", String(team));
  await page.click("#saveTeamBtn");
  await expect(page.locator("#saveTeamBtn")).not.toHaveText("Saving…", { timeout: 40_000 });
  await page.waitForTimeout(400);
}

test("switching teams loads the new team's events", async ({ page }) => {
  await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
  await openSettings(page);

  await switchTeam(page, 2056);

  const { options, value } = await eventOptions(page);
  expect(options.sort()).toEqual(["2026cmptx", "2026onta"]);
  expect(value).toBeTruthy();
});

test("switching back to a previous team restores its events", async ({ page }) => {
  await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
  await openSettings(page);

  await switchTeam(page, 2056);
  await switchTeam(page, 10021);

  // Before the fix this was an empty dropdown, and stayed empty on every later save.
  expect((await eventOptions(page)).options).toEqual(["2026iri"]);
  expect((await eventOptions(page)).value).toBe("2026iri");

  await switchTeam(page, 2056);
  expect((await eventOptions(page)).options.sort()).toEqual(["2026cmptx", "2026onta"]);
});

test("an install left with stale ETags and no cached events repairs itself", async ({ page }) => {
  await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
  // Exactly the broken state the old build left behind.
  await openApp(page, server.baseURL, {
    config: { ...DEFAULT_CONFIG, eventManual: false },
    state: {
      etags: { "te:10021:2026": 'W/"10021-2026"', "te:10021:2025": 'W/"10021-2025"' },
      teamEvents: null,
    },
  });
  await openSettings(page);
  await page.waitForTimeout(1200);

  expect((await eventOptions(page)).options).toEqual(["2026iri"]);
});

test.describe("the dropdown never shows another team's events", () => {
  test("typing a different team clears the event list", async ({ page }) => {
    await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
    await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
    await openSettings(page);
    await expect.poll(async () => (await eventOptions(page)).options).toEqual(["2026iri"]);

    await page.fill("#teamPicker", "2056");

    // 10021's event must not still be sitting there, selectable, under team 2056.
    const { options, value } = await eventOptions(page);
    expect(options).toEqual([]);
    expect(value).toBe("");
    await expect(page.locator("#eventSelect")).toContainText("Save to load events for team 2056");
  });

  test("picking a team from the suggestions clears it too", async ({ page }) => {
    await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
    await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
    await openSettings(page);

    await page.click("#teamPicker");
    await page.fill("#teamPicker", "2056");
    const suggestion = page.locator('#teamPickerList [data-team="2056"]');
    await expect(suggestion).toBeVisible();
    await suggestion.dispatchEvent("pointerdown");

    expect((await eventOptions(page)).options).toEqual([]);
  });

  test("typing back to the saved team restores its events", async ({ page }) => {
    await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
    await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
    await openSettings(page);
    await expect.poll(async () => (await eventOptions(page)).options).toEqual(["2026iri"]);

    await page.fill("#teamPicker", "2056");
    expect((await eventOptions(page)).options).toEqual([]);

    await page.fill("#teamPicker", "10021");
    expect((await eventOptions(page)).options).toEqual(["2026iri"]);
  });

  test("saving does not keep the previous team's event key", async ({ page }) => {
    await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
    await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
    await openSettings(page);
    await expect.poll(async () => (await readConfig(page)).eventKey).toBe("2026iri");

    await switchTeam(page, 2056);

    // 2026iri belongs to 10021; the saved key has to come from 2056's own events.
    const { eventKey } = await readConfig(page);
    expect(["2026onta", "2026cmptx"]).toContain(eventKey);
  });

  test("switching to a team with no events does not keep the old event", async ({ page }) => {
    // Auto-pick cannot rescue this one: there is nothing to pick. Carrying the key over
    // would show the previous team's event data under the new team.
    await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
    await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
    await openSettings(page);
    await expect.poll(async () => (await readConfig(page)).eventKey).toBe("2026iri");

    await switchTeam(page, 9999); // absent from EVENTS, so the API returns none

    expect((await readConfig(page)).eventKey).not.toBe("2026iri");
    expect((await eventOptions(page)).options).toEqual([]);
  });
});

test("ETags for discarded data do not survive a team switch", async ({ page }) => {
  await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
  await openSettings(page);

  await switchTeam(page, 2056);

  const etags = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), KEYS.etags);
  const stale = Object.keys(etags).filter((k) => k.startsWith("te:10021") || k.startsWith("m:"));
  expect(stale).toEqual([]);
});
