import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import {
  mockTba, openApp, openSettings, readConfig, waitForRefresh,
  DEFAULT_CONFIG, tbaMatch, tbaRanking,
} from "./helpers/app.js";

/**
 * The five-minute match reminder.
 *
 * The app is a static site with no server, so there is no web push: the reminder is
 * polled by the page and shown through the Notification API. Two things make that
 * testable only with care:
 *
 * 1. `Notification` is replaced with a recording stub in an init script, before app.js
 *    runs. Granting the real permission is not enough — nothing in the page can read
 *    back what a real notification said.
 * 2. Service workers are blocked here, so `postNotification` falls through to the
 *    `new Notification` branch, which the stub is. The specs therefore prove the
 *    message and the scheduling, not the iOS service-worker route.
 *
 * The checker also runs once after the first refresh, which is what lets these specs
 * assert on load instead of waiting out the 15-second poll.
 */

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const SOON = () => Math.floor(Date.now() / 1000) + 240;   // inside the 5-minute window
const LATER = () => Math.floor(Date.now() / 1000) + 1800; // well outside it

/**
 * Records every notification the app posts, and controls the permission it sees.
 *
 * The grant is parked in session storage because the init script re-runs on every
 * navigation: a browser remembers that permission was given, so a stub that forgot it on
 * reload would make the app look broken where it is not.
 */
async function stubNotifications(page, permission = "granted") {
  await page.addInitScript((perm) => {
    window.__notes = [];
    const SEAT = "__stub_permission";
    let state = sessionStorage.getItem(SEAT) || perm;
    function Stub(title, opts) {
      window.__notes.push({ title, body: opts?.body ?? "", tag: opts?.tag ?? "" });
    }
    Object.defineProperty(Stub, "permission", { get: () => state });
    Stub.requestPermission = async () => {
      if (state === "default") state = "granted";
      sessionStorage.setItem(SEAT, state);
      return state;
    };
    window.Notification = Stub;
  }, permission);
}

const notes = (page) => page.evaluate(() => window.__notes);
const recheck = (page) => page.evaluate(() => checkMatchReminders());

/**
 * The panel ships collapsed, like every other Settings section, so its controls are not
 * clickable until it is opened. Driven through the summary rather than by setting `open`,
 * so the spec fails if the section stops being a disclosure.
 */
async function openNotifyPanel(page) {
  await openSettings(page);
  await page.click("#notifyPanel summary");
  await expect(page.locator("#notifyEnabled")).toBeVisible();
}

/** One qual match for team 10021, on the given colour, at the given time. */
const myMatch = ({ num = 46, color = "red", time }) =>
  tbaMatch({
    num,
    red: color === "red" ? [10021, 1732, 1792] : [11415, 6721, 3940],
    blue: color === "red" ? [11415, 6721, 3940] : [10021, 1732, 1792],
    time,
  });

async function load(page, { matches = [], notify = true } = {}) {
  await mockTba(page, { matches, rankings: [tbaRanking(10021, 4)] });
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, notify, notifyPromptSeen: true } });
  await waitForRefresh(page);
}

test("reminds five minutes out and names the red alliance", async ({ page }) => {
  await stubNotifications(page);
  await load(page, { matches: [myMatch({ color: "red", time: SOON() })] });

  const [n] = await notes(page);
  expect(n.title).toContain("RED");
  expect(n.title).toContain("Qualification 46");
  expect(n.title).toMatch(/in [1-5] min/);
  expect(n.body).toContain("10021");
  expect(n.body).toContain("RED alliance");
});

test("names the blue alliance when the team is on blue", async ({ page }) => {
  await stubNotifications(page);
  await load(page, { matches: [myMatch({ color: "blue", time: SOON() })] });

  const [n] = await notes(page);
  expect(n.title).toContain("BLUE");
  expect(n.body).toContain("BLUE alliance");
  // The colour has to be unambiguous: no leaking of the other side into the text.
  expect(`${n.title} ${n.body}`).not.toContain("RED");
});

test("stays quiet for a match still half an hour out", async ({ page }) => {
  await stubNotifications(page);
  await load(page, { matches: [myMatch({ color: "red", time: LATER() })] });
  expect(await notes(page)).toEqual([]);
});

test("stays quiet for a match that is not this team's", async ({ page }) => {
  await stubNotifications(page);
  await load(page, {
    matches: [tbaMatch({ num: 12, red: [234, 1023, 27], blue: [1987, 2056, 469], time: SOON() })],
  });
  expect(await notes(page)).toEqual([]);
});

test("reminds once, not on every poll", async ({ page }) => {
  await stubNotifications(page);
  await load(page, { matches: [myMatch({ color: "red", time: SOON() })] });
  expect(await notes(page)).toHaveLength(1);

  await recheck(page);
  await recheck(page);
  expect(await notes(page)).toHaveLength(1);
});

test("does not remind again after a reload", async ({ page }) => {
  await stubNotifications(page);
  await load(page, { matches: [myMatch({ color: "red", time: SOON() })] });
  expect(await notes(page)).toHaveLength(1);

  await page.reload();
  await waitForRefresh(page);
  expect(await notes(page)).toEqual([]);
});

test("stays quiet while the option is off", async ({ page }) => {
  await stubNotifications(page);
  await load(page, { matches: [myMatch({ color: "red", time: SOON() })], notify: false });
  expect(await notes(page)).toEqual([]);
});

