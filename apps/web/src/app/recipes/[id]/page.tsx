import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RECIPES, RECIPES_BY_ID } from "@prep-cart/catalog";
import { RecipeDetail } from "./recipe-detail";

export const dynamicParams = false;
export function generateStaticParams() {
  return RECIPES.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: RECIPES_BY_ID[id]?.name ?? "Recipe" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!RECIPES_BY_ID[id]) notFound();
  return <RecipeDetail id={id} />;
}
