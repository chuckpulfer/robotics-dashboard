/**
 * Helpers for driving the dashboard in tests.
 *
 * Two things here are easy to get wrong and both hide real bugs:
 *
 * 1. The route pattern must be `https://www.thebluealliance.com/**`. A glob like
 *    `**​/thebluealliance.com/**` never matches, because the host is `www.` prefixed
 *    and the pattern demands a literal `/` before it — requests then escape to the
 *    real network and the mock silently does nothing.
 * 2. `ETag` is not a CORS-safelisted response header. Without
 *    `Access-Control-Expose-Headers: ETag` the app cannot read it, no ETag is ever
 *    stored, and the whole conditional-request path goes untested.
 */

export const TBA = "https://www.thebluealliance.com/**";
export const STATBOTICS = "https://api.statbotics.io/**";

export const KEYS = {
  config: "gg_config_v5",
  matches: "gg_matches_v1",
  rankings: "gg_rankings_v1",
  teams: "gg_teams_v1",
  epa: "gg_epa_v1",
  etags: "gg_etags_v1",
  teamEvents: "gg_team_events_v2",
  allTeams: "gg_all_teams_v2",
  activeTeams: "gg_active_teams_v1",
  teamPower: "gg_team_power_v1",
  recentEvents: "gg_recent_events_v1",
  recentFilters: "gg_recent_filters_v1",
  research: "gg_research_v1",
  allMatches: "gg_all_matches_v1",
  alliances: "gg_alliances_v1",
  playoffs: "gg_playoffs_v1",
  teamLoc: "gg_team_loc_v1",
  recentTeams: "gg_recent_teams_v1",
};

export const DEFAULT_CONFIG = {
  eventKey: "2026iri",
  tbaKey: "test-key",
  refreshSeconds: 300,
  team: 10021,
  eventManual: true,
  statbotics: false,
};

const CORS = { "Access-Control-Expose-Headers": "ETag" };

const json = (route, body, extraHeaders = {}) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { ...CORS, ...extraHeaders },
    body: JSON.stringify(body),
  });

/**
 * Intercepts every TBA and Statbotics call.
 *
 * `data` supplies per-endpoint responses; anything unspecified answers empty so the
 * app takes its "no data" path rather than reaching the network.
 *
 * Options:
 *   hang      never settle any request — reproduces wifi that accepts and never answers
 *   useEtags  make /team/{k}/events/{year}/simple conditional, so 304s are exercised
 */
export async function mockTba(page, data = {}, { hang = false, useEtags = false } = {}) {
  const {
    teamEvents = {},   // { [teamNumber]: [event, ...] }  (2026 only; other years empty)
    rankings = [],     // [{ team_key, rank, record }]
    matches = [],      // raw TBA match objects
    alliances = [],
    eventTeams = [],
    directory = [],    // [{ key, nickname, ... }] served as the full TBA team directory
    oprs = null,
    teamSimple = {},   // { [teamNumber]: { city, state_prov, country } }
  } = data;

  const pending = [];

  await page.route(TBA, (route) => {
    if (hang) {
      pending.push(route);
      return;
    }
    const url = route.request().url();

    const ev = url.match(/team\/frc(\d+)\/events\/(\d+)\/simple/);
    if (ev) {
      const [, team, year] = ev;
      const body = year === "2026" ? teamEvents[team] ?? [] : [];
      if (!useEtags) return json(route, body);
      const etag = `W/"${team}-${year}"`;
      if (route.request().headers()["if-none-match"] === etag)
        return route.fulfill({ status: 304, headers: { ...CORS, ETag: etag } });
      return json(route, body, { ETag: etag });
    }

    const info = url.match(/team\/frc(\d+)\/simple/);
    if (info) return json(route, teamSimple[info[1]] ?? {});

    // Matches both /matches and the older /matches/simple, so the mock keeps working
    // whichever the app asks for — videos only come back from the full record.
    if (/\/event\/[^/]+\/matches(\/simple)?(\?|$)/.test(url)) return json(route, matches);
    if (url.includes("/rankings")) return json(route, { rankings });
    if (url.includes("/alliances")) return json(route, alliances);
    if (url.includes("/oprs")) return oprs ? json(route, { oprs }) : json(route, {});
    if (url.includes("/teams/simple")) return json(route, eventTeams);
    // The paged directory and the season-scoped team list. Page 0 carries everything
    // the specs need; the rest answer empty, as the real API does past the last team.
    if (/\/teams\/\d{4}\/(\d+)\/keys/.test(url))
      return json(route, RegExp.$1 === "0" ? directory.map((t) => t.key) : []);
    if (/\/teams\/(\d+)\/simple/.test(url))
      return json(route, RegExp.$1 === "0" ? directory : []);

    return json(route, []);
  });

  await page.route(STATBOTICS, (route) => (hang ? pending.push(route) : json(route, {})));
}

