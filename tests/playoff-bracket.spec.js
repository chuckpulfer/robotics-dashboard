import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { openApp, waitForRefresh, tbaMatch, tbaRanking, DEFAULT_CONFIG } from "./helpers/app.js";

/**
 * The playoff bracket, drawn as a tree.
 *
 * FRC playoffs are double elimination, not the clean binary tree a March Madness bracket
 * is: the lower bracket takes losers from the upper one, and two of its matches mix a
 * loser and a winner from different rounds. So connector lines are drawn only where a
 * pair of matches really does feed one match, and every other feed is named on the box.
 */

const MY = 10021;
const EVENT = "2026iri";

// Eight alliances of three.
const A = [
  [254, 1114, 2056], [MY, 1720, 1002], [118, 148, 2468], [1678, 973, 846],
  [971, 1323, 2910], [4414, 5940, 1671], [604, 3476, 1662], [6800, 1690, 3339],
];
const alliances = A.map((picks, i) => ({
  name: `Alliance ${i + 1}`,
  picks: picks.map((t) => `frc${t}`),
  status: { status: i === 0 ? "won" : "eliminated", record: { wins: 2, losses: 2, ties: 0 } },
}));

const sf = (set, red, blue, rs, bs) =>
  tbaMatch({ key: `sf${set}m1`, comp: "sf", set, num: 1, red, blue, redScore: rs, blueScore: bs, played: true, time: 1_900_000_000 + set * 600 });

// A complete double-elimination run, A1 over A4 in the finals.
const PLAYED = [
  sf(1, A[0], A[7], 90, 60), sf(2, A[3], A[4], 75, 70), sf(3, A[1], A[6], 88, 64), sf(4, A[2], A[5], 70, 80),
  sf(5, A[7], A[4], 55, 66), sf(6, A[6], A[2], 72, 68),
  sf(7, A[0], A[3], 95, 71), sf(8, A[1], A[5], 80, 85),
  sf(9, A[5], A[4], 60, 77), sf(10, A[3], A[6], 83, 64),
  sf(11, A[0], A[5], 99, 77), sf(12, A[4], A[3], 70, 90),
  sf(13, A[5], A[3], 78, 81),
  tbaMatch({ key: "f1m1", comp: "f", set: 1, num: 1, red: A[0], blue: A[3], redScore: 101, blueScore: 88, played: true, time: 1_900_010_000 }),
  tbaMatch({ key: "f1m2", comp: "f", set: 1, num: 2, red: A[0], blue: A[3], redScore: 97, blueScore: 99, played: true, time: 1_900_011_000 }),
  tbaMatch({ key: "f1m3", comp: "f", set: 1, num: 3, red: A[0], blue: A[3], redScore: 110, blueScore: 92, played: true, time: 1_900_012_000 }),
];

async function mock(page, { playoffs = [], allianceList = alliances } = {}) {
  await page.route("https://www.thebluealliance.com/**", (route) => {
    const url = route.request().url();
    const send = (b) => route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
    });
    if (/\/event\/[^/]+$/.test(url)) return send({ key: EVENT, name: "IRI", webcasts: [] });
    if (/team\/frc\d+\/events\/2026\/simple/.test(url))
      return send([{ key: EVENT, name: "IRI", start_date: "2026-07-10", end_date: "2026-07-11" }]);
    if (/team\/frc\d+\/events\/\d+\/simple/.test(url)) return send([]);
    if (url.includes("/alliances")) return send(allianceList);
    if (/\/event\/[^/]+\/matches(\/simple)?(\?|$)/.test(url)) return send(playoffs);
    if (url.includes("/rankings")) return send({ rankings: [tbaRanking(MY, 2)] });
    return send([]);
  });
  await page.route("https://api.statbotics.io/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const openBracket = async (page, opts) => {
  await mock(page, opts);
  await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventKey: EVENT } });
  await waitForRefresh(page);
  await page.click('.tab[data-page="playoffs"]');
  await expect(page.locator(".bracket")).toBeVisible();
};

const boxLabels = (page) =>
  page.$$eval(".bracket .bmatch .bhead span:first-child", (els) => els.map((e) => e.textContent));
const box = (page, label) =>
  page.locator(".bracket .bmatch").filter({ has: page.locator(`.bhead span:text-is("${label}")`) });

test("draws every match of the double-elimination bracket", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  expect(await boxLabels(page)).toEqual([
    "M1", "M2", "M3", "M4", "M7", "M8", "M11",   // upper
    "M5", "M6", "M9", "M10", "M12", "M13",       // lower
    "Finals",
  ]);
  await expect(page.locator(".bhalf-label").first()).toHaveText("Upper bracket");
});

test("round one is seeded from the alliances", async ({ page }) => {
  await openBracket(page, { playoffs: [] });
  // 1 v 8, 4 v 5, 2 v 7, 3 v 6 — the standard FRC pairing.
  await expect(box(page, "M1")).toContainText("254 1114 2056");
  await expect(box(page, "M1")).toContainText("6800 1690 3339");
  await expect(box(page, "M2")).toContainText("1678 973 846");
});

test("matches not yet played name where their alliances come from", async ({ page }) => {
  await openBracket(page, { playoffs: [] });
  await expect(box(page, "M7")).toContainText("Winner of M1");
  await expect(box(page, "M7")).toContainText("Winner of M2");
  // The lower bracket takes losers, and M9 mixes a loser with a winner.
  await expect(box(page, "M5")).toContainText("Loser of M1");
  await expect(box(page, "M9")).toContainText("Loser of M7");
  await expect(box(page, "M9")).toContainText("Winner of M6");
  await expect(box(page, "Finals")).toContainText("Winner of M11");
});

