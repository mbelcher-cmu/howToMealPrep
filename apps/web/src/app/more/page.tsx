"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MORE } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { useFlag } from "@/lib/flags";

const LEADS: Record<string, string> = {
  "/recipes/": "Browse, rate and add your own",
  "/preps/": "Ready-made weeks with their macros",
  "/pantry/": "What you have at home, prices and sales",
  "/eat-out/": "Mix takeout into your week",
  "/settings/": "You, household, fitness apps and backups",
  "/plus/": "What's coming in the paid plan",
};

export default function More() {
  const plus = useFlag("plus");
  return (
    <>
      <PageHeader title="More" />
      <ul className="card divide-y divide-line">
        {MORE.filter((m) => plus || m.href !== "/plus/").map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-[60px] items-center gap-3 px-4 py-3 hover:bg-sunk">
              <Icon size={20} className="text-accent" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="block text-sm text-muted">{LEADS[href]}</span></span>
              <ChevronRight size={18} className="text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