/** Writes app state to local storage. Call before the reload in `openApp`. */
export function seedScript(state = {}) {
  return ({ keys, state }) => {
    for (const [name, value] of Object.entries(state)) {
      const key = keys[name];
      if (!key) continue;
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    }
  };
}

/**
 * Loads the app with seeded state. Seeding needs a first load for the origin to exist,
 * so this navigates, writes local storage, then reloads into the seeded state.
 */
export async function openApp(page, baseURL, { state = {}, config = DEFAULT_CONFIG } = {}) {
  await page.goto(`${baseURL}/index.html`);
  await page.waitForSelector(".tab");
  await page.evaluate(seedScript(), { keys: KEYS, state: { config, ...state } });
  await page.reload();
  await page.waitForSelector(".tab");
}

/**
 * Waits for the startup refresh to land. Without this a spec can assert against the
 * first paint, before network data has been merged in — the difference is invisible
 * locally and shows up as flake in CI.
 */
export async function waitForRefresh(page) {
  await page.waitForFunction(
    () => /Updated|Timed out/.test(document.getElementById("statusTime")?.textContent || ""),
    null,
    { timeout: 25_000 },
  );
}

export async function openSettings(page) {
  await page.click('.tab[data-page="settings"]');
  await page.waitForSelector("#page-settings.active");
}

/** Waits for the service worker to finish caching the app shell. */
export async function waitForCache(page, minEntries = 7) {
  await page.waitForFunction(
    async (min) => {
      const names = await caches.keys();
      if (!navigator.serviceWorker.controller || !names.length) return false;
      return (await (await caches.open(names[0])).keys()).length >= min;
    },
    minEntries,
    { timeout: 20_000 },
  );
  // Let activation settle before inspecting; without this the cache can be read
  // mid-install and report a partial picture.
  await page.waitForTimeout(500);
}

export const readConfig = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), KEYS.config);

/**
 * Fixtures in The Blue Alliance's own wire format.
 *
 * Specs feed these through `mockTba` rather than seeding local storage directly, so
 * the data travels the same refresh path the app uses in production. Seeding state
 * alone is misleading here: refresh() overwrites rankings and matches from the
 * network, so a seeded-only fixture gets wiped moments after load.
 */
export function tbaMatch({ key, comp = "qm", set = 1, num, red, blue, redScore = -1, blueScore = -1, played = false, video = null, videos = null }) {
  return {
    key: key ?? `${comp}${num}`,
    comp_level: comp,
    set_number: set,
    match_number: num,
    alliances: {
      red: { team_keys: red.map((t) => `frc${t}`), score: redScore },
      blue: { team_keys: blue.map((t) => `frc${t}`), score: blueScore },
    },
    // Only present on the full match record, never on /matches/simple.
    videos: videos ?? (video ? [{ type: "youtube", key: video }] : []),
    time: 1_900_000_000,
    predicted_time: 1_900_000_000,
    actual_time: played ? 1_700_000_000 : null,
    post_result_time: played ? 1_700_000_000 : null,
  };
}

export const tbaRanking = (team, rank, wins = 5, losses = 1, ties = 0) => ({
  team_key: `frc${team}`,
  rank,
  record: { wins, losses, ties },
});

export const tbaTeam = (team, nickname) => ({ key: `frc${team}`, nickname });

export const tbaAlliance = (picks, status = "playing", record = { wins: 2, losses: 1, ties: 0 }) => ({
  picks: picks.map((t) => `frc${t}`),
  status: { status, record },
});

/**
 * Switches team through the header chip — the only way to do it since the Settings
 * section was removed. The team must be findable: either in the mocked directory, in
 * the seeded recents, or one of the app's built-in names.
 */
export async function switchTeam(page, team) {
  await page.click("#teamChip");
  await page.fill("#switcherSearch", String(team));
  const row = page.locator(`#switcherList [data-pick="${team}"]`);
  // The directory downloads when the chip opens, so give it a moment to arrive before
  // concluding the team is not in it and falling back to the recents list.
  await row.waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
    await page.fill("#switcherSearch", "");
  });
  await row.click();
  await page.waitForFunction(
    (t) => document.getElementById("teamChipValue").textContent.startsWith(String(t)),
    team, { timeout: 40_000 });
  await page.waitForTimeout(400);
}

/** Switches event through the header chip. */
export async function switchEvent(page, key) {
  await page.click("#eventChip");
  await page.fill("#switcherSearch", key);
  await page.locator(`#switcherList [data-pick="${key}"]`).click();
  await page.waitForTimeout(400);
}

/**
 * The event keys the header switcher lists as *this team's* events. Deliberately scoped
 * to that group: the sheet also offers recently visited events, which belong to whatever
 * team you were on at the time.
 */
export async function offeredEvents(page) {
  await page.click("#eventChip");
  const keys = await page.locator('#switcherList [data-group="mine"] [data-pick]').evaluateAll((els) =>
    els.map((e) => e.dataset.pick));
  await page.click("#switcherClose");
  return keys;
}
