/**
 * "Save to MacroAisle" bookmark. Most recipe sites block other apps from reading their pages
 * (CORS), so instead of fetching the page, the bookmark runs on the recipe page itself, reads its
 * schema.org Recipe data (or the selected text, or the page text), and opens the import page with
 * that data in the address fragment. The fragment never reaches any server.
 */

/** What the bookmark sends: a schema.org Recipe object, or the page's text when it has none. */
export type BookmarkPayload = { url: string; recipe?: Record<string, unknown>; text?: string };

const KEEP = ["name", "recipeYield", "recipeIngredient", "ingredients", "recipeInstructions", "prepTime", "cookTime", "totalTime"];

/**
 * Runs on the recipe page. Written as plain source, not a function, so the build's minifier and
 * transpiler can never pull in helpers the recipe page doesn't have.
 */
const GRAB = `(function(u,keep){
var find=function(n){if(!n||typeof n!=="object")return null;if(Array.isArray(n)){for(var i=0;i<n.length;i++){var y=find(n[i]);if(y)return y}return null}
var t=n["@type"];if(t==="Recipe"||(Array.isArray(t)&&t.indexOf("Recipe")>=0))return n;return find(n["@graph"])||find(n.mainEntity)};
var r=null;var s=document.querySelectorAll('script[type="application/ld+json"]');
for(var i=0;i<s.length&&!r;i++){try{r=find(JSON.parse(s[i].textContent||""))}catch(e){}}
var p={url:location.href};
if(r){var o={};for(var k=0;k<keep.length;k++){if(r[keep[k]]!=null)o[keep[k]]=r[keep[k]]}p.recipe=o}
else{p.text=(String(window.getSelection()||"")||document.body.innerText).slice(0,20000)}
window.open(u+"#data="+encodeURIComponent(JSON.stringify(p)),"_blank")})`;

/** The bookmark's address, a javascript: URL that opens this import page. */
export function bookmarkletHref(importUrl: string): string {
  return `javascript:${encodeURIComponent(`${GRAB.replace(/\n/g, "")}(${JSON.stringify(importUrl)},${JSON.stringify(KEEP)});void 0`)}`;
}

/** Reads the bookmark's data from an address fragment, or null when there is none or it's damaged. */
export function readBookmarkPayload(hash: string): BookmarkPayload | null {
  const m = hash.match(/^#?data=(.+)$/s);
  if (!m) return null;
  try {
    const p = JSON.parse(decodeURIComponent(m[1]!)) as Record<string, unknown>;
    const url = typeof p.url === "string" && /^https?:\/\//i.test(p.url) ? p.url : "";
    const recipe = p.recipe && typeof p.recipe === "object" && !Array.isArray(p.recipe) ? (p.recipe as Record<string, unknown>) : undefined;
    const text = typeof p.text === "string" ? p.text.slice(0, 20000) : undefined;
    if (!recipe && !text) return null;
    return { url, ...(recipe ? { recipe } : {}), ...(text ? { text } : {}) };
  } catch { return null; }
}
