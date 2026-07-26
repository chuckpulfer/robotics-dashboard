import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/**
 * Serves the repository over HTTP on an ephemeral port.
 *
 * The deploy workflow replaces `__APP_VERSION__` in index.html and version.json with
 * the commit SHA. Pass `stamp` to do the same here, and `deployed` to make
 * version.json report a *different* build — that is how a stale install is simulated.
 */
export async function startStaticServer({ stamp = null, deployed = null } = {}) {
  // Mutable so a spec can start out matching (keeping the auto-updater quiet) and only
  // then advertise a newer build. Intercepting version.json in the page will not do:
  // the service worker fetches it itself, which bypasses page-level routing.
  let advertised = deployed;
  // Requests that actually reached the server. This is the only trustworthy way to
  // prove the service worker served from cache: page-level request events still fire
  // for requests the worker satisfied without touching the network.
  const hits = [];

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      hits.push(url.pathname);
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith("/")) path += "index.html";
      // Keep traversal inside the repo.
      const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      let body = await readFile(file);
      const ext = extname(file);

      if (stamp && (ext === ".html" || ext === ".json")) {
        const version = file.endsWith("version.json") ? (advertised ?? stamp) : stamp;
        body = Buffer.from(body.toString("utf8").replaceAll("__APP_VERSION__", version));
      }

      res.writeHead(200, {
        "Content-Type": TYPES[ext] || "application/octet-stream",
        "Content-Length": body.length,
        // No-store keeps the browser's own HTTP cache out of the service-worker specs,
        // so those assert on the Cache Storage copy rather than a disk-cache hit.
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseURL: `http://127.0.0.1:${port}`,
    /** Paths requested so far. Use `hitsSince(mark())` to scope this to one step. */
    hits,
    mark: () => hits.length,
    /** Change the build version.json reports, to simulate a fresh deploy. */
    setDeployed: (v) => { advertised = v; },
    hitsSince: (from) => hits.slice(from),
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
