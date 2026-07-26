import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, waitForRefresh, tbaMatch, tbaRanking, tbaAlliance } from "./helpers/app.js";

/**
 * Finished matches link to their TBA-posted video.
 *
 * Locators name their container: the Mine and Quals lists render the same match with
 * the same element id, so an unscoped "#match-qm6" matches two nodes.
 *
 * The `videos` field only exists on the full match record, so this also guards the
 * endpoint choice: switching back to /matches/simple would silently drop every link.
 */

const MY = 10021;
const DATA = {
  matches: [
    tbaMatch({ num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], redScore: 84, blueScore: 71, played: true, video: "abc123XYZ" }),
    // Played, but TBA has not posted a video for it.
    tbaMatch({ num: 11, red: [2377, MY, 359], blue: [2056, 1024, 3176], redScore: 66, blueScore: 52, played: true }),
    tbaMatch({ num: 27, red: [1792, 1768, 8608], blue: [5687, 4028, MY] }),
    tbaMatch({ comp: "sf", set: 1, num: 1, red: [MY, 2056, 2767], blue: [469, 3641, 8085], redScore: 90, blueScore: 60, played: true, video: "playoffVid" }),
  ],
  rankings: [tbaRanking(MY, 7, 8, 3)],
  alliances: [tbaAlliance([MY, 2056, 2767])],
};

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

test("a finished match links to its video", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  const link = page.locator("#matchList #match-qm6 .videolink");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123XYZ");
  // Opening in place would lose the dashboard mid-event.
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener");
});

test("a match with no posted video shows no link", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  await expect(page.locator("#matchList #match-qm6 .videolink")).toHaveCount(1);
  await expect(page.locator("#matchList #match-qm11 .videolink")).toHaveCount(0);
});

test("an unplayed match shows no link", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  await expect(page.locator("#matchList #match-qm27 .videolink")).toHaveCount(0);
});

test("the link appears on the Quals tab too", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  await page.click('.tab[data-page="allmatches"]');
  await page.waitForSelector("#allMatchList .hero");
  await expect(page.locator("#allMatchList #match-qm6 .videolink")).toHaveAttribute(
    "href", "https://www.youtube.com/watch?v=abc123XYZ");
});

test("the playoff bracket links to its video", async ({ page }) => {
  await mockTba(page, DATA);
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  await page.click('.tab[data-page="playoffs"]');
  await page.waitForSelector("#playoffContent .pmatch");
  await expect(page.locator("#playoffContent .videolink").first()).toHaveAttribute(
    "href", "https://www.youtube.com/watch?v=playoffVid");
});

test("self-hosted TBA videos are ignored in favour of YouTube", async ({ page }) => {
  await mockTba(page, {
    ...DATA,
    matches: [
      tbaMatch({
        num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], redScore: 84, blueScore: 71, played: true,
        videos: [{ type: "tba", key: "some/self-hosted/path" }, { type: "youtube", key: "realVideo" }],
      }),
    ],
  });
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  await expect(page.locator("#matchList #match-qm6 .videolink")).toHaveAttribute(
    "href", "https://www.youtube.com/watch?v=realVideo");
});

test("a match carrying only a self-hosted video gets no link", async ({ page }) => {
  await mockTba(page, {
    ...DATA,
    matches: [
      tbaMatch({
        num: 6, red: [8085, 3641, 469], blue: [MY, 2056, 2767], redScore: 84, blueScore: 71, played: true,
        videos: [{ type: "tba", key: "some/self-hosted/path" }],
      }),
    ],
  });
  await openApp(page, server.baseURL);
  await waitForRefresh(page);

  await expect(page.locator("#matchList #match-qm6")).toBeVisible();
  await expect(page.locator("#matchList #match-qm6 .videolink")).toHaveCount(0);
});
