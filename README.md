# Golden Gears IRI Dashboard

## Publish with GitHub Pages

1. Upload the repository to GitHub (keep `index.html`, `manifest.webmanifest`, and `sw.js` at the repo root).
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Choose **main** and **/(root)**, then save.
5. Open the GitHub Pages URL after deployment finishes.

Do not upload only `index.html`. The manifest, service worker, and icons are needed for install/offline support.

## Install on iPhone

Open the published site in Safari, tap **Share**, then **Add to Home Screen**.

## Security

The TBA read API key is entered in Settings and stored only in the browser's local storage. For a shared or public deployment, use a server-side proxy instead of embedding keys in the client.
