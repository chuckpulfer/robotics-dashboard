import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, openSettings, KEYS } from "./helpers/app.js";

/**
 * The team picker doubles as a recents list: tapping it with nothing typed offers the
 * teams you have saved before, while typing still searches the whole directory.
 */

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const rows = (page) => page.locator("#teamPickerList button[data-team]");
const recents = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), KEYS.recentTeams);

const saveTeam = async (page, number) => {
  await page.fill("#teamPicker", String(number));
  await page.click("#saveTeamBtn");
  await expect(page.locator("#saveTeamBtn")).toHaveText(/Saved!|refresh failed/, { timeout: 40_000 });
  await page.waitForTimeout(2000); // the "Saved!" label reverts before the next save
};

test.beforeEach(async ({ page }) => {
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openSettings(page);
});

test("opens on the recently saved teams, newest first", async ({ page }) => {
  await saveTeam(page, 2056);
  await saveTeam(page, 1024);

  await page.click("#teamPicker");
  await expect(page.locator("#teamPickerList")).toBeVisible();
  // 10021 was the team in place at load, so it is remembered too.
  await expect(rows(page)).toHaveText([/1024/, /2056/, /10021/]);
});

test("says you can type a number or name instead", async ({ page }) => {
  await page.click("#teamPicker");
  await expect(page.locator("#teamPickerHint")).toHaveText(/type any team number or name/i);
  await expect(page.locator("#teamPicker")).toHaveAttribute("placeholder", /type a number or name/i);
});

test("typing searches the directory rather than the recents", async ({ page }) => {
  await saveTeam(page, 2056);

  await page.fill("#teamPicker", "17");
  await expect(rows(page)).toHaveText([/1706/, /1720/, /1732/, /1741/, /1768/, /1792/]);
});

test("picking a recent team fills the box and saves", async ({ page }) => {
  await saveTeam(page, 2056);
  await saveTeam(page, 1024);

  await page.click("#teamPicker");
  await rows(page).filter({ hasText: "2056" }).click();
  await expect(page.locator("#teamPicker")).toHaveValue(/^2056/);

  await page.click("#saveTeamBtn");
  await expect(page.locator("#saveTeamBtn")).toHaveText(/Saved!|refresh failed/, { timeout: 40_000 });
  expect((await recents(page))[0]).toBe(2056);
});

test("keeps at most 20 teams, dropping the oldest", async ({ page }) => {
  const seeded = Array.from({ length: 20 }, (_, i) => 3000 + i);
  await openApp(page, server.baseURL, { state: { recentTeams: seeded } });
  await openSettings(page);
  await saveTeam(page, 2056);

  const list = await recents(page);
  expect(list.length).toBe(20);
  expect(list[0]).toBe(2056);
  expect(list).not.toContain(3019);
});

test("recents survive a reload", async ({ page }) => {
  await saveTeam(page, 2056);
  await page.reload();
  await page.waitForSelector(".tab");
  await openSettings(page);

  await page.click("#teamPicker");
  await expect(rows(page).first()).toHaveText(/2056/);
});
