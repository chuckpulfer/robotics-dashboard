# Golden Gears IRI Dashboard

## Publish with GitHub Pages

1. Upload the repository to GitHub (keep `index.html`, `manifest.webmanifest`, and `sw.js` at the repo root).
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically.
5. Open the GitHub Pages URL after the workflow finishes.

Do not upload only `index.html`. The manifest, service worker, and icons are needed for install/offline support.

## Releasing an update

Just push to `main`. The deploy workflow stamps the commit SHA as the build version into both `version.json` and the `<meta name="app-version">` tag in `index.html`, so versioning is fully automatic — nothing to bump by hand.

Already-open pages fetch `version.json` on load, when the tab regains focus, and every 5 minutes. When the deployed version differs from the one the page was loaded with, the app shows a brief "new version available — refreshing…" banner, clears its caches, and does a full reload. Local storage (settings, API key, cached data) is preserved across the reload.

Both files ship with a `__APP_VERSION__` placeholder that only the workflow replaces; opening the files directly during local development leaves it unstamped, and the update check is skipped in that case.

## Install on iPhone

Open the published site in Safari, tap **Share**, then **Add to Home Screen**.

## Security

The TBA read API key is entered in Settings and stored only in the browser's local storage. For a shared or public deployment, use a server-side proxy instead of embedding keys in the client.
