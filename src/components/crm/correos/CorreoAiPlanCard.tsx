"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/opai-ds";

export type PlanActionTag =
  | "nueva"
  | "reutiliza"
  | "calculado"
  | "opcional"
  | "automatico"
  | "licitación"
  | "cotización";

export type PlanActionGroup = "comercial" | "operacion" | "calendario";

export type PlanAction = {
  id: string;
  label: string;
  detail?: string;
  tag?: PlanActionTag;
  /** Si true, el checkbox arranca desmarcado. */
  optional?: boolean;
  disabled?: boolean;
  reasonDisabled?: string;
  /** Fila bloqueada: checkbox visible pero no se puede desmarcar. */
  locked?: boolean;
  group?: PlanActionGroup;
};

const TAG_VARIANT: Record<PlanActionTag, "ok" | "info" | "neutral" | "warn"> = {
  nueva: "ok",
  reutiliza: "info",
  calculado: "neutral",
  opcional: "warn",
  automatico: "info",
  licitación: "info",
  cotización: "ok",
};

const TAG_LABEL: Record<PlanActionTag, string> = {
  nueva: "nueva",
  reutiliza: "reutiliza",
  calculado: "calculado",
  opcional: "opcional",
  automatico: "automático",
  licitación: "licitación",
  cotización: "cotización",
};

type Props = {
  actions: PlanAction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Si true, agrupa por `group` con encabezados. */
  grouped?: boolean;
  /** Ids de acciones actualmente expandidas (mostrar panel interno). */
  expandedIds?: Set<string>;
  /** Callback al hacer clic en chevron para expandir/colapsar. */
  onExpand?: (id: string) => void;
  /** Render de contenido expandido según id. */
  renderExpanded?: (id: string) => React.ReactNode;
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
export function CorreoAiPlanCard({
  actions,
  selected,
  onToggle,
  grouped,
  expandedIds,
  onExpand,
  renderExpanded,
}: Props) {
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
              <ActionList
                actions={items}
                selected={selected}
                onToggle={onToggle}
                expandedIds={expandedIds}
                onExpand={onExpand}
                renderExpanded={renderExpanded}
              />
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <ActionList
      actions={actions}
      selected={selected}
      onToggle={onToggle}
      expandedIds={expandedIds}
      onExpand={onExpand}
      renderExpanded={renderExpanded}
    />
  );
}

function ActionList({
  actions,
  selected,
  onToggle,
  expandedIds,
  onExpand,
  renderExpanded,
}: {
  actions: PlanAction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expandedIds?: Set<string>;
  onExpand?: (id: string) => void;
  renderExpanded?: (id: string) => React.ReactNode;
}) {
  return (
    <ul className="ds-list-cascade space-y-1">
      {actions.map((a) => {
        const checked = a.locked || selected.has(a.id);
        const lockedOrDisabled = Boolean(a.disabled || a.locked);
        const expanded = expandedIds?.has(a.id) ?? false;
        const expandable = Boolean(renderExpanded);

        return (
          <li key={a.id} className="overflow-hidden rounded-xl">
            <label
              className={`flex min-h-11 items-start gap-3 px-3 py-2.5 ds-tap ${
                lockedOrDisabled
                  ? "cursor-not-allowed border border-ds-border-subtle bg-ds-surface-2 opacity-80"
                  : checked
                    ? "cursor-pointer border border-tint-violet/40 bg-tint-violet/5"
                    : "cursor-pointer border border-ds-border-subtle bg-ds-surface-1"
              }`}
            >
              <Checkbox
                className="mt-0.5 h-5 w-5 shrink-0"
                checked={checked}
                disabled={a.disabled}
                onCheckedChange={() => {
                  if (!a.disabled) onToggle(a.id);
                }}
                onClick={(e) => e.stopPropagation()}
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
                  {a.locked && (
                    <Tag variant="neutral" size="sm">bloqueado</Tag>
                  )}
                </span>
                {a.detail && (
                  <span className="mt-0.5 block text-[12px] text-ds-text-3">{a.detail}</span>
                )}
                {a.disabled && a.reasonDisabled && (
                  <span className="mt-0.5 block text-[12px] text-ds-text-4 italic">
                    {a.reasonDisabled}
                  </span>
                )}
              </span>
              {expandable && onExpand && (
                <button
                  type="button"
                  aria-label={expanded ? "Colapsar" : "Expandir"}
                  className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ds-text-4 ds-tap sm:h-8 sm:w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    onExpand(a.id);
                  }}
                >
                  <svg
                    className={`h-4 w-4 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
              )}
            </label>
            {expanded && renderExpanded && (
              <div className="border-t border-ds-border-subtle bg-ds-surface-2 px-3 py-3">
                {renderExpanded(a.id)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
