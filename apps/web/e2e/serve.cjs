/** A tiny static server for the exported site, so the e2e tests need nothing but Node. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon" };

function serve(root, port = 0) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      // GitHub Pages redirects /x to /x/ and serves 404.html for anything else
      if (!p.endsWith("/") && fs.existsSync(path.join(root, p, "index.html"))) { res.writeHead(301, { location: p + "/" }).end(); return; }
      res.writeHead(404, { "content-type": TYPES[".html"] }).end(fs.existsSync(path.join(root, "404.html")) ? fs.readFileSync(path.join(root, "404.html")) : "Not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

module.exports = { serve };

if (require.main === module) {
  const root = path.resolve(process.argv[2] ?? path.join(__dirname, "..", "out"));
  serve(root, Number(process.env.PORT ?? 4173)).then((s) => console.log(`serving ${root} on http://localhost:${s.address().port}`));
}
