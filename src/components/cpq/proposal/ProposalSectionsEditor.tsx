"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown, MessageCircle, Sparkles } from "lucide-react";
import { EmptyState, IconBubble, Spinner, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { toast } from "sonner";
import type { ProposalContentV2 } from "@/lib/cpq/proposal-sections/schema";
import type { ProposalValidation } from "@/lib/cpq/proposal-sections/validate";
import { ProposalSectionList } from "./ProposalSectionList";
import { ProposalSectionPanel } from "./ProposalSectionPanel";
import { ProposalValidations } from "./ProposalValidations";
import { confirmDialog } from "@/components/ui/confirm-service";

type Payload = {
  content: ProposalContentV2;
  validations: ProposalValidation[];
  gate: string | null;
  needsConversion?: boolean;
  quote: { id: string; code: string; dealId: string | null };
};

const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  enviada: "Enviada",
};

export function ProposalSectionsEditor({
  quoteId,
  quoteLabel,
  readOnly,
  dealId,
  quoteStatus,
  onMarkSentLicitacion,
  onSendPortal,
  markingSent,
}: {
  quoteId: string;
  quoteLabel: string;
  readOnly?: boolean;
  dealId?: string | null;
  quoteStatus?: string;
  onMarkSentLicitacion?: () => void;
  onSendPortal?: () => void;
  markingSent?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/proposal-sections`);
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: Payload;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error || "No se pudo cargar la propuesta");
        return;
      }
      setData(json.data);
      setActiveId((prev) => prev ?? json.data!.content.sections[0]?.id ?? null);
    } catch {
      setError("No se pudo cargar la propuesta");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/proposal-sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expectedUpdatedAt: data.content.updatedAt }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { content: ProposalContentV2; validations: ProposalValidation[] };
        error?: string;
        code?: string;
      };
      if (json.code === "conflict") {
        toast.error(json.error);
        await load();
        return;
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || "No se pudo guardar");
        return;
      }
      setData((prev) =>
        prev
          ? { ...prev, content: json.data!.content, validations: json.data!.validations, gate: prev.gate, needsConversion: false }
          : prev,
      );
    } finally {
      setBusy(false);
    }
  }

  async function convertToLicitacion() {
    const ok = await confirmDialog({
      title: "¿Convertir a licitación?",
      description:
        "Se descarta el índice comercial y se siembra la plantilla de licitación. Esta acción no se puede deshacer.",
      confirmLabel: "Convertir",
    });
    if (!ok) return;
    await patch({ action: "convert_to_licitacion" });
    await load();
  }

  const section = data?.content.sections.find((s) => s.id === activeId) ?? data?.content.sections[0];
  const approved = data?.content.sections.filter((s) => s.status === "aprobada").length ?? 0;
  const total = data?.content.sections.length ?? 0;
  const mode = data?.content.mode ?? "comercial";
  const licitacionGate = mode === "licitacion" && Boolean(data?.gate);
  const proposalApproved = data?.content.status === "aprobada";
  const alreadySent = quoteStatus === "sent";

  return (
    <Surface elevation={1} padding="md" className="space-y-4 ds-page-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <IconBubble icon={Sparkles} variant="brand" size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ds-text-1">Propuesta</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Tag variant={mode === "licitacion" ? "info" : "neutral"} size="sm">
                {mode === "licitacion" ? "Licitación · desde el negocio" : "Comercial"}
              </Tag>
              <Tag variant={proposalApproved ? "ok" : "neutral"} size="sm">
                {STATUS_LABEL[data?.content.status ?? "borrador"] ?? "Borrador"}
              </Tag>
              <span className="text-[12px] text-ds-text-3">
                {approved}/{total} aprobadas
              </span>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 sm:h-9 shrink-0"
          onClick={() =>
            openAnchoredChat({
              anchorType: "cpq_quote",
              anchorId: quoteId,
              entityName: quoteLabel,
            })
          }
        >
          <MessageCircle className="h-4 w-4" />
          Abrir chat
        </Button>
      </div>

      {data?.needsConversion ? (
        <div className="flex flex-col gap-2 rounded-lg border border-status-warn-border bg-status-warn-soft px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-status-warn-fg">
            Este negocio es licitación, pero la propuesta quedó en modo comercial con ediciones.
          </p>
          {!readOnly ? (
            <Button type="button" size="sm" className="h-10 sm:h-9" disabled={busy} onClick={() => void convertToLicitacion()}>
              Convertir a licitación
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
          <Spinner size="sm" /> Cargando propuesta…
        </div>
      ) : error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : licitacionGate ? (
        <EmptyState
          icon={Sparkles}
          title="Faltan las bases técnicas en el negocio"
          description="Súbelas y clasifícalas en Documentos. El índice no se genera sin bases técnicas."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                className="h-10 sm:h-9"
                onClick={() =>
                  openAnchoredChat({
                    anchorType: dealId ? "crm_deal" : "cpq_quote",
                    anchorId: dealId || quoteId,
                    entityName: quoteLabel,
                  })
                }
              >
                Abrir chat de licitación
              </Button>
              {dealId ? (
                <Button type="button" variant="outline" className="h-10 sm:h-9" asChild>
                  <a href={`/crm/deals/${dealId}`}>Ir al negocio</a>
                </Button>
              ) : null}
            </div>
          }
        />
      ) : data && section ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <div className="min-w-0 overflow-x-auto lg:overflow-visible">
              <ProposalSectionList sections={data.content.sections} activeId={section.id} onSelect={setActiveId} />
            </div>
            <ProposalSectionPanel
              key={section.id}
              section={section}
              readOnly={Boolean(readOnly)}
              busy={busy}
              onSave={(content, title) => {
                void patch({ action: "set_content", sectionId: section.id, content });
                if (title !== section.title && !section.invariant) {
                  void patch({ action: "rename", sectionId: section.id, title });
                }
              }}
              onApprove={() => void patch({ action: "approve", sectionId: section.id })}
              onUnapprove={() => void patch({ action: "unapprove", sectionId: section.id })}
              onRegenerate={(instruction) =>
                void patch({ action: "regenerate", sectionId: section.id, instruction })
              }
            />
          </div>
          <ProposalValidations items={data.validations} />
          {!readOnly && data.content.status !== "aprobada" && data.content.status !== "enviada" ? (
            <Button
              type="button"
              variant="secondary"
              className="h-10 sm:h-9"
              disabled={busy}
              onClick={() => void patch({ action: "set_status", status: "aprobada" })}
            >
              Marcar propuesta aprobada
            </Button>
          ) : null}
        </>
      ) : null}

      <div className="space-y-2 border-t border-ds-border-subtle pt-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10 sm:h-9" asChild>
            <a href={`/api/cpq/quotes/${quoteId}/proposal-pdf?mode=draft`} target="_blank" rel="noreferrer">
              <FileDown className="h-4 w-4" />
              PDF borrador
            </a>
          </Button>
          <Button type="button" className="h-10 sm:h-9" asChild>
            <a href={`/api/cpq/quotes/${quoteId}/proposal-pdf?mode=final`} target="_blank" rel="noreferrer">
              PDF final
            </a>
          </Button>
        </div>
        <p className="text-[12px] text-ds-text-3">
          {mode === "licitacion"
            ? "El PDF final de licitación exige el 100% de las secciones aprobadas. El borrador lleva marca de agua."
            : "El PDF final comercial se arma desde estas secciones y exige el 100% aprobado. El borrador lleva marca de agua."}
        </p>
        {mode === "licitacion" && onMarkSentLicitacion ? (
          <Button
            type="button"
            className="h-10 sm:h-9"
            disabled={alreadySent || !proposalApproved || Boolean(markingSent) || Boolean(readOnly)}
            onClick={onMarkSentLicitacion}
          >
            {alreadySent ? "Ya marcada como enviada" : markingSent ? "Marcando…" : "Marcar enviada"}
          </Button>
        ) : null}
        {mode === "comercial" && onSendPortal ? (
          <Button
            type="button"
            className="h-10 sm:h-9"
            disabled={alreadySent || !proposalApproved || Boolean(readOnly)}
            onClick={onSendPortal}
          >
            Enviar propuesta (portal)
          </Button>
        ) : null}
      </div>
    </Surface>
  );
}
