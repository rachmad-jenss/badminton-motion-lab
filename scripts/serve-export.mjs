/**
 * Minimal static server for Next.js output: "export" builds.
 *
 * Used by the CI browser-test gate (apps/web/playwright.config.ts) because
 * "next start" does not work with output: "export". Serves apps/web/out with
 * clean-URL lookup (/analyze -> analyze.html) and an SPA fallback to
 * index.html for unknown paths.
 *
 * Env:
 *   PORT (default 3101)
 *   BML_WEB_OUT (default <repo root>/apps/web/out)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.BML_WEB_OUT || join(repoRoot, "apps", "web", "out");
const PORT = Number(process.env.PORT || 3101);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

async function tryFile(pathname) {
  const candidates = [pathname, pathname + ".html", pathname + "/index.html"];
  for (const candidate of candidates) {
    const file = normalize(join(OUT, candidate));
    if (!file.startsWith(OUT + sep)) return null;
    try {
      const info = await stat(file);
      if (info.isFile()) return file;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    let pathname = "/";
    try {
      pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    } catch {
      // keep "/" for malformed URLs
    }
    let file = await tryFile(pathname);
    if (!file) file = join(OUT, "index.html"); // SPA fallback for client-side routes
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("static export server error: " + (e && e.message ? e.message : String(e)));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("static export server listening on http://127.0.0.1:" + PORT + " (out=" + OUT + ")");
});

