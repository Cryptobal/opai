"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { useSwipeGesture } from "@/components/chat/hooks/useSwipeGesture";
import type { CorreoAiCommandId } from "@/modules/crm/email/correo-ai-commands";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";
import type { CreateCrmStructureResult } from "@/modules/crm/email/email-to-crm-structure.types";
import { LeadFromEmailPanel } from "./LeadFromEmailPanel";
import { CorreoAiPlanCard, type PlanAction } from "./CorreoAiPlanCard";
import {
  CorreoAiPlanSections,
  TraceBlock,
  diffStaffingTotals,
  type StaffingDelta,
} from "./CorreoAiPlanSections";
import { CorreoAiResultList } from "./CorreoAiResultList";
import { CorreoAiRefineChat, type RefineChatMessage } from "./CorreoAiRefineChat";
import type { CrmStructureRefineAnswer } from "@/modules/crm/email/email-to-crm-structure.types";
import { dispatchAiCommand } from "@/lib/ai/ai-command-event";
import { useKeyboardOffset } from "@/hooks/useKeyboardOffset";
import { usePlanDraft } from "./plan/usePlanDraft";
import { PlanAccountForm } from "./plan/forms/PlanAccountForm";
import { PlanContactForm } from "./plan/forms/PlanContactForm";
import { PlanDealForm } from "./plan/forms/PlanDealForm";
import { PlanInstallationsForm } from "./plan/forms/PlanInstallationsForm";
import { PlanAttachmentsForm } from "./plan/forms/PlanAttachmentsForm";
import { PlanTaskForm } from "./plan/forms/PlanTaskForm";
import { PlanQuoteForm } from "./plan/forms/PlanQuoteForm";
import { PlanMilestonesForm } from "./plan/forms/PlanMilestonesForm";

export type AiPanelCommand =
  | "analizar"
  | "crm_completo"
  | "lead"
  | "ticket_operativo"
  | "candidato"
  | "cobranza";

type StructureResponse = {
  proposal: CrmStructureProposal;
  sources: string[];
  stagedFiles?: Array<{ storageKey: string; fileName: string; mimeType: string; size: number }>;
  coverageTable?: unknown;
};

type VerticalProposal = Record<string, unknown>;

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string;
  command: AiPanelCommand;
  hasAccount?: boolean;
  existingDealId?: string | null;
  onCreated?: () => void;
};

type Phase =
  | "loading"
  | "error"
  | "structure"
  | "vertical"
  | "lead"
  | "executing"
  | "done";

const TRACE_STEPS = [
  "Leyendo el hilo…",
  "Revisando adjuntos…",
  "Calculando cobertura y dotación…",
  "Armando el plan de acciones…",
];

const MAX_REFINES = 5;

function isPastDate(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return iso < new Date().toISOString().slice(0, 10);
}

