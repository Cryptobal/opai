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

type Payload = {
  content: ProposalContentV2;
  validations: ProposalValidation[];
  gate: string | null;
  quote: { id: string; code: string; dealId: string | null };
};

export function ProposalSectionsEditor({
  quoteId,
  quoteLabel,
  readOnly,
}: {
  quoteId: string;
  quoteLabel: string;
  readOnly?: boolean;
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
          ? { ...prev, content: json.data!.content, validations: json.data!.validations, gate: prev.gate }
          : prev,
      );
    } finally {
      setBusy(false);
    }
  }

  const section = data?.content.sections.find((s) => s.id === activeId) ?? data?.content.sections[0];
  const approved = data?.content.sections.filter((s) => s.status === "aprobada").length ?? 0;
  const total = data?.content.sections.length ?? 0;
  const empty = !data || data.content.sections.every((s) => !s.content.trim()) && data.content.status === "borrador";

  return (
    <Surface elevation={1} padding="md" className="space-y-4 ds-page-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <IconBubble icon={Sparkles} variant="brand" size="sm" />
          <div>
            <p className="text-[13px] font-semibold text-ds-text-1">Propuesta por secciones</p>
            <p className="text-[12px] text-ds-text-3">
              {approved}/{total} aprobadas · {data?.content.status ?? "borrador"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-9"
            onClick={() =>
              openAnchoredChat({ anchorType: "cpq_quote", anchorId: quoteId, entityName: quoteLabel })
            }
          >
            <MessageCircle className="h-4 w-4" />
            Abrir chat
          </Button>
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
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
          <Spinner size="sm" /> Cargando secciones…
        </div>
      ) : error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : empty ? (
        <EmptyState
          icon={Sparkles}
          title="Todavía no hay índice"
          description="Abrí el chat y pedí: genera el índice de esta licitación."
        />
      ) : data && section ? (
        <>
          {data.gate ? (
            <p className="rounded-lg bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">{data.gate}</p>
          ) : null}
          <Tag variant={data.content.mode === "licitacion" ? "info" : "neutral"} size="sm">
            {data.content.mode === "licitacion" ? "Licitación" : "Comercial"}
          </Tag>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <ProposalSectionList sections={data.content.sections} activeId={section.id} onSelect={setActiveId} />
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
    </Surface>
  );
}