test("played matches carry scores and mark the winner", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  const m1 = box(page, "M1");
  await expect(m1).toContainText("90");
  await expect(m1).toContainText("60");
  // A1 won, so its side is the one flagged.
  await expect(m1.locator(".bside.won")).toHaveCount(1);
  await expect(m1.locator(".bside.won")).toContainText("A1");
});

test("results feed forward into the later rounds", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  // M7 is fed by the winners of M1 and M2 — A1 and A4.
  await expect(box(page, "M7")).toContainText("254 1114 2056");
  await expect(box(page, "M7")).toContainText("1678 973 846");
  await expect(box(page, "M7")).not.toContainText("Winner of");
});

test("my alliance's matches are marked", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  // 10021 is on alliance 2, which plays M3 and M8.
  await expect(box(page, "M3")).toHaveClass(/mine/);
  await expect(box(page, "M8")).toHaveClass(/mine/);
  await expect(box(page, "M1")).not.toHaveClass(/mine/);
});

test("connectors are drawn only where a pair really feeds one match", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  // (M1,M2)->M7, (M3,M4)->M8, (M7,M8)->M11, (M9,M10)->M12. Everything else is
  // cross-bracket and is named on the box instead of being wired up.
  const joined = await page.$$eval(".bracket .bpair.joined", (els) =>
    els.map((e) => [...e.querySelectorAll(".bhead span:first-child")].map((s) => s.textContent).join("+")));
  expect(joined).toEqual(["M1+M2", "M3+M4", "M7+M8", "M9+M10"]);
});

test("the finals show each game of the series and the tally", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  const finals = box(page, "Finals");
  await expect(finals).toContainText("A1 2 – A4 1");
  await expect(finals.locator(".bgame")).toHaveCount(3);
  await expect(finals).toContainText("101");
});

test("scrolls sideways rather than squeezing onto the phone", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  const [scrollW, clientW] = await page.$eval(".bracket-scroll", (e) => [e.scrollWidth, e.clientWidth]);
  expect(scrollW).toBeGreaterThan(clientW);
  // The page itself must not scroll sideways with it.
  const bodyOverflow = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1);
  expect(bodyOverflow).toBe(true);
});

test("the bracket comes before the alliance list", async ({ page }) => {
  await openBracket(page, { playoffs: PLAYED });
  const order = await page.$eval("#playoffContent", (el) => {
    const b = el.querySelector(".bracket-scroll"), a = el.querySelector(".agrid");
    return b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING ? "bracket first" : "alliances first";
  });
  expect(order).toBe("bracket first");
});

test("says so when nothing has been posted yet", async ({ page }) => {
  await openBracket(page, { playoffs: [], allianceList: [] }).catch(() => {});
  await expect(page.locator("#playoffContent")).toContainText("Alliance selection has not been posted");
  await expect(page.locator(".bracket")).toHaveCount(0);
});

/**
 * Before alliance selection TBA has nothing to build a bracket from. Saying only that
 * reads like the app is stuck, which is exactly how it looked at an event with quals
 * nearly finished — so the wait now reports progress and who is currently top eight.
 */
test.describe("waiting for alliance selection", () => {
  const quals = (played, total) =>
    Array.from({ length: total }, (_, i) =>
      tbaMatch({
        num: i + 1, red: [A[0][0], A[1][0], A[2][0]], blue: [A[3][0], A[4][0], A[5][0]],
        redScore: i < played ? 50 : -1, blueScore: i < played ? 40 : -1, played: i < played,
      }));

  async function openWaiting(page, { played = 120, total = 125 } = {}) {
    await page.route("https://www.thebluealliance.com/**", (route) => {
      const url = route.request().url();
      const send = (b) => route.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Expose-Headers": "ETag" }, body: JSON.stringify(b),
      });
      if (/\/event\/[^/]+$/.test(url)) return send({ key: EVENT, name: "WVROX", webcasts: [] });
      if (/team\/frc\d+\/events\/2026\/simple/.test(url))
        return send([{ key: EVENT, name: "WVROX", start_date: "2026-07-31", end_date: "2026-08-01" }]);
      if (/team\/frc\d+\/events\/\d+\/simple/.test(url)) return send([]);
      if (url.includes("/alliances")) return send([]);          // not posted yet
      if (/\/event\/[^/]+\/matches(\/simple)?(\?|$)/.test(url)) return send(quals(played, total));
      if (url.includes("/rankings"))
        return send({ rankings: A.map((a, i) => tbaRanking(a[0], i + 1, 10 - i, i)) });
      return send([]);
    });
    await page.route("https://api.statbotics.io/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await openApp(page, server.baseURL, { config: { ...DEFAULT_CONFIG, eventKey: EVENT } });
    await waitForRefresh(page);
    await page.click('.tab[data-page="playoffs"]');
  }

  test("says how far the qualifications have got", async ({ page }) => {
    await openWaiting(page);
    await expect(page.locator("#playoffContent .empty")).toContainText("120 of 125 qualification matches played");
    await expect(page.locator(".bracket")).toHaveCount(0);
  });

  test("shows who is currently in the top eight", async ({ page }) => {
    await openWaiting(page);
    await expect(page.locator("#playoffContent .acard")).toHaveCount(8);
    const first = page.locator("#playoffContent .acard").first();
    await expect(first).toContainText("#1");
    await expect(first).toContainText(String(A[0][0]));
  });

  test("marks my team in the preview", async ({ page }) => {
    await openWaiting(page);
    // 10021 is A[1][0], ranked second.
    await expect(page.locator("#playoffContent .acard.minecard")).toHaveCount(1);
    await expect(page.locator("#playoffContent .acard.minecard")).toContainText(String(MY));
  });
});
