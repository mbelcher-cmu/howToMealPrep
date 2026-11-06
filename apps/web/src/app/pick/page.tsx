"use client";
import { MealPicker } from "@/components/meal-picker";
import { PageHeader } from "@/components/ui";
import { useHydrated } from "@/lib/use-planner";

export default function Pick() {
  const hydrated = useHydrated();
  return (
    <>
      <PageHeader title="Pick your meals" lead="One meal at a time. Each pick resets what's left of your day, and portions scale to hit your macros." />
      {hydrated && <MealPicker />}
    </>
  );
}
