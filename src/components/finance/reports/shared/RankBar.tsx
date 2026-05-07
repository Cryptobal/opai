interface Props {
  value: number;
  max: number;
  tone: "emerald" | "rose" | "amber" | "sky" | "violet";
}

const TONE: Record<Props["tone"], string> = {
  emerald: "var(--ds-tint-emerald)",
  rose: "var(--ds-tint-rose)",
  amber: "var(--ds-tint-amber)",
  sky: "var(--ds-tint-sky)",
  violet: "var(--ds-tint-violet)",
};

export function RankBar({ value, max, tone }: Props) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--ds-bg-2)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TONE[tone] }} />
    </div>
  );
}
