import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./skin-v2.css";
import { AppShell } from "@/components/app-shell";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: { default: "MacroAisle", template: "%s · MacroAisle" },
  description: "Plan a week of meal prep that hits your calories and macros within your grocery budget, then shop it in store.",
  manifest: `${BASE}/manifest.webmanifest`,
  icons: { icon: `${BASE}/icon-192.png`, apple: `${BASE}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "MacroAisle", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#18201a" },
  ],
};

/**
 * The redesign flag's value for this build, so the server-rendered page already has the right look.
 * Mirrors FLAG_DEFAULTS.redesign in lib/flags.ts (on everywhere except production) and NEXT_PUBLIC_FLAGS.
 */
const BUILD_FLAGS = process.env.NEXT_PUBLIC_FLAGS ?? "";
const SKIN_V2 = /redesign=(on|true|1)/i.test(BUILD_FLAGS) ? true : /redesign=(off|false|0)/i.test(BUILD_FLAGS) ? false : process.env.NEXT_PUBLIC_APP_ENV !== "production";
/** Applies this device's own redesign override (?flags=redesign=on|off) before the first paint. */
const SKIN_SCRIPT = `try{var d=${SKIN_V2},q=new URLSearchParams(location.search).get("flags"),o=JSON.parse(localStorage.getItem("prep-cart-flags")||"{}");if(q==="reset")o={};else if(q){var m=/redesign=(on|true|1|off|false|0)/i.exec(q);if(m)o.redesign=/on|true|1/i.test(m[1])}if(typeof o.redesign==="boolean")d=o.redesign;if(d)document.documentElement.dataset.skin="v2";else delete document.documentElement.dataset.skin}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-skin={SKIN_V2 ? "v2" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("prep-cart-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
        <script dangerouslySetInnerHTML={{ __html: SKIN_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
