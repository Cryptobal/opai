import { Decimal } from "@prisma/client/runtime/library";

export function decimalToNumber(d: Decimal | number | null | undefined): number {
  if (d === null || d === undefined) return 0;
  if (typeof d === "number") return d;
  return d.toNumber();
}

export function safePct(num: number, denom: number, decimals = 1): number {
  if (!denom) return 0;
  return Number(((num / denom) * 100).toFixed(decimals));
}

export function deltaPct(curr: number, prev: number, decimals = 1): number {
  if (!prev) return curr ? 100 : 0;
  return Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(decimals));
}
