export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const feetInchesToCm = (feet: number, inches: number) => inToCm(feet * 12 + inches);

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cmToIn(cm));
  return { feet: Math.floor(total / 12), inches: total % 12 };
}
