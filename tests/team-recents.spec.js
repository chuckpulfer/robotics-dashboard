import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, switchTeam, KEYS } from "./helpers/app.js";

/**
 * The team chip doubles as a recents list: open it with nothing typed and the teams you
 * have used before are one tap away, while typing searches the whole directory.
 */

const DIRECTORY = [
  { key: "frc10021", team_number: 10021, nickname: "Golden Gears" },
  { key: "frc2056", team_number: 2056, nickname: "OP Robotics" },
  { key: "frc1024", team_number: 1024, nickname: "Kil-A-Bytes" },
  { key: "frc1114", team_number: 1114, nickname: "Simbotics" },
];

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const rows = (page) => page.locator("#switcherList [data-pick]");
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), KEYS.recentTeams);

const openTeamChip = async (page) => {
  await page.click("#teamChip");
  await expect(page.locator("#switcher")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await mockTba(page, { directory: DIRECTORY });
  await openApp(page, server.baseURL);
});

test("opens on the recently used teams, newest first", async ({ page }) => {
  await switchTeam(page, 2056);
  await switchTeam(page, 1024);

  await openTeamChip(page);
  await expect(page.locator('#switcherList [data-group="recent"] .sheetgroup')).toHaveText("Recent teams");
  // 10021 was the team in place at load, so it is remembered too.
  await expect(rows(page)).toHaveText([/1024/, /2056/, /10021/]);
});

test("says you can type a team instead", async ({ page }) => {
  await openTeamChip(page);
  await expect(page.locator("#switcherNote")).toContainText(/search to switch to any other team/i);
  await expect(page.locator("#switcherSearch")).toHaveAttribute("placeholder", /search any team/i);
});

test("typing searches the directory rather than the recents", async ({ page }) => {
  await switchTeam(page, 2056);
  await openTeamChip(page);

  await page.fill("#switcherSearch", "1114");
  await expect(page.locator('#switcherList [data-group="search"]')).toBeVisible();
  await expect(rows(page)).toHaveText([/1114/]);
});

test("picking a recent team switches to it", async ({ page }) => {
  await switchTeam(page, 2056);
  await switchTeam(page, 1024);

  await openTeamChip(page);
  await rows(page).filter({ hasText: "2056" }).click();
  await expect(page.locator("#teamChipValue")).toHaveText(/^2056/);
  expect((await stored(page))[0]).toBe(2056);
});

test("keeps at most 20 teams, dropping the oldest", async ({ page }) => {
  const seeded = Array.from({ length: 20 }, (_, i) => 3000 + i);
  await openApp(page, server.baseURL, { state: { recentTeams: seeded } });
  await switchTeam(page, 2056);

  const list = await stored(page);
  expect(list.length).toBe(20);
  expect(list[0]).toBe(2056);
  expect(list).not.toContain(3019);
});

test("recents survive a reload", async ({ page }) => {
  await switchTeam(page, 2056);
  await page.reload();
  await page.waitForSelector(".tab");

  await openTeamChip(page);
  await expect(rows(page).first()).toHaveText(/2056/);
});
