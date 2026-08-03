"use client";

import type {
  CrmStructureProposal,
  CrmStructureAssumption,
} from "@/modules/crm/email/email-to-crm-structure.types";
import type { CrmStructureRefineAnswer } from "@/modules/crm/email/email-to-crm-structure.types";
import { CorreoAiPlanCard, type PlanAction } from "./CorreoAiPlanCard";
import { CorreoAiAssumptions } from "./plan/CorreoAiAssumptions";
import { CorreoAiQuestions } from "./plan/CorreoAiQuestions";

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
  expandedIds?: Set<string>;
  onExpand?: (id: string) => void;
  renderExpanded?: (id: string) => React.ReactNode;
  remainingRefines?: number;
  onAnswer?: (answer: CrmStructureRefineAnswer) => void;
  onAssumptionsChange?: (items: CrmStructureAssumption[]) => void;
  /** Legacy callbacks (backward compat with CorreoAiActionPanel older usage). */
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
  expandedIds,
  onExpand,
  renderExpanded,
  remainingRefines,
  onAnswer,
  onAssumptionsChange,
  onRefineAssumption,
  onRefineQuestion,
  onOpenRefine,
}: Props) {
  const assumptionItems = proposal.assumptionItems ?? [];
  const quoteSelected = selected.has("quote");

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
          expandedIds={expandedIds}
          onExpand={onExpand}
          renderExpanded={renderExpanded}
        />
        {!quoteSelected && (
          <p className="mt-2 text-[12px] text-ds-text-4">
            Marcá <span className="text-ds-text-3">Cotización (CPQ)</span> para
            revisar cobertura, agregar puestos y crear la cotización.
          </p>
        )}
      </section>

      {/* Assumptions v2 — inline editable */}
      {onAssumptionsChange && assumptionItems.length > 0 && (
        <CorreoAiAssumptions items={assumptionItems} onChange={onAssumptionsChange} />
      )}

      {/* Assumptions v1 legacy — read-only with refine button */}
      {!onAssumptionsChange && proposal.assumptions.length > 0 && (
        <LegacyAssumptions
          assumptions={proposal.assumptions}
          origins={proposal.assumptionOrigins}
          onRefineAssumption={onRefineAssumption}
        />
      )}

      {/* Questions v2 — inline answer per question */}
      {onAnswer && proposal.openQuestions.length > 0 && (
        <CorreoAiQuestions
          questions={proposal.openQuestions}
          remainingRefines={remainingRefines ?? 5}
          onAnswer={onAnswer}
        />
      )}

      {/* Questions v1 legacy */}
      {!onAnswer && proposal.openQuestions.length > 0 && (
        <LegacyQuestions
          questions={proposal.openQuestions}
          onRefineQuestion={onRefineQuestion}
          onOpenRefine={onOpenRefine}
        />
      )}
    </div>
  );
}

function LegacyAssumptions({
  assumptions,
  origins,
  onRefineAssumption,
}: {
  assumptions: string[];
  origins?: Array<"inference" | "user">;
  onRefineAssumption?: (a: string) => void;
}) {
  const originList = origins ?? assumptions.map(() => "inference" as const);
  return (
    <section className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5">
      <h3 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        Supuestos que apliqué
      </h3>
      <ul className="space-y-1.5">
        {assumptions.map((a, i) => (
          <li key={`${i}-${a}`} className="flex items-start gap-2 text-[13px] text-ds-text-2">
            <span className="min-w-0 flex-1">
              {a}
              {originList[i] === "user" && (
                <span className="ml-1.5 text-[12px] text-status-ok-fg">· confirmado</span>
              )}
            </span>
            {onRefineAssumption && (
              <button
                type="button"
                onClick={() => onRefineAssumption(a)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] text-primary ds-tap sm:min-h-8"
              >
                Cambiar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LegacyQuestions({
  questions,
  onRefineQuestion,
  onOpenRefine,
}: {
  questions: string[];
  onRefineQuestion?: (q: string) => void;
  onOpenRefine?: () => void;
}) {
  return (
    <section className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5">
      <h3 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        Preguntas
      </h3>
      <ul className="space-y-1.5">
        {questions.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onRefineQuestion?.(q)}
              className="flex min-h-11 w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left text-[13px] text-ds-text-2 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
            >
              <span>{q}</span>
            </button>
          </li>
        ))}
      </ul>
      {onOpenRefine && (
        <button type="button" onClick={onOpenRefine} className="mt-2 text-[12px] text-primary ds-tap">
          Responder en el chat de refinamiento
        </button>
      )}
    </section>
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
