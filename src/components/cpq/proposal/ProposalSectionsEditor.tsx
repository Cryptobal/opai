"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileDown,
  FileText,
  MessageCircle,
  MoreVertical,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { toast } from "sonner";
import type { ProposalContentV2, ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import type { ProposalValidation } from "@/lib/cpq/proposal-sections/validate";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import { isMissingGeneratableSection } from "@/lib/cpq/proposal-sections/generate-batch";
import type { EconomicOpening } from "@/lib/cpq/economic-opening";
import { ProposalSectionList } from "./ProposalSectionList";
import { ProposalSectionSheet } from "./ProposalSectionSheet";
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
  markingSent,
  economicOpening,
  onProposalStatusChange,
  onProposalReadyChange,
}: {
  quoteId: string;
  quoteLabel: string;
  readOnly?: boolean;
  dealId?: string | null;
  quoteStatus?: string;
  onMarkSentLicitacion?: () => void;
  markingSent?: boolean;
  economicOpening?: EconomicOpening | null;
  onProposalStatusChange?: (status: ProposalContentV2["status"], approved: boolean) => void;
  /** Comercial: true cuando hay al menos una sección con contenido (listo para enviar). */
  onProposalReadyChange?: (ready: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetSectionId, setSheetSectionId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const autoGenStartedRef = useRef(false);
  const dataRef = useRef<Payload | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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
    } catch {
      setError("No se pudo cargar la propuesta");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPatched = useCallback((patched: PatchPayload) => {
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
  }, []);

  const patchLatest = useCallback(
    async (body: Record<string, unknown>, latestUpdatedAt?: string) => {
      const updatedAt = latestUpdatedAt ?? dataRef.current?.content.updatedAt;
      if (!updatedAt) return null;
      setBusy(true);
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/proposal-sections`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, expectedUpdatedAt: updatedAt }),
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
        return applyPatched(json.data);
      } catch {
        toast.error("No se pudo guardar la propuesta");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [quoteId, load, applyPatched],
  );

  async function patch(body: Record<string, unknown>) {
    return patchLatest(body);
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
    autoGenStartedRef.current = false;
    await load();
  }

  async function generateAll() {
    setGeneratingAll(true);
    setGenProgress(null);
    try {
      const result = await patch({ action: "generate_all" });
      if (!result) return;
      setFailedIds(new Set());
      const summary = result.progress;
      toast.success(
        summary
          ? `Propuesta regenerada: ${summary.generated} secciones, ${summary.failed} pendientes.`
          : "Propuesta regenerada.",
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
      const nextFailed = new Set<string>();
      try {
        for (let i = 0; i < sectionIds.length; i++) {
          const sectionId = sectionIds[i]!;
          setGenProgress({ current: i, total: sectionIds.length });
          const result = await patchLatest(
            { action: "generate_missing", sectionId },
            updatedAt,
          );
          if (!result) {
            nextFailed.add(sectionId);
            continue;
          }
          updatedAt = result.content.updatedAt;
          const section = result.content.sections.find((item) => item.id === sectionId);
          if (section && !section.content.trim()) nextFailed.add(sectionId);
          setGenProgress({ current: i + 1, total: sectionIds.length });
        }
      } finally {
        setFailedIds(nextFailed);
        setGeneratingAll(false);
        setGenProgress(null);
      }
    },
    [patchLatest],
  );

  // Autogeneración al abrir: en comercial y en licitación (esta última solo
  // cuando ya hay bases extraídas y no queda conversión pendiente).
  useEffect(() => {
    if (loading || readOnly || !data || autoGenStartedRef.current) return;
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

  /** Autosave del editor inline (debounce en el propio editor). */
  const saveSectionContent = useCallback(
    async (sectionId: string, content: string) => {
      const result = await patchLatest({ action: "set_content", sectionId, content });
      return Boolean(result);
    },
    [patchLatest],
  );

  async function addNewSection() {
    const title = addTitle.trim();
    if (!title || !data) return;
    const previousIds = new Set(data.content.sections.map((item) => item.id));
    const result = await patch({ action: "add", title });
    if (!result) return;
    const created = result.content.sections.find((item) => !previousIds.has(item.id));
    if (created) {
      setSheetSectionId(created.id);
      setExpandedId(created.id);
    }
    setAddTitle("");
    setAddOpen(false);
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
    setSheetSectionId((current) => (current === sectionId ? null : current));
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

  async function saveAsFixed(sectionId: string) {
    const result = await patch({ action: "save_as_fixed", sectionId });
    if (result) toast.success("Sección guardada como fija de empresa.");
  }

  const sections = data?.content.sections ?? [];
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const sheetSection =
    ordered.find((section) => section.id === sheetSectionId) ?? null;
  const gated = sections.filter((s) => !isAutoSection(s));
  const approved = gated.filter((s) => s.status === "aprobada").length;
  const withContent = gated.filter((s) => s.content.trim()).length;
  const total = gated.length;
  // Gate de envío en licitación: todas las secciones no-auto con contenido.
  // La aprobación por sección quedó como marca opcional de revisión.
  const contentComplete = total > 0 && withContent === total;
  const mode = data?.content.mode ?? "comercial";
  const licitacionGate = mode === "licitacion" && Boolean(data?.gate);
  const proposalApproved = data?.content.status === "aprobada";
  const alreadySent = quoteStatus === "sent";
  const isGenerating = generatingAll || Boolean(genProgress);
  const hasContent = sections.some(
    (section) => isAutoSection(section) || Boolean(section.content.trim()),
  );
  const canMarkLicitacion =
    mode === "licitacion" &&
    contentComplete &&
    !readOnly &&
    !alreadySent &&
    Boolean(onMarkSentLicitacion);

  useEffect(() => {
    if (!data) return;
    onProposalStatusChange?.(data.content.status, proposalApproved);
  }, [data, proposalApproved, onProposalStatusChange]);

  useEffect(() => {
    onProposalReadyChange?.(mode === "comercial" ? hasContent : contentComplete);
  }, [mode, hasContent, contentComplete, onProposalReadyChange]);

  function openChat() {
    openAnchoredChat({
      anchorType: "cpq_quote",
      anchorId: quoteId,
      entityName: quoteLabel,
    });
  }

  function canMove(section: ProposalSection, direction: "up" | "down"): boolean {
    const index = ordered.findIndex((item) => item.id === section.id);
    if (index < 0) return false;
    if (section.invariant === "identificacion") return false;
    if (direction === "up") {
      return index > 0 && ordered[index - 1]?.invariant !== "identificacion";
    }
    return index < ordered.length - 1;
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-4 ds-page-enter">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <IconBubble icon={Sparkles} variant="brand" size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ds-text-1">Propuesta</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Tag variant={mode === "licitacion" ? "info" : "neutral"} size="sm">
                {mode === "licitacion" ? "Licitación" : "Comercial"}
              </Tag>
              <Tag variant={proposalApproved ? "ok" : "neutral"} size="sm">
                {STATUS_LABEL[data?.content.status ?? "borrador"] ?? "Borrador"}
              </Tag>
              {mode === "licitacion" ? (
                <span className="text-[12px] text-ds-text-3">
                  {withContent}/{total} con contenido
                  {approved > 0 ? ` · ${approved} revisadas` : ""}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {!isGenerating ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 sm:h-9 sm:w-9"
                aria-label="Más acciones de la propuesta"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem asChild>
                <a href={`/api/cpq/quotes/${quoteId}/proposal-pdf?mode=draft`} target="_blank" rel="noreferrer">
                  <FileDown className="h-4 w-4" />
                  PDF borrador
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/cpq/quotes/${quoteId}/proposal-pdf?mode=final`} target="_blank" rel="noreferrer">
                  <FileText className="h-4 w-4" />
                  PDF final
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {!readOnly ? (
                <>
                  <DropdownMenuItem
                    disabled={loading || busy || licitacionGate}
                    onSelect={() => void generateAll()}
                  >
                    <Sparkles className="h-4 w-4" />
                    Regenerar todo
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={loading || busy} onSelect={() => setAddOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Agregar sección
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem onSelect={() => openChat()}>
                <MessageCircle className="h-4 w-4" />
                Abrir chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              Puedes cerrar y reabrir: se reanuda solo con las secciones que falten.
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
            <Button
              type="button"
              size="sm"
              className="h-10 sm:h-9"
              disabled={busy}
              onClick={() => void convertToLicitacion()}
            >
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
      ) : data && !isGenerating ? (
        <>
          <ProposalSectionList
            sections={data.content.sections}
            expandedId={expandedId}
            onToggleExpand={(id) =>
              setExpandedId((current) => (current === id ? null : id))
            }
            onEdit={(section) => setSheetSectionId(section.id)}
            readOnly={Boolean(readOnly)}
            mode={mode}
            opening={economicOpening}
            failedIds={failedIds}
            onInlineSave={saveSectionContent}
            onRetry={(section) => {
              setFailedIds((prev) => {
                const next = new Set(prev);
                next.delete(section.id);
                return next;
              });
              void runGenerateMissing([section.id], data.content.updatedAt);
            }}
          />
          <ProposalValidations items={data.validations} />

          {!readOnly ? (
            <div className="sticky bottom-0 z-10 -mx-1 space-y-2 border-t border-ds-border-subtle bg-ds-surface-1/95 px-1 pt-3 backdrop-blur-sm">
              {mode === "comercial" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full sm:h-9"
                  asChild
                >
                  <a
                    href={`/api/cpq/quotes/${quoteId}/proposal-pdf?mode=final`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText className="h-4 w-4" />
                    Ver PDF
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-11 w-full gap-2 text-sm font-semibold"
                  disabled={!canMarkLicitacion || Boolean(markingSent)}
                  onClick={onMarkSentLicitacion}
                >
                  {markingSent ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
                  {alreadySent
                    ? "Ya marcada como enviada"
                    : markingSent
                      ? "Marcando…"
                      : `Marcar enviada (${withContent}/${total})`}
                </Button>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <ProposalSectionSheet
        open={Boolean(sheetSection)}
        onOpenChange={(open) => {
          if (!open) setSheetSectionId(null);
        }}
        section={sheetSection}
        readOnly={Boolean(readOnly)}
        busy={busy}
        mode={mode}
        opening={economicOpening}
        canMoveUp={sheetSection ? canMove(sheetSection, "up") : false}
        canMoveDown={sheetSection ? canMove(sheetSection, "down") : false}
        onSave={async (content, title) => {
          if (!sheetSection) return;
          await patch({
            action: "set_content",
            sectionId: sheetSection.id,
            content,
            title,
          });
        }}
        onApprove={() => {
          if (!sheetSection) return;
          void patch({ action: "approve", sectionId: sheetSection.id });
        }}
        onUnapprove={() => {
          if (!sheetSection) return;
          void patch({ action: "unapprove", sectionId: sheetSection.id });
        }}
        onRegenerate={async (instruction) => {
          if (!sheetSection) return;
          const result = await patch({
            action: "regenerate",
            sectionId: sheetSection.id,
            instruction,
          });
          if (result) toast.success("Sección regenerada.");
        }}
        onSaveAsFixed={() => {
          if (!sheetSection) return;
          void saveAsFixed(sheetSection.id);
        }}
        onDelete={() => {
          if (!sheetSection) return;
          void removeProposalSection(sheetSection.id, sheetSection.title);
        }}
        onMove={(direction) => {
          if (!sheetSection) return;
          void moveSection(sheetSection.id, direction);
        }}
      />

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
    </Surface>
  );
}
