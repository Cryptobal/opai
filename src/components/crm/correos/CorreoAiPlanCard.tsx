"use client";

import { Tag } from "@/components/opai-ds";

export type PlanActionTag = "nueva" | "reutiliza" | "calculado" | "opcional";

export type PlanAction = {
  id: string;
  label: string;
  detail?: string;
  tag?: PlanActionTag;
  /** Si true, el checkbox arranca desmarcado. */
  optional?: boolean;
  disabled?: boolean;
};

const TAG_VARIANT: Record<PlanActionTag, "ok" | "info" | "neutral" | "warn"> = {
  nueva: "ok",
  reutiliza: "info",
  calculado: "neutral",
  opcional: "warn",
};

type Props = {
  actions: PlanAction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
};

/**
 * Lista de acciones del plan IA con checkboxes. Touch targets ≥44px.
 */
export function CorreoAiPlanCard({ actions, selected, onToggle }: Props) {
  return (
    <ul className="ds-list-cascade space-y-1">
      {actions.map((a) => {
        const checked = selected.has(a.id);
        return (
          <li key={a.id}>
            <label
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ds-tap ${
                a.disabled
                  ? "cursor-not-allowed border-ds-border-subtle bg-ds-surface-2 opacity-60"
                  : checked
                    ? "border-tint-violet/40 bg-tint-violet/5"
                    : "border-ds-border-subtle bg-ds-surface-1"
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                checked={checked}
                disabled={a.disabled}
                onChange={() => onToggle(a.id)}
                aria-label={a.label}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-ds-text-1">{a.label}</span>
                  {a.tag && (
                    <Tag variant={TAG_VARIANT[a.tag]} size="sm">
                      {a.tag}
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
