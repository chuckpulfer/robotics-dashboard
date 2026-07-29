import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, readConfig, switchTeam, offeredEvents, KEYS, DEFAULT_CONFIG } from "./helpers/app.js";

/**
 * Regression cover for the empty event list after switching teams.
 *
 * Switching teams cleared the cached event list but kept the ETags standing for it.
 * TBA then answered 304 for data the app no longer held, so the list ended up empty —
 * permanently, since the ETag kept matching on every retry.
 *
 * Switching now happens from the header chip; there is no staged picker with a Save
 * button any more, so a team change takes effect immediately.
 */

const EVENTS = {
  10021: [{ key: "2026iri", name: "Indiana Robotics Invitational", start_date: "2026-07-10", end_date: "2026-07-11" }],
  2056: [
    { key: "2026onta", name: "Ontario District Champs", start_date: "2026-04-01", end_date: "2026-04-03" },
    { key: "2026cmptx", name: "Einstein", start_date: "2026-04-20", end_date: "2026-04-23" },
  ],
};
// 9999 has no events; it must be reachable in the switcher to be switched to.
const DIRECTORY = [
  { key: "frc10021", team_number: 10021, nickname: "Golden Gears" },
  { key: "frc2056", team_number: 2056, nickname: "OP Robotics" },
  { key: "frc9999", team_number: 9999, nickname: "No Events" },
];

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });

// Block the service worker: these specs assert on network behaviour, and a controlling
// worker lets cross-origin requests escape page routing.
test.use({ serviceWorkers: "block" });

const start = async (page, state = {}) => {
  await mockTba(page, { teamEvents: EVENTS, directory: DIRECTORY }, { useEtags: true });
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventManual: false }, state });
};

test("switching teams loads the new team's events", async ({ page }) => {
  await start(page);
  await switchTeam(page, 2056);

  expect((await offeredEvents(page)).sort()).toEqual(["2026cmptx", "2026onta"]);
  expect((await readConfig(page)).eventKey).toBeTruthy();
});

test("switching back to a previous team restores its events", async ({ page }) => {
  await start(page);

  await switchTeam(page, 2056);
  await switchTeam(page, 10021);

  // Before the fix this was an empty list, and stayed empty on every later switch.
  expect(await offeredEvents(page)).toEqual(["2026iri"]);
  expect((await readConfig(page)).eventKey).toBe("2026iri");

  await switchTeam(page, 2056);
  expect((await offeredEvents(page)).sort()).toEqual(["2026cmptx", "2026onta"]);
});

test("an install left with stale ETags and no cached events repairs itself", async ({ page }) => {
  // Exactly the broken state the old build left behind.
  await start(page, {
    etags: { "te:10021:2026": 'W/"10021-2026"', "te:10021:2025": 'W/"10021-2025"' },
    teamEvents: null,
  });
  await page.waitForTimeout(1200);

  expect(await offeredEvents(page)).toEqual(["2026iri"]);
});

test("the header never offers another team's events", async ({ page }) => {
  await start(page);
  await expect.poll(async () => await offeredEvents(page)).toEqual(["2026iri"]);

  await switchTeam(page, 2056);
  // 10021's event must not still be sitting there, selectable, under team 2056.
  expect(await offeredEvents(page)).not.toContain("2026iri");
});

test("switching does not keep the previous team's event key", async ({ page }) => {
  await start(page);
  await expect.poll(async () => (await readConfig(page)).eventKey).toBe("2026iri");

  await switchTeam(page, 2056);

  // 2026iri belongs to 10021; the saved key has to come from 2056's own events.
  const { eventKey } = await readConfig(page);
  expect(["2026onta", "2026cmptx"]).toContain(eventKey);
});

test("switching to a team with no events does not keep the old event", async ({ page }) => {
  // Auto-pick cannot rescue this one: there is nothing to pick. Carrying the key over
  // would show the previous team's event data under the new team.
  await start(page);
  await expect.poll(async () => (await readConfig(page)).eventKey).toBe("2026iri");

  await switchTeam(page, 9999);

  expect((await readConfig(page)).eventKey).not.toBe("2026iri");
  expect(await offeredEvents(page)).toEqual([]);
});

test("ETags for discarded data do not survive a team switch", async ({ page }) => {
  await start(page);
  await switchTeam(page, 2056);

  const etags = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), KEYS.etags);
  const stale = Object.keys(etags).filter((k) => k.startsWith("te:10021") || k.startsWith("m:"));
  expect(stale).toEqual([]);
});
