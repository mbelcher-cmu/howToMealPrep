import { describe, expect, it, vi } from "vitest";
import { bookmarkletHref, readBookmarkPayload } from "../src/lib/bookmarklet";

describe("Save to MacroAisle bookmark", () => {
  it("sends the page's Recipe JSON-LD to the import page", () => {
    const href = bookmarkletHref("https://example.github.io/howToMealPrep/recipes/import/");
    expect(href.startsWith("javascript:")).toBe(true);
    const code = decodeURIComponent(href.slice("javascript:".length));
    const recipe = { "@type": "Recipe", name: "Chili", recipeIngredient: ["1 lb ground beef"], review: ["long"], image: "x.jpg" };
    const open = vi.fn();
    const doc = { querySelectorAll: () => [{ textContent: "not json" }, { textContent: JSON.stringify({ "@graph": [{ "@type": "WebPage" }, recipe] }) }], body: { innerText: "page" } };
    new Function("document", "location", "window", code)(doc, { href: "https://recipes.example/chili" }, { open, getSelection: () => "" });
    const url = open.mock.calls[0]![0] as string;
    expect(url.startsWith("https://example.github.io/howToMealPrep/recipes/import/#data=")).toBe(true);
    const got = readBookmarkPayload(url.slice(url.indexOf("#")));
    expect(got).toEqual({ url: "https://recipes.example/chili", recipe: { name: "Chili", recipeIngredient: ["1 lb ground beef"] } });
  });

  it("falls back to the selected text when the page has no recipe data", () => {
    const code = decodeURIComponent(bookmarkletHref("https://a.example/import/").slice(11));
    const open = vi.fn();
    new Function("document", "location", "window", code)({ querySelectorAll: () => [], body: { innerText: "whole page" } }, { href: "https://b.example/r" }, { open, getSelection: () => "Ingredients\n1 cup rice" });
    const url = open.mock.calls[0]![0] as string;
    expect(readBookmarkPayload(url.slice(url.indexOf("#")))).toEqual({ url: "https://b.example/r", text: "Ingredients\n1 cup rice" });
  });

  it("rejects damaged data and unsafe links", () => {
    expect(readBookmarkPayload("")).toBeNull();
    expect(readBookmarkPayload("#data=%7Bbad")).toBeNull();
    expect(readBookmarkPayload("#data=" + encodeURIComponent(JSON.stringify({ url: "javascript:alert(1)", text: "hi" })))).toEqual({ url: "", text: "hi" });
    expect(readBookmarkPayload("#data=" + encodeURIComponent(JSON.stringify({ url: "https://x.example" })))).toBeNull();
  });
});
