// Copy the HiGHS solver (loader and WebAssembly) next to the app so the browser can load it.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
// resolve the package entry, then find build/highs.wasm beside it
const entry = require.resolve("highs");
const src = join(dirname(entry), "highs.wasm");
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
copyFileSync(src, new URL("../public/highs.wasm", import.meta.url));
// the loader is fetched by the worker with importScripts, so the bundler never sees its Node-only branches
copyFileSync(join(dirname(entry), "highs.js"), new URL("../public/highs.js", import.meta.url));
console.log("copied highs.wasm and highs.js");
