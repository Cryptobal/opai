"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { useSwipeGesture } from "@/components/chat/hooks/useSwipeGesture";
import type { CorreoAiCommandId } from "@/modules/crm/email/correo-ai-commands";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";
import type { CreateCrmStructureResult } from "@/modules/crm/email/email-to-crm-structure.types";
import { LeadFromEmailPanel } from "./LeadFromEmailPanel";
import { CorreoAiPlanCard, type PlanAction } from "./CorreoAiPlanCard";
import { CorreoAiCoverageTable } from "./CorreoAiCoverageTable";

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
  stagedFiles?: unknown[];
  coverageTable?: unknown;
};

type VerticalProposal = Record<string, unknown>;

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string;
  command: AiPanelCommand;
  /** Si el hilo ya tiene cuenta (para LeadFromEmailPanel). */
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

function buildStructureActions(
  proposal: CrmStructureProposal,
  accountReusedHint: boolean,
  existingDealId: string | null | undefined,
): PlanAction[] {
  const noInstallations = proposal.installations.length === 0;
  return [
    {
      id: "account",
      label: accountReusedHint
        ? `Cuenta: ${proposal.account.name ?? "—"}`
        : `Crear cuenta: ${proposal.account.name ?? "—"}`,
      detail: [proposal.account.rut, proposal.account.industry].filter(Boolean).join(" · ") || undefined,
      tag: accountReusedHint ? "reutiliza" : "nueva",
      disabled: true, // la cuenta siempre se crea/reutiliza
    },
    {
      id: "contact",
      label: "Contacto",
      detail:
        [proposal.contact.firstName, proposal.contact.lastName, proposal.contact.email]
          .filter(Boolean)
          .join(" ") || "Sin datos de contacto",
      tag: "nueva",
    },
    {
      id: "deal",
      label: existingDealId
        ? "Adjuntar al negocio existente"
        : proposal.deal.title ?? "Crear negocio",
      detail: proposal.deal.isLicitacion ? "Licitación / RFI" : undefined,
      tag: existingDealId ? "reutiliza" : "nueva",
    },
    {
      id: "installations",
      label: `Instalaciones (${proposal.installations.length})`,
      detail: proposal.installations.map((i) => i.name).slice(0, 3).join(", ") || undefined,
      tag: "nueva",
      disabled: noInstallations,
    },
    {
      id: "attachments",
      label: "Guardar adjuntos en el negocio",
      tag: "calculado",
    },
    {
      id: "followUpTask",
      label: "Tarea de seguimiento",
      detail: proposal.deal.fechaLimite
        ? `5 días hábiles antes de ${proposal.deal.fechaLimite}`
        : "En 3 días hábiles",
      tag: "opcional",
      optional: true,
    },
  ];
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

/**
 * Panel unificado de Acciones IA: slide-over desktop / bottom-sheet móvil.
 */
export function CorreoAiActionPanel({
  open,
  onClose,
  threadId,
  command,
  hasAccount = false,
  existingDealId,
  onCreated,
}: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [traceIdx, setTraceIdx] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [proposal, setProposal] = useState<CrmStructureProposal | null>(null);
  const [verticalProposal, setVerticalProposal] = useState<VerticalProposal | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CreateCrmStructureResult | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const isStructure = command === "analizar" || command === "crm_completo";
  const isLead = command === "lead";
  const isVertical =
    command === "ticket_operativo" || command === "candidato" || command === "cobranza";

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
    if (isLead) {
      setPhase("lead");
      return;
    }
    setPhase("loading");
    setError(null);
    setResult(null);
    setTraceIdx(0);
    const t0 = Date.now();

    try {
      if (isStructure) {
        const res = await fetch(`/api/crm/correos/${threadId}/extract-structure`, {
          method: "POST",
        });
        const j = (await res.json()) as StructureResponse & { error?: string };
        if (!res.ok) throw new Error(j.error || "No se pudo analizar el correo");
        setProposal(j.proposal);
        setSources(j.sources ?? []);
        setDurationMs(Date.now() - t0);
        const actions = buildStructureActions(j.proposal, false, existingDealId);
        setSelected(
          new Set(actions.filter((a) => !a.optional && !a.disabled).map((a) => a.id).concat(["account"])),
        );
        setPhase("structure");
        return;
      }

      const endpoint =
        command === "ticket_operativo"
          ? "extract-operativo"
          : command === "candidato"
            ? "extract-rrhh"
            : "extract-cobranza";
      const res = await fetch(`/api/crm/correos/${threadId}/${endpoint}`, { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; proposal?: VerticalProposal; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error || "No se pudo analizar el correo");
      const vp = j.proposal ?? {};
      setVerticalProposal(vp);
      setDurationMs(Date.now() - t0);
      const actions = verticalActions(command, vp);
      setSelected(new Set(actions.map((a) => a.id)));
      setPhase("vertical");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar");
      setPhase("error");
    }
  }, [command, existingDealId, isLead, isStructure, threadId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

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
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [open, requestClose]);

  const structureActions = useMemo(() => {
    if (!proposal) return [];
    return buildStructureActions(proposal, false, existingDealId);
  }, [proposal, existingDealId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function executeStructure() {
    if (!proposal) return;
    setPhase("executing");
    setError(null);
    try {
      const include = {
        contact: selected.has("contact"),
        deal: selected.has("deal"),
        installations: selected.has("installations"),
        attachments: selected.has("attachments"),
        followUpTask: selected.has("followUpTask"),
      };
      const res = await fetch(`/api/crm/correos/${threadId}/create-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal, include }),
      });
      const j = (await res.json()) as CreateCrmStructureResult;
      if (!res.ok || !j.ok) throw new Error(j.error || "No se pudo crear la estructura");
      setResult(j);
      setPhase("done");
      onCreated?.();
      toast.success("Estructura CRM creada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
      setPhase("structure");
    }
  }

  function executeVertical() {
    if (!verticalProposal) return;
    if (command === "ticket_operativo") {
      // Abre el panel de trabajo en productividad (ticket) — el usuario confirma ahí.
      window.dispatchEvent(
        new CustomEvent("opai-correo-open-work", {
          detail: { threadId, tab: "productividad", ticketDraft: verticalProposal },
        }),
      );
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
    // cobranza: solo lectura — marcar done
    setPhase("done");
  }

  if (!open) return null;

  const selectedCount = selected.size;
  const title =
    command === "lead"
      ? "Crear lead con IA"
      : command === "ticket_operativo"
        ? "Ticket operativo"
        : command === "candidato"
          ? "Candidato ATS"
          : command === "cobranza"
            ? "Contexto de cobranza"
            : "Plan de acciones";

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
              onCreated={() => {
                onCreated?.();
                onClose();
              }}
            />
          )}

          {(phase === "structure" || phase === "executing") && proposal && (
            <div className="ds-page-enter space-y-4">
              <TraceBlock
                sources={sources}
                durationMs={durationMs}
                attachmentHint={sources.length}
              />
              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                  Acciones
                </h3>
                <CorreoAiPlanCard
                  actions={structureActions}
                  selected={selected}
                  onToggle={toggle}
                />
              </section>
              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                  Cobertura y dotación
                </h3>
                <CorreoAiCoverageTable proposal={proposal} />
              </section>
              {proposal.openQuestions.length > 0 && (
                <section className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5">
                  <h3 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-status-warn-fg">
                    Antes de crear
                  </h3>
                  <ul className="list-disc space-y-1 pl-4 text-[13px] text-status-warn-fg">
                    {proposal.openQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </section>
              )}
              {error && (
                <p className="text-[13px] text-status-danger-fg">{error}</p>
              )}
            </div>
          )}

          {phase === "vertical" && verticalProposal && (
            <div className="ds-page-enter space-y-4">
              <TraceBlock sources={sources} durationMs={durationMs} attachmentHint={0} />
              <CorreoAiPlanCard
                actions={verticalActions(command as AiPanelCommand, verticalProposal)}
                selected={selected}
                onToggle={toggle}
              />
              <VerticalPreview command={command} proposal={verticalProposal} />
            </div>
          )}

          {phase === "done" && (
            <div className="ds-page-enter space-y-3">
              {result ? (
                <>
                  <p className="text-[13px] text-status-ok-fg">
                    {result.note ?? "Creado correctamente."}
                  </p>
                  <ul className="space-y-2">
                    {result.accountUrl && (
                      <ResultLink href={result.accountUrl} label="Cuenta" />
                    )}
                    {result.contactUrl && (
                      <ResultLink href={result.contactUrl} label="Contacto" />
                    )}
                    {result.dealUrl && <ResultLink href={result.dealUrl} label="Negocio" />}
                    {result.installations?.map((i) => (
                      <ResultLink key={i.id} href={i.url} label={i.name} />
                    ))}
                  </ul>
                </>
              ) : command === "cobranza" && verticalProposal ? (
                <VerticalPreview command="cobranza" proposal={verticalProposal} />
              ) : (
                <p className="text-[13px] text-ds-text-2">Listo.</p>
              )}
            </div>
          )}
        </div>

        {(phase === "structure" || phase === "executing" || phase === "vertical") && (
          <footer
            className="shrink-0 border-t border-ds-border-subtle px-3 py-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <p className="mb-2 text-[12px] text-ds-text-4">
              {phase === "executing" ? "Creando…" : "Nada se ha creado aún"}
            </p>
            <button
              type="button"
              disabled={phase === "executing" || (isStructure ? false : selectedCount === 0)}
              onClick={() => {
                if (isStructure) void executeStructure();
                else executeVertical();
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-10"
            >
              {phase === "executing" && <Loader2 className="h-4 w-4 animate-spin" />}
              {isStructure ? "Crear seleccionadas" : command === "cobranza" ? "Entendido" : "Continuar"}
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TraceBlock({
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

function ResultLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-primary ds-tap"
      >
        {label} <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}

function VerticalPreview({
  command,
  proposal,
}: {
  command: AiPanelCommand | CorreoAiCommandId;
  proposal: VerticalProposal;
}) {
  const entries = Object.entries(proposal).filter(
    ([, v]) => v != null && String(v).trim() !== "",
  );
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