function buildStructureActions(
  proposal: CrmStructureProposal,
  accountReusedHint: boolean,
  existingDealId: string | null | undefined,
  canCreateQuote: boolean,
  canCreateMilestones: boolean,
): PlanAction[] {
  const noInstallations = proposal.installations.length === 0;
  const actions: PlanAction[] = [
    {
      id: "account",
      label: accountReusedHint
        ? `Cuenta: ${proposal.account.name ?? "—"}`
        : `Crear cuenta: ${proposal.account.name ?? "—"}`,
      detail: [proposal.account.rut, proposal.account.industry].filter(Boolean).join(" · ") || undefined,
      tag: accountReusedHint ? "reutiliza" : "nueva",
      locked: true,
      group: "comercial",
    },
    {
      id: "contact",
      label: "Contacto",
      detail:
        [proposal.contact.firstName, proposal.contact.lastName, proposal.contact.email]
          .filter(Boolean)
          .join(" ") || "Sin datos de contacto",
      tag: "nueva",
      group: "comercial",
    },
    {
      id: "deal",
      label: existingDealId
        ? "Adjuntar al negocio existente"
        : `Negocio: ${proposal.deal.title ?? "—"}`,
      detail: proposal.deal.isLicitacion ? "Licitación / RFI" : undefined,
      tag: existingDealId ? "reutiliza" : proposal.deal.isLicitacion ? "nueva" : "nueva",
      group: "comercial",
    },
    {
      id: "installations",
      label: `Instalaciones (${proposal.installations.length})`,
      detail: proposal.installations.map((i) => i.name).slice(0, 3).join(", ") || undefined,
      tag: "nueva",
      disabled: noInstallations,
      reasonDisabled: noInstallations ? "Sin instalaciones en la propuesta" : undefined,
      group: "operacion",
    },
  ];

  if (proposal.deal.isLicitacion && proposal.deal.fechaLimite) {
    const past = isPastDate(proposal.deal.fechaLimite);
    actions.push({
      id: "agendaDeadline",
      label: "Plazo en agenda",
      detail: past
        ? `Fecha ${proposal.deal.fechaLimite} ya pasó — no se sincroniza`
        : `Hasta ${proposal.deal.fechaLimite} · se sincroniza al crear el negocio`,
      tag: "automatico",
      locked: !past,
      disabled: past,
      group: "calendario",
    });
  }

  actions.push(
    {
      id: "attachments",
      label: "Guardar adjuntos en el negocio",
      tag: "calculado",
      group: "calendario",
    },
    {
      id: "followUpTask",
      label: "Tarea de seguimiento",
      detail: proposal.deal.fechaLimite
        ? `5 días hábiles antes de ${proposal.deal.fechaLimite}`
        : "En 3 días hábiles",
      tag: "opcional",
      optional: true,
      group: "calendario",
    },
    {
      id: "quote",
      label: "Cotización (CPQ)",
      detail: canCreateQuote ? undefined : undefined,
      tag: "opcional",
      optional: !proposal.deal.isLicitacion,
      disabled: !canCreateQuote,
      reasonDisabled: !canCreateQuote ? "Sin permiso para crear cotizaciones" : undefined,
      group: "comercial",
    },
  );

  if (proposal.deal.isLicitacion) {
    actions.push({
      id: "milestones",
      label: "Hitos de licitación en agenda",
      detail: "Consultas, visita técnica, entrega",
      tag: "opcional",
      optional: false,
      disabled: !canCreateMilestones,
      reasonDisabled: !canCreateMilestones ? "Sin acceso a agenda" : undefined,
      group: "calendario",
    });
  }

  return actions;
}

function verticalActions(command: AiPanelCommand, proposal: VerticalProposal): PlanAction[] {
  if (command === "ticket_operativo") {
    return [
      {
        id: "ticket",
        label: String(proposal.titulo ?? "Abrir ticket operativo"),
        detail: String(proposal.descripcion ?? "").slice(0, 160) || undefined,
        tag: "nueva",
      },
    ];
  }
  if (command === "candidato") {
    return [
      {
        id: "candidato",
        label: `Candidato: ${String(proposal.nombre ?? "Sin nombre")}`,
        detail: [proposal.cargo, proposal.email].filter(Boolean).join(" · ") || undefined,
        tag: "nueva",
      },
    ];
  }
  return [
    {
      id: "cobranza",
      label: "Contexto de cobranza",
      detail: String(proposal.accion_sugerida ?? proposal.contexto ?? "").slice(0, 160) || undefined,
      tag: "calculado",
    },
  ];
}

