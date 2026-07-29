/** Tint class maps for mailbox color keys (Tailwind JIT needs literals). */
export const TINT_BAR: Record<string, string> = {
  teal: "bg-[hsl(var(--tint-teal-fg))]",
  violet: "bg-[hsl(var(--tint-violet-fg))]",
  rose: "bg-[hsl(var(--tint-rose-fg))]",
  amber: "bg-[hsl(var(--tint-amber-fg))]",
  emerald: "bg-[hsl(var(--tint-emerald-fg))]",
  sky: "bg-[hsl(var(--tint-sky-fg))]",
};

export const TINT_SOFT: Record<string, string> = {
  teal: "bg-tint-teal text-tint-teal-fg",
  violet: "bg-tint-violet text-tint-violet-fg",
  rose: "bg-tint-rose text-tint-rose-fg",
  amber: "bg-tint-amber text-tint-amber-fg",
  emerald: "bg-tint-emerald text-tint-emerald-fg",
  sky: "bg-tint-sky text-tint-sky-fg",
};

export function tintBar(color: string): string {
  return TINT_BAR[color] ?? TINT_BAR.teal;
}

export function tintSoft(color: string): string {
  return TINT_SOFT[color] ?? TINT_SOFT.teal;
}
