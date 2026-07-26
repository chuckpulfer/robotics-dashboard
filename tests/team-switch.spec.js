import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, openSettings, KEYS, DEFAULT_CONFIG } from "./helpers/app.js";

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

test("ETags for discarded data do not survive a team switch", async ({ page }) => {
  await mockTba(page, { teamEvents: EVENTS }, { useEtags: true });
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false } });
  await openSettings(page);

  await switchTeam(page, 2056);

  const etags = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), KEYS.etags);
  const stale = Object.keys(etags).filter((k) => k.startsWith("te:10021") || k.startsWith("m:"));
  expect(stale).toEqual([]);
});
