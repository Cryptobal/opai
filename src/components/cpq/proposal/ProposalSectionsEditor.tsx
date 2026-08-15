"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown, MessageCircle, Plus, Sparkles, RefreshCw } from "lucide-react";
import { EmptyState, IconBubble, Spinner, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { toast } from "sonner";
import type { ProposalContentV2 } from "@/lib/cpq/proposal-sections/schema";
import type { ProposalValidation } from "@/lib/cpq/proposal-sections/validate";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import type { EconomicOpening } from "@/lib/cpq/economic-opening";
import { ProposalSectionList } from "./ProposalSectionList";
import { ProposalSectionPanel } from "./ProposalSectionPanel";
import { ProposalValidations } from "./ProposalValidations";
import { confirmDialog } from "@/components/ui/confirm-service";

type Payload = {
  content: ProposalContentV2;
  validations: ProposalValidation[];
  gate: string | null;
  needsConversion?: boolean;
  autoGeneratePending?: boolean;
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
  economicOpening,
  onProposalStatusChange,
}: {
  quoteId: string;
  quoteLabel: string;
  readOnly?: boolean;
  dealId?: string | null;
  quoteStatus?: string;
  onMarkSentLicitacion?: () => void;
  onSendPortal?: () => void;
  markingSent?: boolean;
  economicOpening?: EconomicOpening | null;
  onProposalStatusChange?: (
    status: ProposalContentV2["status"],
    approved: boolean,
    mode?: ProposalContentV2["mode"],
  ) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const autogenStarted = useRef(false);

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
      return json.data;
    } catch {
      setError("No se pudo cargar la propuesta");
      return null;
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  async function patch(body: Record<string, unknown>) {
    if (!data) return null;
    setBusy(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/proposal-sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expectedUpdatedAt: data.content.updatedAt }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: {
          content: ProposalContentV2;
          validations: ProposalValidation[];
          autoGeneratePending?: boolean;
        };
        error?: string;
        code?: string;
      };
      if (json.code === "conflict") {
        toast.error(json.error);
        await load();
        return null;
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || "No se pudo guardar");
        return null;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              content: json.data!.content,
              validations: json.data!.validations,
              gate: prev.gate,
              needsConversion: false,
              autoGeneratePending: json.data!.autoGeneratePending ?? false,
            }
          : prev,
      );
      return json.data;
    } finally {
      setBusy(false);
    }
  }

  const runGenerateAll = useCallback(async () => {
    if (!data || readOnly) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/proposal-sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_all",
          expectedUpdatedAt: data.content.updatedAt,
        }),
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
        toast.error(json.error || "No se pudo generar la propuesta");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              content: json.data!.content,
              validations: json.data!.validations,
              autoGeneratePending: false,
            }
          : prev,
      );
      toast.success("Propuesta generada");
    } finally {
      setGenerating(false);
    }
  }, [data, quoteId, readOnly, load]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-generación comercial al abrir por primera vez
  useEffect(() => {
    if (!data || readOnly || autogenStarted.current) return;
    if (data.content.mode !== "comercial") return;
    if (!data.autoGeneratePending) return;
    if (data.gate) return;
    autogenStarted.current = true;
    void runGenerateAll();
  }, [data, readOnly, runGenerateAll]);

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
  const ordered = data ? [...data.content.sections].sort((a, b) => a.order - b.order) : [];
  const gated = ordered.filter((s) => !isAutoSection(s));
  const approved = gated.filter((s) => s.status === "aprobada").length;
  const total = gated.length;
  const mode = data?.content.mode ?? "comercial";
  const licitacionGate = mode === "licitacion" && Boolean(data?.gate);
  const proposalApproved = data?.content.status === "aprobada";
  const alreadySent = quoteStatus === "sent";
  const hasContent = ordered.some((s) => s.content.trim() && !isAutoSection(s));
  const activeIdx = section ? ordered.findIndex((s) => s.id === section.id) : -1;

  useEffect(() => {
    if (!data) return;
    onProposalStatusChange?.(data.content.status, proposalApproved, data.content.mode);
  }, [data, proposalApproved, onProposalStatusChange]);

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
              {mode === "licitacion" ? (
                <span className="text-[12px] text-ds-text-3">
                  {approved}/{total} aprobadas
                </span>
              ) : (
                <span className="text-[12px] text-ds-text-3">
                  {ordered.length} capítulos · envío sin aprobar
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && !licitacionGate ? (
            <Button
              type="button"
              className="h-10 sm:h-9"
              disabled={busy || generating}
              onClick={() => void runGenerateAll()}
            >
              {generating ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {hasContent ? "Regenerar todo" : "Generar propuesta"}
            </Button>
          ) : null}
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
      </div>

      {generating ? (
        <div className="flex items-center gap-2 rounded-lg border border-status-info-border bg-status-info-soft px-3 py-2 text-[13px] text-status-info-fg">
          <Spinner size="sm" />
          Generando capítulos… las fijas ya están listas; la IA completa el resto.
        </div>
      ) : null}

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
            <div className="min-w-0 space-y-2 overflow-x-auto lg:overflow-visible">
              <ProposalSectionList
                sections={data.content.sections}
                activeId={section.id}
                onSelect={setActiveId}
                generating={generating}
              />
              {!readOnly ? (
                showAdd ? (
                  <div className="flex gap-2">
                    <Input
                      value={addTitle}
                      onChange={(e) => setAddTitle(e.target.value)}
                      placeholder="Título de la sección"
                      className="h-10 sm:h-9"
                    />
                    <Button
                      type="button"
                      className="h-10 sm:h-9"
                      disabled={busy || !addTitle.trim()}
                      onClick={async () => {
                        const saved = await patch({ action: "add", title: addTitle.trim() });
                        if (saved) {
                          const neu = saved.content.sections.find((s) => s.title === addTitle.trim());
                          if (neu) setActiveId(neu.id);
                          setAddTitle("");
                          setShowAdd(false);
                        }
                      }}
                    >
                      Agregar
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full sm:h-9"
                    disabled={busy}
                    onClick={() => setShowAdd(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Agregar sección
                  </Button>
                )
              ) : null}
            </div>
            <ProposalSectionPanel
              key={section.id}
              section={section}
              readOnly={Boolean(readOnly)}
              busy={busy || generating}
              opening={economicOpening}
              canMoveUp={activeIdx > 1}
              canMoveDown={
                activeIdx >= 0 &&
                activeIdx < ordered.length - 1 &&
                !section.invariant &&
                !isAutoSection(section)
              }
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
              onRemove={
                section.invariant || isAutoSection(section)
                  ? undefined
                  : async () => {
                      const ok = await confirmDialog({
                        title: "¿Eliminar sección?",
                        description: `Se eliminará «${section.title}».`,
                        confirmLabel: "Eliminar",
                      });
                      if (!ok) return;
                      await patch({ action: "remove", sectionId: section.id });
                    }
              }
              onMoveUp={
                activeIdx > 1
                  ? () => {
                      const ids = ordered.map((s) => s.id);
                      const a = ids[activeIdx]!;
                      ids[activeIdx] = ids[activeIdx - 1]!;
                      ids[activeIdx - 1] = a;
                      void patch({ action: "reorder", order: ids });
                    }
                  : undefined
              }
              onMoveDown={
                activeIdx >= 0 && activeIdx < ordered.length - 1
                  ? () => {
                      const ids = ordered.map((s) => s.id);
                      const a = ids[activeIdx]!;
                      ids[activeIdx] = ids[activeIdx + 1]!;
                      ids[activeIdx + 1] = a;
                      void patch({ action: "reorder", order: ids });
                    }
                  : undefined
              }
              onSaveAsFixed={
                section.invariant || isAutoSection(section)
                  ? undefined
                  : () => {
                      void patch({ action: "save_as_fixed", sectionId: section.id }).then((r) => {
                        if (r) toast.success("Guardada en biblioteca fija de la empresa");
                      });
                    }
              }
            />
          </div>
          <ProposalValidations items={data.validations} />
          {!readOnly && mode === "licitacion" && data.content.status !== "aprobada" && data.content.status !== "enviada" ? (
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
            ? "Licitación: se envía la propuesta técnica (con oferta económica) y se marca la cotización como enviada. Requiere 100% de secciones aprobadas."
            : "Comercial: se envía la cotización PDF y la propuesta técnica (con oferta económica) por portal o correo. No exige aprobar secciones."}
        </p>
        <div className="hidden lg:block space-y-2">
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
            disabled={alreadySent || Boolean(readOnly)}
            onClick={onSendPortal}
          >
            Enviar propuesta (portal)
          </Button>
        ) : null}
        </div>
      </div>
    </Surface>
  );
}