export function CorreoAiActionPanel({
  open,
  onClose,
  threadId,
  command,
  hasAccount = false,
  existingDealId,
  onCreated,
}: Props) {
  const draft = usePlanDraft(threadId);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [traceIdx, setTraceIdx] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [verticalProposal, setVerticalProposal] = useState<VerticalProposal | null>(null);
  const [result, setResult] = useState<CreateCrmStructureResult | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [refineBusy, setRefineBusy] = useState(false);
  const [answers, setAnswers] = useState<CrmStructureRefineAnswer[]>([]);
  const [refineMessages, setRefineMessages] = useState<RefineChatMessage[]>([]);
  const [activeQuestion, setActiveQuestion] = useState("Ajuste al plan");
  const [delta, setDelta] = useState<StaffingDelta | null | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const keyboardOffset = useKeyboardOffset();

  const isStructure = command === "analizar" || command === "crm_completo";
  const isLead = command === "lead";
  const isVertical = command === "ticket_operativo" || command === "candidato" || command === "cobranza";
  const remainingRefines = MAX_REFINES - answers.length;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    const el = sheetRef.current;
    if (el && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      el.style.transition = "transform 180ms ease-out";
      el.style.transform = "translate3d(0, 110%, 0)";
      window.setTimeout(() => onClose(), 180);
    } else {
      onClose();
    }
  }, [closing, onClose]);

  const swipe = useSwipeGesture({
    onSwipeDown: () => requestClose(),
    followFinger: true,
    targetRef: sheetRef,
    mobileOnly: true,
    hapticOnComplete: true,
    directionLock: true,
  });

  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  const load = useCallback(async () => {
    if (isLead) { setPhase("lead"); return; }
    setPhase("loading");
    setError(null);
    setResult(null);
    setTraceIdx(0);
    setShowRefine(false);
    setAnswers([]);
    setRefineMessages([]);
    setDelta(undefined);
    setActiveQuestion("Ajuste al plan");
    const t0 = Date.now();

    try {
      if (isStructure) {
        const res = await fetch(`/api/crm/correos/${threadId}/extract-structure`, { method: "POST" });
        const j = (await res.json()) as StructureResponse & { error?: string };
        if (!res.ok) throw new Error(j.error || "No se pudo analizar el correo");
        const actions = buildStructureActions(j.proposal, false, existingDealId, true, true);
        draft.resetToAi(j.proposal, j.stagedFiles ?? []);
        draft.setSelectedIds(
          new Set(actions.filter((a) => !a.optional && !a.disabled).map((a) => a.id).concat(["account"])),
        );
        draft.setInclude({
          contact: true,
          deal: true,
          installations: j.proposal.installations.length > 0,
          attachments: true,
          followUpTask: false,
          quote: Boolean(j.proposal.deal.isLicitacion),
          milestones: Boolean(j.proposal.deal.isLicitacion),
        });
        setSources(j.sources ?? []);
        setDurationMs(Date.now() - t0);
        setPhase("structure");
        return;
      }

      const endpoint =
        command === "ticket_operativo" ? "extract-operativo" :
        command === "candidato" ? "extract-rrhh" : "extract-cobranza";
      const res = await fetch(`/api/crm/correos/${threadId}/${endpoint}`, { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; proposal?: VerticalProposal; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error || "No se pudo analizar el correo");
      const vp = j.proposal ?? {};
      setVerticalProposal(vp);
      setDurationMs(Date.now() - t0);
      const actions = verticalActions(command, vp);
      draft.setSelectedIds(new Set(actions.map((a) => a.id)));
      setPhase("vertical");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar");
      setPhase("error");
    }
  }, [command, existingDealId, isLead, isStructure, threadId, draft]);

  useEffect(() => { if (!open) return; void load(); }, [open, load]);

  useEffect(() => {
    if (phase !== "loading") return;
    const id = window.setInterval(() => {
      setTraceIdx((i) => Math.min(i + 1, TRACE_STEPS.length - 1));
    }, 2800);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); requestClose(); }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [open, requestClose]);

  const structureActions = useMemo(() => {
    if (!draft.proposal) return [];
    return buildStructureActions(draft.proposal, false, existingDealId, true, true);
  }, [draft.proposal, existingDealId]);

  function handleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderExpandedPanel(id: string): React.ReactNode {
    const p = draft.proposal;
    if (!p) return null;
    switch (id) {
      case "account":
        return (
          <PlanAccountForm
            account={p.account}
            onChange={(f, v) => draft.setField(`account.${f}`, v)}
          />
        );
      case "contact":
        return (
          <PlanContactForm
            contact={p.contact}
            onChange={(f, v) => draft.setField(`contact.${f}`, v)}
          />
        );
      case "deal":
        return (
          <PlanDealForm
            deal={p.deal}
            onChange={(f, v) => draft.setField(`deal.${f}`, v)}
          />
        );
      case "installations":
        return (
          <PlanInstallationsForm
            installations={p.installations}
            onChange={(inst) => draft.setField("installations", inst)}
          />
        );
      case "attachments":
        return (
          <PlanAttachmentsForm
            stagedFiles={draft.stagedFiles}
            selection={draft.attachmentSelection}
            onChange={draft.setAttachmentSelection}
          />
        );
      case "followUpTask":
        return (
          <PlanTaskForm
            task={draft.taskOverride}
            onChange={(partial) => draft.setTaskOverride((prev) => ({ ...prev, ...partial }))}
          />
        );
      case "quote":
        return (
          <PlanQuoteForm
            quoteInput={draft.quoteInput}
            onChange={(partial) => draft.setQuoteInput((prev) => ({ ...prev, ...partial }))}
          />
        );
      case "milestones":
        return (
          <PlanMilestonesForm
            milestones={draft.milestones}
            onChange={draft.setMilestones}
          />
        );
      default:
        return null;
    }
  }

  async function refineWithAnswers(nextAnswers: CrmStructureRefineAnswer[]) {
    if (!draft.proposal) return;
    if (nextAnswers.length > MAX_REFINES) {
      toast.message("Abrí el asistente completo para seguir afinando");
      dispatchAiCommand({ prompt: "Seguí refinando el plan de acciones de este correo con más detalle.", autoSend: true });
      return;
    }
    const prevTotals = draft.proposal.staffingTotals;
    setRefineBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/extract-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: nextAnswers, baseProposal: draft.proposal, locks: draft.locks }),
      });
      const j = (await res.json()) as StructureResponse & { error?: string };
      if (!res.ok) throw new Error(j.error || "No se pudo refinar el plan");
      const d = diffStaffingTotals(prevTotals, j.proposal.staffingTotals);
      setDelta(d);
      draft.resetToAi(j.proposal);
      setSources(j.sources ?? []);
      const actions = buildStructureActions(j.proposal, false, existingDealId, true, true);
      draft.setSelectedIds(
        new Set(actions.filter((a) => !a.optional && !a.disabled && !a.locked).map((a) => a.id).concat(["account"])),
      );
      setRefineMessages((msgs) => [
        ...msgs,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: d
            ? `Plan actualizado: ${[
                d.headcountBase && `dotación ${d.headcountBase.from}→${d.headcountBase.to}`,
                d.weeklyHH && `HH/sem ${d.weeklyHH.from}→${d.weeklyHH.to}`,
              ].filter(Boolean).join(", ")}`
            : "Plan actualizado sin cambios en dotación ni HH.",
        },
      ]);
      setAnswers(nextAnswers);
      setPhase("structure");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al refinar");
      toast.error("No se pudo refinar; se mantiene el plan anterior");
    } finally {
      setRefineBusy(false);
    }
  }

  function openRefine(question: string) {
    setActiveQuestion(question);
    setShowRefine(true);
  }

  async function executeStructure() {
    if (!draft.proposal) return;
    setPhase("executing");
    setError(null);
    try {
      const sel = draft.selectedIds;
      const include = {
        contact: sel.has("contact"),
        deal: sel.has("deal"),
        installations: sel.has("installations"),
        attachments: sel.has("attachments"),
        followUpTask: sel.has("followUpTask"),
        quote: sel.has("quote"),
        milestones: sel.has("milestones"),
      };
      const res = await fetch(`/api/crm/correos/${threadId}/create-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: draft.proposal,
          include,
          refineAnswers: answers,
          taskOverride: draft.taskOverride,
          attachmentSelection: draft.attachmentSelection,
          quoteInput: draft.quoteInput,
          milestones: draft.milestones,
        }),
      });
      const j = (await res.json()) as CreateCrmStructureResult;
      if (!res.ok || !j.ok) throw new Error(j.error || "No se pudo crear la estructura");
      setResult(j);
      setPhase("done");
      onCreated?.();
      toast.success("Estructura CRM creada");
      void draft.clearDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
      setPhase("structure");
    }
  }

  function executeVertical() {
    if (!verticalProposal) return;
    if (command === "ticket_operativo") {
      window.dispatchEvent(new CustomEvent("opai-correo-open-work", {
        detail: { threadId, tab: "productividad", ticketDraft: verticalProposal },
      }));
      toast.message("Revisá el borrador del ticket en el panel de trabajo");
      onClose();
      return;
    }
    if (command === "candidato") {
      const q = new URLSearchParams();
      if (typeof verticalProposal.nombre === "string") q.set("nombre", verticalProposal.nombre);
      if (typeof verticalProposal.rut === "string") q.set("rut", verticalProposal.rut);
      if (typeof verticalProposal.email === "string") q.set("email", verticalProposal.email);
      if (typeof verticalProposal.telefono === "string") q.set("telefono", verticalProposal.telefono);
      if (typeof verticalProposal.cargo === "string") q.set("cargo", verticalProposal.cargo);
      if (typeof verticalProposal.resumen === "string") q.set("resumen", verticalProposal.resumen);
      q.set("fromEmail", threadId);
      window.open(`/ops/ats?${q.toString()}`, "_blank", "noopener,noreferrer");
      toast.message("Propuesta abierta en ATS");
      onClose();
      return;
    }
    setPhase("done");
  }

  if (!open) return null;

  const selectedCount = draft.selectedIds.size;
  const title =
    command === "lead" ? "Crear lead con IA" :
    command === "ticket_operativo" ? "Ticket operativo" :
    command === "candidato" ? "Candidato ATS" :
    command === "cobranza" ? "Contexto de cobranza" : "Plan de acciones";

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex justify-end bg-black/40"
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full flex-col overflow-hidden border-ds-border-default bg-ds-surface-1 shadow-2xl sm:w-[452px] sm:border-l max-lg:mt-auto max-lg:h-[88dvh] max-lg:rounded-t-2xl max-lg:border-t"
        style={{ transition: closing ? "transform 180ms ease-out" : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ds-surface-3 lg:hidden"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
          aria-hidden
        />
        <header
          className="shrink-0 border-b border-ds-border-subtle px-3 py-2.5"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-tint-violet-fg" />
            <p className="font-display text-[15px] font-semibold text-ds-text-1">{title}</p>
            {(phase === "structure" || phase === "vertical") && (
              <span className="rounded-full bg-tint-violet/10 px-2 py-0.5 text-[12px] text-tint-violet-fg">
                {selectedCount} seleccionada{selectedCount === 1 ? "" : "s"}
              </span>
            )}
            {draft.draftSavedAt && (
              <span className="ml-auto text-[12px] text-ds-text-4">
                Borrador guardado
              </span>
            )}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={requestClose}
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3 sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {phase === "loading" && (
            <div className="space-y-3 py-6 text-center">
              <Spinner className="mx-auto" />
              <p className="text-[13px] text-ds-text-2">{TRACE_STEPS[traceIdx]}</p>
              <ul className="mx-auto max-w-xs space-y-1 text-left text-[12px] text-ds-text-4">
                {TRACE_STEPS.map((s, i) => (
                  <li key={s} className={i <= traceIdx ? "text-ds-text-2" : ""}>
                    {i < traceIdx ? "✓" : i === traceIdx ? "…" : "·"} {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-3 rounded-xl border border-status-danger-border bg-status-danger-soft px-3 py-3">
              <div className="flex items-start gap-2 text-[13px] text-status-danger-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="h-10 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
              >
                Reintentar
              </button>
            </div>
          )}

          {phase === "lead" && (
            <LeadFromEmailPanel
              threadId={threadId}
              hasAccount={hasAccount}
              onClose={onClose}
              onCreated={() => { onCreated?.(); onClose(); }}
            />
          )}

          {(phase === "structure" || phase === "executing") && draft.proposal && (
            <>
              <CorreoAiPlanSections
                proposal={draft.proposal}
                actions={structureActions}
                selected={draft.selectedIds}
                onToggle={draft.toggleAction}
                sources={sources}
                durationMs={durationMs}
                delta={delta}
                expandedIds={expandedIds}
                onExpand={handleExpand}
                renderExpanded={renderExpandedPanel}
                remainingRefines={remainingRefines}
                onAnswer={(ans) => {
                  const next = [...answers, ans];
                  setRefineMessages((msgs) => [
                    ...msgs,
                    { id: `u-${Date.now()}`, role: "user", text: ans.answer },
                  ]);
                  void refineWithAnswers(next);
                }}
                onAssumptionsChange={draft.setAssumptions}
                onRefineAssumption={(a) => openRefine(`Cambiar supuesto: ${a}`)}
                onRefineQuestion={(q) => openRefine(q)}
                onOpenRefine={() => openRefine("Ajuste al plan")}
              />
              {error && <p className="mt-2 text-[13px] text-status-danger-fg">{error}</p>}
            </>
          )}

          {phase === "vertical" && verticalProposal && (
            <div className="ds-page-enter space-y-4">
              <TraceBlock sources={sources} durationMs={durationMs} attachmentHint={0} />
              <CorreoAiPlanCard
                actions={verticalActions(command as AiPanelCommand, verticalProposal)}
                selected={draft.selectedIds}
                onToggle={draft.toggleAction}
              />
              <VerticalPreview command={command} proposal={verticalProposal} />
            </div>
          )}

          {phase === "done" && (
            result ? (
              <CorreoAiResultList result={result} />
            ) : command === "cobranza" && verticalProposal ? (
              <div className="ds-page-enter space-y-3">
                <VerticalPreview command="cobranza" proposal={verticalProposal} />
              </div>
            ) : (
              <p className="text-[13px] text-ds-text-2">Listo.</p>
            )
          )}
        </div>

        {(phase === "structure" || phase === "executing" || phase === "vertical") && (
          <footer
            className="shrink-0 border-t border-ds-border-subtle px-3 py-3"
            style={{
              paddingBottom:
                keyboardOffset > 0
                  ? keyboardOffset + 12
                  : "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            {isStructure && showRefine && (
              <div className="mb-3">
                <CorreoAiRefineChat
                  messages={refineMessages}
                  busy={refineBusy}
                  remaining={remainingRefines}
                  activeQuestion={activeQuestion}
                  onSend={(ans) => {
                    const next = [...answers, ans];
                    setRefineMessages((msgs) => [
                      ...msgs,
                      { id: `u-${Date.now()}`, role: "user", text: ans.answer },
                    ]);
                    void refineWithAnswers(next);
                  }}
                  onOpenFullAssistant={() => {
                    dispatchAiCommand({ prompt: "Seguí refinando el plan de acciones de este correo con más detalle.", autoSend: true });
                    requestClose();
                  }}
                />
              </div>
            )}
            <p className="mb-2 text-[12px] text-ds-text-4">
              {phase === "executing" ? "Creando…" : refineBusy ? "Recalculando plan…" : "Nada se ha creado aún"}
            </p>
            <div className="flex gap-2">
              {isStructure && (
                <button
                  type="button"
                  disabled={phase === "executing" || refineBusy}
                  onClick={() => setShowRefine((v) => !v)}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl border border-ds-border-default text-[13px] font-medium text-ds-text-1 ds-tap disabled:opacity-50 sm:h-10"
                >
                  {showRefine ? "Ocultar" : "Afinar"}
                </button>
              )}
              <button
                type="button"
                disabled={
                  phase === "executing" || refineBusy ||
                  (isStructure ? false : selectedCount === 0)
                }
                onClick={() => {
                  if (isStructure) void executeStructure();
                  else executeVertical();
                }}
                className="flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-10"
              >
                {phase === "executing" && <Loader2 className="h-4 w-4 animate-spin" />}
                {isStructure
                  ? `Crear ${selectedCount} acción${selectedCount === 1 ? "" : "es"}`
                  : command === "cobranza" ? "Entendido" : "Continuar"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

function VerticalPreview({
  command,
  proposal,
}: {
  command: AiPanelCommand | CorreoAiCommandId;
  proposal: VerticalProposal;
}) {
  const entries = Object.entries(proposal).filter(([, v]) => v != null && String(v).trim() !== "");
  return (
    <dl className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[12px] uppercase tracking-wide text-ds-text-4">{k}</dt>
          <dd className="text-[13px] text-ds-text-1">{String(v)}</dd>
        </div>
      ))}
      {command === "cobranza" && (
        <p className="pt-1 text-[12px] text-ds-text-4">
          Solo contexto — no se escribe nada en la base de datos.
        </p>
      )}
    </dl>
  );
}
