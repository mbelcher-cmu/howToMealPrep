"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { EmptyState } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { RecipeDetail } from "../[id]/recipe-detail";

function Mine() {
  const id = useSearchParams().get("id") ?? "";
  const hydrated = useHydrated();
  useApp((s) => s.customRecipes); // re-render when the person's recipes change
  if (!hydrated) return null;
  if (!RECIPES_BY_ID[id]) return <EmptyState title="Recipe not found">It may have been deleted, or it was saved on another device.</EmptyState>;
  return <RecipeDetail key={id} id={id} />;
}

export default function Page() {
  return <Suspense fallback={null}><Mine /></Suspense>;
}
