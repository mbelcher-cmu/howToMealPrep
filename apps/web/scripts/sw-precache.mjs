// After `next build`: write the offline precache list and a build id into out/sw.js.
// Precached: every main page (HTML and its client-navigation payload), all build scripts, styles and
// fonts, the food photos, icons and the solver. Individual recipe pages are cached as they are opened.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out/", import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(out, p).split(sep).join("/"));
  }
})(out);

const keep = (f) => {
  if (f.startsWith("staging/") || f === "sw.js" || f.endsWith(".map")) return false;
  if (f.startsWith("_next/static/")) return true;
  if (f.startsWith("food/")) return true;
  if (/^(highs\.(js|wasm)|manifest\.webmanifest|icon-[\w-]+\.png|apple-touch-icon\.png)$/.test(f)) return true;
  // main pages: index.html and index.txt (not each recipe page, not 404s)
  const m = /^(?:([\w-]+|recipes\/(?:import|mine))\/)?index\.(html|txt)$/.exec(f);
  return !!m && m[1] !== "404" && m[1] !== "_not-found";
};

const list = files.filter(keep).sort().map((f) => (f === "index.html" ? "" : f.replace(/(^|\/)index\.html$/, "$1")));
const hash = createHash("sha256");
for (const f of files.filter(keep).sort()) hash.update(f).update(readFileSync(join(out, f)));
const build = hash.digest("hex").slice(0, 12);

const swPath = join(out, "sw.js");
const sw = readFileSync(swPath, "utf8");
if (!sw.includes("/*__PRECACHE__*/[]") || !sw.includes("/*__BUILD__*/dev")) throw new Error("sw.js placeholders not found");
writeFileSync(swPath, sw.replace("/*__PRECACHE__*/[]", JSON.stringify(list)).replace("/*__BUILD__*/dev", build));
const bytes = files.filter(keep).reduce((a, f) => a + statSync(join(out, f)).size, 0);
console.log(`sw.js: precaching ${list.length} files (${(bytes / 1e6).toFixed(1)} MB), build ${build}`);
