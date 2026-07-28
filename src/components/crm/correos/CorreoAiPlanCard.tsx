"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/opai-ds";

export type PlanActionTag = "nueva" | "reutiliza" | "calculado" | "opcional" | "automatico";

export type PlanActionGroup = "comercial" | "operacion" | "calendario";

export type PlanAction = {
  id: string;
  label: string;
  detail?: string;
  tag?: PlanActionTag;
  /** Si true, el checkbox arranca desmarcado. */
  optional?: boolean;
  disabled?: boolean;
  /** Fila bloqueada (p. ej. sync automático a agenda): no se puede desmarcar. */
  locked?: boolean;
  group?: PlanActionGroup;
};

const TAG_VARIANT: Record<PlanActionTag, "ok" | "info" | "neutral" | "warn"> = {
  nueva: "ok",
  reutiliza: "info",
  calculado: "neutral",
  opcional: "warn",
  automatico: "info",
};

const TAG_LABEL: Record<PlanActionTag, string> = {
  nueva: "nueva",
  reutiliza: "reutiliza",
  calculado: "calculado",
  opcional: "opcional",
  automatico: "automático",
};

type Props = {
  actions: PlanAction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Si true, agrupa por `group` con encabezados. */
  grouped?: boolean;
};

const GROUP_LABEL: Record<PlanActionGroup, string> = {
  comercial: "Comercial",
  operacion: "Operación",
  calendario: "Calendario y seguimiento",
};

const GROUP_ORDER: PlanActionGroup[] = ["comercial", "operacion", "calendario"];

/**
 * Lista de acciones del plan IA con checkboxes DS. Touch targets ≥44px.
 */
export function CorreoAiPlanCard({ actions, selected, onToggle, grouped }: Props) {
  if (grouped) {
    return (
      <div className="space-y-3">
        {GROUP_ORDER.map((g) => {
          const items = actions.filter((a) => (a.group ?? "comercial") === g);
          if (items.length === 0) return null;
          return (
            <section key={g}>
              <h4 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                {GROUP_LABEL[g]}
              </h4>
              <ActionList actions={items} selected={selected} onToggle={onToggle} />
            </section>
          );
        })}
      </div>
    );
  }

  return <ActionList actions={actions} selected={selected} onToggle={onToggle} />;
}

function ActionList({
  actions,
  selected,
  onToggle,
}: {
  actions: PlanAction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="ds-list-cascade space-y-1">
      {actions.map((a) => {
        const checked = a.locked || selected.has(a.id);
        const lockedOrDisabled = Boolean(a.disabled || a.locked);
        return (
          <li key={a.id}>
            <label
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ds-tap ${
                lockedOrDisabled
                  ? "cursor-not-allowed border-ds-border-subtle bg-ds-surface-2 opacity-80"
                  : checked
                    ? "border-tint-violet/40 bg-tint-violet/5"
                    : "border-ds-border-subtle bg-ds-surface-1"
              }`}
            >
              <Checkbox
                className="mt-0.5 h-5 w-5 shrink-0"
                checked={checked}
                disabled={lockedOrDisabled}
                onCheckedChange={() => {
                  if (!lockedOrDisabled) onToggle(a.id);
                }}
                aria-label={a.label}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-ds-text-1">{a.label}</span>
                  {a.tag && (
                    <Tag variant={TAG_VARIANT[a.tag]} size="sm">
                      {TAG_LABEL[a.tag]}
                    </Tag>
                  )}
                </span>
                {a.detail && (
                  <span className="mt-0.5 block text-[12px] text-ds-text-3">{a.detail}</span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
