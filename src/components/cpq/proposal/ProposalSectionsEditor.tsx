"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown, MessageCircle, Plus, Sparkles } from "lucide-react";
import { EmptyState, IconBubble, Spinner, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { toast } from "sonner";
import type { ProposalContentV2 } from "@/lib/cpq/proposal-sections/schema";
import type { ProposalValidation } from "@/lib/cpq/proposal-sections/validate";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import { isMissingGeneratableSection } from "@/lib/cpq/proposal-sections/generate-batch";
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
  quote: { id: string; code: string; dealId: string | null };
};

type PatchPayload = {
  content: ProposalContentV2;
  validations: ProposalValidation[];
  progress?: { generated: number; failed: number; skipped: number };
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
  onProposalStatusChange?: (status: ProposalContentV2["status"], approved: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [regenerateId, setRegenerateId] = useState<string | null>(null);
  const [regenerateInstruction, setRegenerateInstruction] = useState("");
  const autoGenStartedRef = useRef(false);

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
        data?: PatchPayload;
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
      const patched = json.data;
      setData((prev) =>
        prev
          ? { ...prev, content: patched.content, validations: patched.validations, gate: prev.gate, needsConversion: false }
          : prev,
      );
      setActiveId((current) =>
        patched.content.sections.some((item) => item.id === current)
          ? current
          : patched.content.sections[0]?.id ?? null,
      );
      return patched;
    } catch {
      toast.error("No se pudo guardar la propuesta");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Patch que lee el updatedAt más reciente (generación secuencial). */
  const patchLatest = useCallback(
    async (body: Record<string, unknown>, latestUpdatedAt: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/proposal-sections`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, expectedUpdatedAt: latestUpdatedAt }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: PatchPayload;
          error?: string;
          code?: string;
        };
        if (json.code === "conflict") {
          toast.error(json.error);
          await load();
          return null;
        }
        if (!res.ok || !json.success || !json.data) {
          toast.error(json.error || "No se pudo generar");
          return null;
        }
        const patched = json.data;
        setData((prev) =>
          prev
            ? {
                ...prev,
                content: patched.content,
                validations: patched.validations,
                gate: prev.gate,
                needsConversion: false,
              }
            : prev,
        );
        return patched;
      } catch {
        toast.error("No se pudo generar la propuesta");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [quoteId, load],
  );

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

  async function generateAll() {
    setGeneratingAll(true);
    setGenProgress(null);
    try {
      const result = await patch({ action: "generate_all" });
      if (!result) return;
      const summary = result.progress;
      toast.success(
        summary
          ? `Propuesta generada: ${summary.generated} secciones, ${summary.failed} pendientes, ${summary.skipped} automáticas.`
          : "Propuesta generada.",
      );
    } finally {
      setGeneratingAll(false);
    }
  }

  const runGenerateMissing = useCallback(
    async (sectionIds: string[], startUpdatedAt: string) => {
      setGeneratingAll(true);
      setGenProgress({ current: 0, total: sectionIds.length });
      let updatedAt = startUpdatedAt;
      try {
        for (let i = 0; i < sectionIds.length; i++) {
          setGenProgress({ current: i, total: sectionIds.length });
          const result = await patchLatest(
            { action: "generate_missing", sectionId: sectionIds[i] },
            updatedAt,
          );
          if (!result) continue;
          updatedAt = result.content.updatedAt;
          setGenProgress({ current: i + 1, total: sectionIds.length });
        }
      } finally {
        setGeneratingAll(false);
        setGenProgress(null);
      }
    },
    [patchLatest],
  );

  useEffect(() => {
    if (loading || readOnly || !data || autoGenStartedRef.current) return;
    if (data.content.mode !== "comercial") return;
    if (data.gate || data.needsConversion) return;
    const missing = data.content.sections
      .filter((section) => isMissingGeneratableSection(section))
      .sort((a, b) => a.order - b.order);
    if (missing.length === 0) return;
    autoGenStartedRef.current = true;
    void runGenerateMissing(
      missing.map((section) => section.id),
      data.content.updatedAt,
    );
  }, [loading, readOnly, data, runGenerateMissing]);

  async function addNewSection() {
    const title = addTitle.trim();
    if (!title || !data) return;
    const previousIds = new Set(data.content.sections.map((item) => item.id));
    const result = await patch({ action: "add", title });
    if (!result) return;
    const created = result.content.sections.find((item) => !previousIds.has(item.id));
    if (created) setActiveId(created.id);
    setAddTitle("");
    setAddOpen(false);
  }

  async function regenerateWithInstruction() {
    if (!regenerateId) return;
    const result = await patch({
      action: "regenerate",
      sectionId: regenerateId,
      instruction: regenerateInstruction,
    });
    if (!result) return;
    setActiveId(regenerateId);
    setRegenerateInstruction("");
    setRegenerateId(null);
    toast.success("Sección regenerada.");
  }

  async function removeProposalSection(sectionId: string, title: string) {
    const ok = await confirmDialog({
      title: "¿Eliminar esta sección?",
      description: `Se eliminará «${title}» de la propuesta. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;
    await patch({ action: "remove", sectionId });
  }

  async function moveSection(sectionId: string, direction: "up" | "down") {
    if (!data) return;
    const ordered = [...data.content.sections].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((item) => item.id === sectionId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    await patch({ action: "reorder", order: ordered.map((item) => item.id) });
  }

  async function moveSectionToExclusiones(sectionId: string, title: string) {
    const ok = await confirmDialog({
      title: "¿Mover a Exclusiones?",
      description: `El contenido de «${title}» se agregará a Exclusiones y la sección se quitará del índice.`,
      confirmLabel: "Mover",
    });
    if (!ok) return;
    await patch({ action: "move_exclusiones", sectionId });
  }

  async function saveAsFixed(sectionId: string) {
    const result = await patch({ action: "save_as_fixed", sectionId });
    if (result) toast.success("Sección guardada como fija de empresa.");
  }

  const section = data?.content.sections.find((s) => s.id === activeId) ?? data?.content.sections[0];
  const gated = data?.content.sections.filter((s) => !isAutoSection(s)) ?? [];
  const approved = gated.filter((s) => s.status === "aprobada").length;
  const total = gated.length;
  const mode = data?.content.mode ?? "comercial";
  const licitacionGate = mode === "licitacion" && Boolean(data?.gate);
  const proposalApproved = data?.content.status === "aprobada";
  const alreadySent = quoteStatus === "sent";
  const isGenerating = generatingAll || Boolean(genProgress);

  useEffect(() => {
    if (!data) return;
    onProposalStatusChange?.(data.content.status, proposalApproved);
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
              ) : null}
            </div>
          </div>
        </div>
        {!isGenerating ? (
          <div className="flex flex-wrap gap-2">
            {!readOnly ? (
              <>
                <Button
                  type="button"
                  className="h-10 sm:h-9"
                  disabled={loading || busy || licitacionGate}
                  onClick={() => void generateAll()}
                >
                  {generatingAll ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
                  {generatingAll ? "Generando propuesta…" : "Generar propuesta"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 sm:h-9"
                  disabled={loading || busy}
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Agregar sección
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10 sm:h-9"
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
        ) : null}
      </div>

      {isGenerating ? (
        <div className="flex items-center gap-3 rounded-xl border border-status-info-border bg-status-info-soft px-4 py-4 text-[13px] text-status-info-fg">
          <Spinner size="sm" />
          <div className="min-w-0">
            <p className="font-medium">
              ✦ Generando tu propuesta…
              {genProgress ? ` ${genProgress.current}/${genProgress.total}` : ""}
            </p>
            <p className="mt-0.5 text-[12px] opacity-80">
              Esto puede tardar unos minutos. Puedes cerrar y reabrir: se reanuda solo.
            </p>
          </div>
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
      ) : data && section && !isGenerating ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <div className="min-w-0 overflow-x-auto lg:overflow-visible">
              <ProposalSectionList
                sections={data.content.sections}
                activeId={section.id}
                onSelect={setActiveId}
                readOnly={Boolean(readOnly)}
                busy={busy}
                onRegenerate={(item) => {
                  setRegenerateInstruction("");
                  setRegenerateId(item.id);
                }}
                onToggleApproval={(item) =>
                  void patch({
                    action: item.status === "aprobada" ? "unapprove" : "approve",
                    sectionId: item.id,
                  })
                }
                onMove={(item, direction) => void moveSection(item.id, direction)}
                onRemove={(item) => void removeProposalSection(item.id, item.title)}
                onMoveExclusiones={(item) =>
                  void moveSectionToExclusiones(item.id, item.title)
                }
                onSaveAsFixed={(item) => void saveAsFixed(item.id)}
              />
            </div>
            <ProposalSectionPanel
              key={section.id}
              section={section}
              readOnly={Boolean(readOnly)}
              busy={busy}
              opening={economicOpening}
              onSave={(content, title) => {
                void patch({ action: "set_content", sectionId: section.id, content, title });
              }}
              onApprove={() => void patch({ action: "approve", sectionId: section.id })}
              onUnapprove={() => void patch({ action: "unapprove", sectionId: section.id })}
              onRegenerate={(instruction) =>
                void patch({ action: "regenerate", sectionId: section.id, instruction })
              }
              onSaveAsFixed={() => void saveAsFixed(section.id)}
              onDelete={() => void removeProposalSection(section.id, section.title)}
            />
          </div>
          <ProposalValidations items={data.validations} />
          <p className="text-[12px] text-ds-text-3">
            {mode === "licitacion"
              ? "Para enviar una licitación debes aprobar todas las secciones."
              : "En modo comercial puedes generar el PDF y enviar la propuesta sin aprobar el 100% de las secciones."}
          </p>
          {!readOnly &&
          mode === "licitacion" &&
          data.content.status !== "aprobada" &&
          data.content.status !== "enviada" ? (
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

      {!isGenerating ? (
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
              ? "Licitación: se envía la propuesta técnica (con oferta económica) y se marca la cotización como enviada. No hay portal ni correo."
              : "Comercial: PDF y envío están disponibles aunque queden secciones sin aprobar."}
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
      ) : null}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddTitle("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void addNewSection();
            }}
          >
            <DialogHeader>
              <DialogTitle>Agregar sección</DialogTitle>
              <DialogDescription>
                Crea una sección vacía para redactarla o generarla con IA.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="proposal-section-title">Título</Label>
              <Input
                id="proposal-section-title"
                autoFocus
                value={addTitle}
                onChange={(event) => setAddTitle(event.target.value)}
                placeholder="Ej. Plan de implementación"
                className="h-10 sm:h-9"
                disabled={busy}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => setAddOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="h-10 sm:h-9" disabled={busy || !addTitle.trim()}>
                {busy ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
                Agregar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(regenerateId)}
        onOpenChange={(open) => {
          if (!open) {
            setRegenerateId(null);
            setRegenerateInstruction("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void regenerateWithInstruction();
            }}
          >
            <DialogHeader>
              <DialogTitle>Regenerar sección</DialogTitle>
              <DialogDescription>
                Indica qué debe cambiar. Si la dejas vacía, se regenerará con los datos disponibles.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="proposal-regenerate-instruction">Instrucción</Label>
              <Input
                id="proposal-regenerate-instruction"
                autoFocus
                value={regenerateInstruction}
                onChange={(event) => setRegenerateInstruction(event.target.value)}
                placeholder="Ej. Enfatiza la continuidad operacional"
                className="h-10 sm:h-9"
                disabled={busy}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => setRegenerateId(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="h-10 sm:h-9" disabled={busy}>
                {busy ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
                Regenerar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Surface>
  );
}
