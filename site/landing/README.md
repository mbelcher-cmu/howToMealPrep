# macroaisle.com landing page (draft)

One self-contained page: `index.html`. No build step, no dependencies beyond Google Fonts.
Light and dark mode follow the visitor's system setting. It is **not deployed yet**.

## What still needs deciding

- **Pilot form.** There is no backend yet, so the form only prepares an email to
  `hello@macroaisle.com`. Before launch, post it to a Supabase `waitlist` table
  (insert-only RLS) and set up that mailbox (e.g. free email forwarding at the registrar).
- **App link.** `APP_URL` at the bottom of the page points at the GitHub Pages app.
  Change it once the app moves to its own address (suggested: `app.macroaisle.com`).
- **Prices and pictures.** The phone mockup and the example list use illustrative numbers.
  Swap in real screenshots after the sprint 3 design lock.

## Hosting it on macroaisle.com ($0)

Recommended: **Cloudflare Pages** (free, commercial use allowed) serving this folder at
`macroaisle.com`, with the app on a subdomain. Steps once the domain is bought:

1. Create a Cloudflare Pages project from this repo, build command empty, output directory
   `site/landing`.
2. Add the custom domain `macroaisle.com` (and `www`) in the Pages project.
3. Later, point `app.macroaisle.com` at the app (GitHub Pages custom domain or a second
   Pages project) and drop the `/howToMealPrep` base path from that build.

Preview locally by opening `index.html` in a browser.
