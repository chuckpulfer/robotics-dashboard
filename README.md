# RoboGear Pass

## Summary

This app follows an FRC robotics competiion through qualififactions and playoffs. Spectators and teams use it to show important information about the matches and rankings.

## Publish with GitHub Pages

1. Upload the repository to GitHub (keep `index.html`, `manifest.webmanifest`, and `sw.js` at the repo root).
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically.
5. Open the GitHub Pages URL after the workflow finishes.

Do not upload only `index.html`. The manifest, service worker, and icons are needed for install/offline support.

## Custom domain

The site is served at **https://robogearpass.com**. The root `CNAME` file sets the
custom domain; it ships with the deploy artifact, so pushing to `main` keeps it applied.

DNS lives on Cloudflare. The apex `robogearpass.com` points at the GitHub Pages
anycast addresses and `www` is a CNAME to `chuckpulfer.github.io`. Two Cloudflare
settings matter:

- The DNS records must be **DNS only** (grey cloud), not proxied. Proxying breaks
  GitHub's certificate issuance and its own HTTPS redirect.
- **SSL/TLS → Overview** must be **Full (strict)**. "Flexible" causes a redirect loop.

In GitHub **Settings → Pages**, the custom domain field should read `robogearpass.com`
with **Enforce HTTPS** enabled once the certificate is issued.

## Releasing an update

Just push to `main`. The deploy workflow stamps the commit SHA as the build version into both `version.json` and the `<meta name="app-version">` tag in `index.html`, so versioning is fully automatic — nothing to bump by hand.

Already-open pages fetch `version.json` on load, when the tab regains focus, and every 5 minutes. When the deployed version differs from the one the page was loaded with, the app shows a brief "new version available — refreshing…" banner, clears its caches, and does a full reload. Local storage (settings, API key, cached data) is preserved across the reload.

Both files ship with a `__APP_VERSION__` placeholder that only the workflow replaces; opening the files directly during local development leaves it unstamped, and the update check is skipped in that case.

## Tests

End-to-end tests drive the real app in a headless mobile-sized Chromium. They run on
every push and pull request via `.github/workflows/test.yml`.

```bash
npm install
npx playwright install chromium   # first time only
npm test          # everything, ~50s
npm run test:fast # skips the @slow specs, ~20s
npm run test:ui   # interactive runner
```

The app itself still has no dependencies and no build step — `package.json` exists
only for the tests, and nothing it installs ships to the browser.

| Spec | Covers |
| --- | --- |
| `team-popup` | tapping a team from match cards, the bracket and the Teams tab |
| `match-timeline` | the combined Mine tab: status header, next-match card, ordering |
| `layout` | the sticky header clearing the iOS status bar; Teams tab stacking |
| `settings` | the two settings sections saving without clobbering each other |
| `cache` | cache-first service worker, offline load, and the version panel |
| `team-switch` | the ETag regression that emptied the event dropdown |
| `timeouts` | saves and refreshes recovering from a hung network (`@slow`) |
| `notifications` | the five-minute match reminder: colour, timing, and the permission flow |

Three things about the harness are worth knowing before adding specs, because each one
silently passes a broken test rather than failing it:

- **Route TBA as `https://www.thebluealliance.com/**`.** A glob like
  `**/thebluealliance.com/**` never matches — the host is `www.` prefixed and the
  pattern demands a literal `/` before it — so requests escape to the real network.
- **Expose `ETag` via `Access-Control-Expose-Headers`.** It is not a CORS-safelisted
  header, so without that the app cannot read it, no ETag is stored, and every
  conditional-request path goes untested. That is what hid the team-switch bug.
- **Block the service worker for network specs, allow it for cache specs.** A
  controlling worker lets cross-origin requests bypass page routing. To prove
  something was served from cache, check the server's own `hits` — page-level request
  events fire even when the worker answered without touching the network.

## Match notifications

**Settings → Match notifications** turns on a reminder five minutes before each of your
team's matches. The notification leads with your alliance colour, because that is what a
lock screen has room for:

> **🔴 RED · Qualification 46 in 5 min**
>
> Team 10021 is on the RED alliance · starts 2:14 PM.

The preference is **on by default**, including for installs that predate the feature — a
stored config simply has no `notify` key, and reading that as "off" would have opted every
existing user out silently.

On by default is as far as the app can go on its own: showing a notification needs the
browser's permission, and permission can only be requested from a tap. That one
outstanding step is made as short as possible:

- A prompt appears above the tabs — *"Get a reminder 5 minutes before your matches"* —
  with **Allow** and **Not now**. Either answer settles it and the bar does not return.
- **Allow** grants permission *and* immediately posts a confirmation notification, so
  enabling and testing are one tap rather than two. Ticking the Settings checkbox runs the
  same path.
- **Send a test notification** previews a real reminder using your actual next match, and
  says so if nothing could be sent.
- On an iPhone that has not installed the app, there is no permission to ask for at all —
  Safari does not expose the API — so the panel says to Add to Home Screen first instead
  of offering a button that cannot work.

Refusing permission leaves the preference alone: wanting reminders is not the same as the
browser allowing them, and nothing fires while it says no.

**The reminder only fires while the app is running** — open in front of you, or
backgrounded as an installed web app. This is a static site with no server, so there is no
web push and nothing can wake the app from outside. Once it is fully closed, nothing is
left to fire the reminder. Making it work from a cold start would mean standing up a push
service with VAPID keys and a subscription store, which this deployment deliberately does
not have.

Details worth knowing:

- Installed web apps on iOS can only post a notification through
  `ServiceWorkerRegistration.showNotification`; `new Notification` throws there, and on
  Android Chrome too. The app tries the service worker first and only falls back to the
  constructor on desktop. iOS needs 16.4 or newer, and the app must be added to the home
  screen — Safari tabs get nothing.
- The schedule is **polled every 15 seconds**, not armed as one timer per match. Predicted
  match times move all day as an event runs long or catches up, and re-reading the clock
  is far harder to get wrong than re-arming timers on every refresh.
- Announced matches are remembered in `gg_notified_v1` against the start time announced,
  so a reload does not repeat a reminder, but a schedule that slips past the five-minute
  lead announces again rather than going quiet.
- Reminders stay silent in research mode: that points the app at someone else's event,
  and the reminder is about your own team's schedule.

## Install on iPhone

Open the published site in Safari, tap **Share**, then **Add to Home Screen**.

## Security

The TBA read API key is entered in Settings and stored only in the browser's local storage. For a shared or public deployment, use a server-side proxy instead of embedding keys in the client.
