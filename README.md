# Golden Gears IRI Dashboard

## Publish with GitHub Pages

1. Upload all files in this folder to the root of your GitHub repository.
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Choose **main** and **/(root)**, then save.
5. Open the GitHub Pages URL after deployment finishes.

Do not upload only `index.html`. The manifest, service worker, and icons are needed for install/offline support.

## Install on iPhone

Open the published site in Safari, tap **Share**, then **Add to Home Screen**.

## Security

The TBA read API key is embedded in `index.html`, so anyone with access to the repository or published page can retrieve it. For a shared or public deployment, rotate the key and use a server-side proxy.