test("ships on, with permission the one outstanding step", async ({ page }) => {
  await stubNotifications(page, "default");
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openNotifyPanel(page);

  const panel = page.locator("#notifyPanel");
  await expect(panel.locator("summary")).toHaveText("Match notifications");
  expect((await readConfig(page)).notify).toBe(true);
  // The box tracks what will actually happen, and nothing can until permission is given.
  await expect(page.locator("#notifyEnabled")).not.toBeChecked();
  await expect(page.locator("#notifyStatus")).toContainText("not been asked");
  await expect(page.locator("#notifyEnableBtn")).toBeVisible();
  // The one thing a user cannot guess: it needs the app to be running.
  await expect(panel).toContainText(/open or in the background/);
});

test("an install predating the setting is opted in, not silently left off", async ({ page }) => {
  await stubNotifications(page, "granted");
  await mockTba(page, {});
  // A stored config from before the feature existed simply has no `notify` key.
  const { notify, ...legacy } = DEFAULT_CONFIG;
  await openApp(page, server.baseURL, { config: legacy });

  expect((await readConfig(page)).notify).toBe(true);
});

test("one tap allows and confirms, without hunting for a second button", async ({ page }) => {
  await stubNotifications(page, "default");
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openNotifyPanel(page);

  await page.click("#notifyEnableBtn");
  await expect(page.locator("#notifyStatus .ok")).toContainText("On.");
  await expect(page.locator("#notifyEnableBtn")).toBeHidden();

  // The confirmation doubles as the test: you have seen what a reminder looks like.
  const [n] = await notes(page);
  expect(n.title).toMatch(/Reminders are on/);
  expect(n.body).toContain("5 minutes");
});

test("the prompt up top offers the same thing, and either answer settles it", async ({ page }) => {
  await stubNotifications(page, "default");
  await mockTba(page, {});
  await openApp(page, server.baseURL);

  const bar = page.locator("#notifyPrompt");
  await expect(bar).toBeVisible();
  await bar.locator("[data-notify-dismiss]").click();
  await expect(bar).toBeHidden();

  // And it stays gone, rather than nagging on every launch.
  await page.reload();
  await page.waitForSelector(".tab");
  await expect(bar).toBeHidden();
});

test("the prompt can allow without opening Settings", async ({ page }) => {
  await stubNotifications(page, "default");
  await mockTba(page, {});
  await openApp(page, server.baseURL);

  await page.locator("#notifyPrompt [data-notify-enable]").click();
  await expect(page.locator("#notifyPrompt")).toBeHidden();
  expect((await readConfig(page)).notify).toBe(true);
  expect((await notes(page))[0].title).toMatch(/Reminders are on/);
});

test("says to install first where iOS allows nothing else", async ({ page }) => {
  // A plain iOS Safari tab has no Notification constructor at all, so there is no
  // permission to ask for — only the Home Screen step.
  await page.addInitScript(() => {
    delete window.Notification;
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" });
    Object.defineProperty(navigator, "standalone", { get: () => false });
  });
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openNotifyPanel(page);

  await expect(page.locator("#notifyStatus .warn")).toContainText("Add to Home Screen");
  await expect(page.locator("#notifyEnabled")).toBeDisabled();
  await expect(page.locator("#notifyPrompt")).toBeHidden();
});

test("ticking the box asks permission and saves the preference", async ({ page }) => {
  await stubNotifications(page, "default");
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openNotifyPanel(page);

  await page.check("#notifyEnabled");
  await expect(page.locator("#notifyStatus .ok")).toContainText("On.");
  await expect(page.locator("#notifyEnabled")).toBeChecked();
  expect((await readConfig(page)).notify).toBe(true);

  // And it survives a reload, like the rest of Settings.
  await page.reload();
  await openNotifyPanel(page);
  await expect(page.locator("#notifyEnabled")).toBeChecked();
});

test("un-ticks itself and says so when permission is refused", async ({ page }) => {
  await stubNotifications(page, "denied");
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openNotifyPanel(page);

  // A plain click, not check(): check() asserts the box ends up ticked, and the whole
  // point here is that it does not.
  await page.locator("#notifyEnabled").click();
  await expect(page.locator("#notifyEnabled")).not.toBeChecked();
  await expect(page.locator("#notifyStatus .warn")).toContainText("Blocked");
  // The preference is left alone: wanting reminders is not the same as the browser
  // allowing them, and nothing fires while it says no.
  await expect(page.locator("#notifyEnableBtn")).toBeHidden();
  expect(await notes(page)).toEqual([]);
});

test("an API-section save leaves the notification preference alone", async ({ page }) => {
  await stubNotifications(page);
  await mockTba(page, {});
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, notify: true } });
  await openSettings(page);

  await page.fill("#refreshSeconds", "120");
  await page.click("#saveApiBtn");
  await expect(page.locator("#saveApiBtn")).toHaveText(/Saved!|refresh failed/, { timeout: 40_000 });

  const cfg = await readConfig(page);
  expect(cfg.notify).toBe(true);
  expect(cfg.refreshSeconds).toBe(120);
});

test("the test button previews the real next match", async ({ page }) => {
  await stubNotifications(page, "default");
  await load(page, { matches: [myMatch({ color: "blue", time: LATER() })], notify: false });
  await openNotifyPanel(page);

  await page.click("#notifyTestBtn");
  await expect.poll(() => notes(page).then((n) => n.length)).toBe(1);

  const [n] = await notes(page);
  expect(n.title).toContain("BLUE");
  expect(n.title).toContain("Qualification 46");
  // Forced to the real lead time, so the preview shows what will actually arrive.
  expect(n.title).toContain("in 5 min");
});
