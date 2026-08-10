"use client";

import { SegmentedControl, Surface } from "@/components/opai-ds";
import { fmtClp } from "./format";
import type { AgingBuckets } from "@/modules/finance/flow-v3/insights-aging";

export type AgingMode = "due" | "issue";

export function PanelCollections({
  agingByIssue,
  agingByDue,
  mode,
  onModeChange,
  carteraCount,
  onOpenCartera,
  collectionLagDays,
}: {
  agingByIssue: AgingBuckets;
  agingByDue: AgingBuckets;
  mode: AgingMode;
  onModeChange: (m: AgingMode) => void;
  carteraCount: number;
  onOpenCartera: () => void;
  collectionLagDays: number;
}) {
  const a = mode === "due" ? agingByDue : agingByIssue;
  const buckets: Array<[string, number]> = [
    [mode === "due" ? "Vigente" : "Al día", a.alDia],
    ["1–15", a.d1_15],
    ["16–30", a.d16_30],
    ["+30", a.d30plus],
  ];

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Cobranza
        </h3>
        <SegmentedControl
          size="xs"
          ariaLabel="Criterio de aging"
          value={mode}
          onChange={onModeChange}
          items={[
            { id: "due", label: "Por vencimiento" },
            { id: "issue", label: "Por emisión" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {buckets.map(([label, v]) => (
          <div key={label} className="rounded-lg bg-ds-surface-2 px-3 py-2">
            <p className="text-[12px] text-ds-text-4">{label}</p>
            <p className="tabular-nums text-ds-text-1">{fmtClp(v)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ds-text-4">
          Criterio:{" "}
          {mode === "due"
            ? `días desde vencimiento (término default ${collectionLagDays}d si no hay dueDate)`
            : "días desde emisión"}
          . Cedidas excluidas del cobrable.
        </p>
        {carteraCount > 0 && (
          <button
            type="button"
            className="min-h-10 shrink-0 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground sm:min-h-9"
            onClick={onOpenCartera}
          >
            Ver cartera ({carteraCount} F°)
          </button>
        )}
      </div>
    </Surface>
  );
}
