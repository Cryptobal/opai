"use client";

import { MessageSquareText, Pencil } from "lucide-react";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";
import { CorreoAiPlanCard, type PlanAction } from "./CorreoAiPlanCard";
import { CorreoAiCoverageTable } from "./CorreoAiCoverageTable";

export type StaffingDelta = {
  weeklyHH?: { from: number; to: number };
  headcountBase?: { from: number; to: number };
  headcountWithReserve?: { from: number; to: number };
};

type Props = {
  proposal: CrmStructureProposal;
  actions: PlanAction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  sources: string[];
  durationMs: number | null;
  delta?: StaffingDelta | null;
  onRefineAssumption?: (assumption: string) => void;
  onRefineQuestion?: (question: string) => void;
  onOpenRefine?: () => void;
};

export function diffStaffingTotals(
  prev: CrmStructureProposal["staffingTotals"] | null | undefined,
  next: CrmStructureProposal["staffingTotals"],
): StaffingDelta | null {
  if (!prev) return null;
  const delta: StaffingDelta = {};
  if (prev.weeklyHH !== next.weeklyHH) {
    delta.weeklyHH = { from: prev.weeklyHH, to: next.weeklyHH };
  }
  if (prev.headcountBase !== next.headcountBase) {
    delta.headcountBase = { from: prev.headcountBase, to: next.headcountBase };
  }
  if (prev.headcountWithReserve !== next.headcountWithReserve) {
    delta.headcountWithReserve = {
      from: prev.headcountWithReserve,
      to: next.headcountWithReserve,
    };
  }
  return Object.keys(delta).length ? delta : null;
}

export function CorreoAiPlanSections({
  proposal,
  actions,
  selected,
  onToggle,
  sources,
  durationMs,
  delta,
  onRefineAssumption,
  onRefineQuestion,
  onOpenRefine,
}: Props) {
  const origins = proposal.assumptionOrigins ?? proposal.assumptions.map(() => "inference" as const);

  return (
    <div className="ds-page-enter space-y-4">
      <TraceBlock sources={sources} durationMs={durationMs} attachmentHint={sources.length} />

      {delta && (
        <div className="rounded-xl border border-status-info-border bg-status-info-soft px-3 py-2.5 text-[13px] text-status-info-fg">
          <p className="font-medium">Cambios tras afinar</p>
          <ul className="mt-1 space-y-0.5">
            {delta.headcountBase && (
              <li>
                Dotación {delta.headcountBase.from} → {delta.headcountBase.to}
              </li>
            )}
            {delta.headcountWithReserve && (
              <li>
                Con reserva {delta.headcountWithReserve.from} → {delta.headcountWithReserve.to}
              </li>
            )}
            {delta.weeklyHH && (
              <li>
                HH/sem {delta.weeklyHH.from} → {delta.weeklyHH.to}
              </li>
            )}
          </ul>
        </div>
      )}
      {delta === null && (
        <p className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[13px] text-ds-text-3">
          Sin cambios en dotación ni HH tras la última respuesta.
        </p>
      )}

      <section>
        <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
          Se va a crear
        </h3>
        <CorreoAiPlanCard
          actions={actions}
          selected={selected}
          onToggle={onToggle}
          grouped
        />
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
          Cobertura y dotación
        </h3>
        <CorreoAiCoverageTable proposal={proposal} />
      </section>

      {proposal.assumptions.length > 0 && (
        <section className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5">
          <h3 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Supuestos que apliqué
          </h3>
          <ul className="space-y-1.5">
            {proposal.assumptions.map((a, i) => (
              <li key={`${i}-${a}`} className="flex items-start gap-2 text-[13px] text-ds-text-2">
                <span className="min-w-0 flex-1">
                  {a}
                  {origins[i] === "user" && (
                    <span className="ml-1.5 text-[12px] text-status-ok-fg">· confirmado</span>
                  )}
                </span>
                {onRefineAssumption && (
                  <button
                    type="button"
                    onClick={() => onRefineAssumption(a)}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] text-primary ds-tap sm:min-h-8"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Cambiar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposal.openQuestions.length > 0 && (
        <section className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5">
          <h3 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Preguntas
          </h3>
          <ul className="space-y-1.5">
            {proposal.openQuestions.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => onRefineQuestion?.(q)}
                  className="flex min-h-11 w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left text-[13px] text-ds-text-2 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
                >
                  <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-tint-violet-fg" />
                  <span>{q}</span>
                </button>
              </li>
            ))}
          </ul>
          {onOpenRefine && (
            <button
              type="button"
              onClick={onOpenRefine}
              className="mt-2 text-[12px] text-primary ds-tap"
            >
              Responder en el chat de refinamiento
            </button>
          )}
        </section>
      )}
    </div>
  );
}

export function TraceBlock({
  sources,
  durationMs,
  attachmentHint,
}: {
  sources: string[];
  durationMs: number | null;
  attachmentHint: number;
}) {
  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[12px] text-ds-text-3">
      <p>
        Traza: hilo leído
        {attachmentHint > 0 ? ` · ${attachmentHint} fuente(s) de adjuntos` : " · sin adjuntos útiles"}
        {durationMs != null ? ` · ${(durationMs / 1000).toFixed(1)}s` : ""}
      </p>
      {sources.length > 0 && (
        <p className="mt-1 truncate text-ds-text-4" title={sources.join(", ")}>
          {sources.slice(0, 4).join(" · ")}
          {sources.length > 4 ? ` +${sources.length - 4}` : ""}
        </p>
      )}
    </div>
  );
}
