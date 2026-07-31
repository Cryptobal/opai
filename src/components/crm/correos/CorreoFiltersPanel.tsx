"use client";

/**
 * Cuerpo del popover/sheet de Filtros de Correos: Asociación (excluyente),
 * Estado y Contenido (switches). Sin chrome — el consumidor aporta cabecera/pie.
 */

import {
  ASSOC_OPTIONS,
  FILTER_FLAG_OPTIONS,
  type CorreoAssocKey,
  type CorreoFilterFlag,
} from "./CorreosFilters";

type Props = {
  assoc: CorreoAssocKey;
  onAssoc: (next: CorreoAssocKey) => void;
  flags: ReadonlySet<CorreoFilterFlag>;
  onToggleFlag: (flag: CorreoFilterFlag) => void;
};

export function CorreoFiltersPanel({
  assoc, onAssoc, flags, onToggleFlag,
}: Props) {
  return (
    <div className="space-y-4 p-3">
      <section className="space-y-1.5" aria-label="Asociación">
        <p className="px-1 text-xs uppercase tracking-wide text-ds-text-4">Asociación</p>
        <div
          role="radiogroup"
          aria-label="Asociación CRM"
          className="inline-flex w-full rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-0.5"
        >
          {ASSOC_OPTIONS.map((opt) => {
            const active = assoc === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onAssoc(opt.key)}
                className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-[12px] font-medium transition-colors ds-tap ${
                  active
                    ? "bg-ds-surface-2 text-primary shadow-ds-xs"
                    : "text-ds-text-3 hover:text-ds-text-1"
                }`}
              >
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {FILTER_FLAG_OPTIONS.map((opt) => {
        const section =
          opt.key === "sin_responder" ? "Estado" : "Contenido";
        return (
          <section key={opt.key} className="space-y-1" aria-label={section}>
            <p className="px-1 text-xs uppercase tracking-wide text-ds-text-4">{section}</p>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-ds-md px-2 py-1.5 sm:min-h-[36px] hover:bg-ds-surface-3">
              <input
                type="checkbox"
                role="switch"
                checked={flags.has(opt.key)}
                onChange={() => onToggleFlag(opt.key)}
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ds-text-2">{opt.label}</span>
                <span className="block text-[12px] text-ds-text-4">{opt.description}</span>
              </span>
            </label>
          </section>
        );
      })}
    </div>
  );
}
