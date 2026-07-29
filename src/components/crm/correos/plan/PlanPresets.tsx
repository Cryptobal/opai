"use client";

export type PlanPresetId = "solo_cuenta" | "cuenta_contacto" | "sin_negocio" | "todo";

const PRESETS: Array<{ id: PlanPresetId; label: string; ids: string[] }> = [
  { id: "solo_cuenta", label: "Solo cuenta", ids: [] },
  { id: "cuenta_contacto", label: "Cuenta + contacto", ids: ["contact"] },
  { id: "sin_negocio", label: "Sin negocio", ids: ["contact", "installations", "attachments"] },
  { id: "todo", label: "Todo", ids: ["contact", "deal", "installations", "attachments"] },
];

type Props = {
  selectedIds: Set<string>;
  onApply: (ids: string[]) => void;
};

function presetMatches(selected: Set<string>, ids: string[]): boolean {
  const expected = new Set(["account", ...ids]);
  if (selected.size !== expected.size) return false;
  for (const id of expected) {
    if (!selected.has(id)) return false;
  }
  return true;
}

/** Chips de atajo para armar el include del plan sin destildar de a uno. */
export function PlanPresets({ selectedIds, onApply }: Props) {
  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none"
      role="group"
      aria-label="Presets de creación"
    >
      {PRESETS.map((p) => {
        const active = presetMatches(selectedIds, p.ids);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onApply(p.ids)}
            className={`h-11 shrink-0 rounded-full px-3.5 text-[13px] font-medium ds-tap sm:h-10 ${
              active
                ? "bg-primary/15 text-primary"
                : "bg-ds-surface-2 text-ds-text-2 hover:bg-ds-surface-3"
            }`}
            aria-pressed={active}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
