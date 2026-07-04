"use client";

import { Surface } from "@/components/opai-ds";

export type AiActionsFilterState = {
  tenantId: string;
  toolName: string;
  status: string;
  from: string;
  to: string;
};

type Props = {
  value: AiActionsFilterState;
  onChange: (next: AiActionsFilterState) => void;
  onApply: () => void;
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "success", label: "Éxito" },
  { value: "denied", label: "Denegado" },
  { value: "validation_error", label: "Validación" },
  { value: "internal_error", label: "Error interno" },
];

export function AiActionsFilters({ value, onChange, onApply }: Props) {
  const set = (patch: Partial<AiActionsFilterState>) => onChange({ ...value, ...patch });

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">Filtros</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
          placeholder="Tenant ID"
          value={value.tenantId}
          onChange={(e) => set({ tenantId: e.target.value })}
        />
        <input
          className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
          placeholder="Tool (ej. update_account)"
          value={value.toolName}
          onChange={(e) => set({ toolName: e.target.value })}
        />
        <select
          className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
          value={value.status}
          onChange={(e) => set({ status: e.target.value })}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="date"
          className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
          value={value.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <input
          type="date"
          className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
          value={value.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>
      <button
        type="button"
        onClick={onApply}
        className="ds-tap rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground"
      >
        Aplicar filtros
      </button>
    </Surface>
  );
}
