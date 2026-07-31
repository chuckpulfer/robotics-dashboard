import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { openApp, waitForRefresh, tbaMatch, tbaRanking, DEFAULT_CONFIG } from "./helpers/app.js";

/**
 * A countdown to your next match, pinned to the top of the Mine page so it stays on
 * screen however far down the timeline you scroll, and a link to the event stream while
 * that match is still to come or under way.
 */

const MY = 10021;
const EVENT = "2026iri";

/** Matches are built relative to now so the countdown has something real to count. */
const at = (minutesFromNow) => Math.round(Date.now() / 1000 + minutesFromNow * 60);

async function mock(page, { schedule, webcasts = [] } = {}) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    const send = (b) => route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
    });

    // The full event record, which is the only place TBA puts the webcast.
    if (/\/event\/[^/]+$/.test(url)) return send({ key: EVENT, name: "IRI", webcasts });
    if (/team\/frc\d+\/events\/2026\/simple/.test(url))
      return send([{ key: EVENT, name: "IRI", start_date: "2026-07-10", end_date: "2026-07-11" }]);
    if (/team\/frc\d+\/events\/\d+\/simple/.test(url)) return send([]);
    if (/\/event\/[^/]+\/matches(\/simple)?(\?|$)/.test(url)) return send(schedule);
    if (url.includes("/rankings")) return send({ rankings: [tbaRanking(MY, 3)] });
    return send([]);
  });
  await page.route("https://api.statbotics.io/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const start = async (page, opts) => {
  await mock(page, opts);
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventKey: EVENT } });
  await waitForRefresh(page);
};

// A played match, then one starting in 25 minutes: the second is "next".
const SCHEDULE = [
  tbaMatch({ num: 1, red: [1, 2, 3], blue: [MY, 4, 5], redScore: 40, blueScore: 55, played: true, time: at(-60) }),
  tbaMatch({ num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], time: at(25) }),
];

test("counts down to the next match", async ({ page }) => {
  await start(page, { schedule: SCHEDULE });
  await expect(page.locator("#nextBar")).toBeVisible();
  await expect(page.locator("#nbWhen")).toHaveText(/^in 2[45]:\d\d$/);
  await expect(page.locator("#nbLabel")).toContainText("BLUE");
});

test("the countdown ticks", async ({ page }) => {
  await start(page, { schedule: SCHEDULE });
  const first = await page.locator("#nbWhen").textContent();
  await expect.poll(() => page.locator("#nbWhen").textContent(), { timeout: 5000 }).not.toBe(first);
});

test("stays on screen when the timeline is scrolled", async ({ page }) => {
  const many = Array.from({ length: 12 }, (_, i) =>
    tbaMatch({ num: i + 1, red: [1, 2, 3], blue: [MY, 4, 5], redScore: 40, blueScore: 55, played: true, time: at(-120 + i) }));
  await start(page, { schedule: [...many, tbaMatch({ num: 40, red: [1, 2, 3], blue: [MY, 4, 5], time: at(30) })] });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await expect(page.locator("#nextBar")).toBeInViewport();
});

test("tapping it jumps to the match card", async ({ page }) => {
  const many = Array.from({ length: 12 }, (_, i) =>
    tbaMatch({ num: i + 1, red: [1, 2, 3], blue: [MY, 4, 5], redScore: 40, blueScore: 55, played: true, time: at(-120 + i) }));
  await start(page, { schedule: [...many, tbaMatch({ num: 40, red: [1, 2, 3], blue: [MY, 4, 5], time: at(30) })] });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click("#nextBarGo");
  await page.waitForTimeout(600);
  // The same match id also renders on the Quals page, so scope to the Mine timeline.
  await expect(page.locator("#matchList #match-qm40")).toBeInViewport();
});

test("says Now once the scheduled time has passed", async ({ page }) => {
  await start(page, { schedule: [tbaMatch({ num: 6, red: [1, 2, 3], blue: [MY, 4, 5], time: at(-2) })] });
  await expect(page.locator("#nbWhen")).toHaveText("Now");
  await expect(page.locator("#nextBar")).toHaveClass(/live/);
});

test("shows Final once the score is posted", async ({ page }) => {
  await start(page, {
    schedule: [tbaMatch({ num: 6, red: [1, 2, 3], blue: [MY, 4, 5], redScore: 40, blueScore: 55, played: true, time: at(-30) })],
  });
  await expect(page.locator("#nbWhen")).toHaveText("Final");
});

test.describe("the live stream link", () => {
  test("links to Twitch for an upcoming match", async ({ page }) => {
    await start(page, { schedule: SCHEDULE, webcasts: [{ type: "twitch", channel: "firstinspires31" }] });
    const watch = page.locator("#nbWatch");
    await expect(watch).toBeVisible();
    await expect(watch).toHaveAttribute("href", "https://www.twitch.tv/firstinspires31");
    await expect(watch).toHaveText("▶ Twitch");
    await expect(watch).toHaveAttribute("target", "_blank");
  });

  test("links to YouTube, picking the webcast dated today", async ({ page }) => {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await start(page, {
      schedule: SCHEDULE,
      webcasts: [
        { type: "youtube", channel: "yesterdayVid", date: "2020-01-01" },
        { type: "youtube", channel: "todayVid", date: ymd },
      ],
    });
    await expect(page.locator("#nbWatch")).toHaveAttribute("href", "https://www.youtube.com/watch?v=todayVid");
  });

  test("an unknown webcast type falls back to the event page", async ({ page }) => {
    await start(page, { schedule: SCHEDULE, webcasts: [{ type: "dacast", channel: "12345" }] });
    await expect(page.locator("#nbWatch")).toHaveAttribute("href", `https://www.thebluealliance.com/event/${EVENT}`);
  });

  test("the next-match card carries the link too", async ({ page }) => {
    await start(page, { schedule: SCHEDULE, webcasts: [{ type: "twitch", channel: "firstinspires31" }] });
    await expect(page.locator("#matchList #match-qm6").getByText("▶ Watch live")).toBeVisible();
  });

  test("no link once the match is over", async ({ page }) => {
    await start(page, {
      schedule: [tbaMatch({ num: 6, red: [1, 2, 3], blue: [MY, 4, 5], redScore: 40, blueScore: 55, played: true, time: at(-30) })],
      webcasts: [{ type: "twitch", channel: "firstinspires31" }],
    });
    await expect(page.locator("#nbWatch")).toBeHidden();
  });

  test("no link when the event has no webcast", async ({ page }) => {
    await start(page, { schedule: SCHEDULE, webcasts: [] });
    await expect(page.locator("#nbWatch")).toBeHidden();
    await expect(page.locator("#nextBar")).toBeVisible();
  });
});

test("no bar when there are no matches", async ({ page }) => {
  await start(page, { schedule: [] });
  await expect(page.locator("#nextBar")).toBeHidden();
});
