"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  CpqPdfPreviewPanel,
} from "@/components/cpq/CpqPdfPreviewPanel";
import { Button } from "@/components/ui/button";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";
import { isFinalProposalGateError } from "@/lib/pdf/templates/proposal/final-proposal-gate";

export function BundleProposalPreview({
  bundle,
  referenceQuoteId,
}: {
  bundle: BundleDetail;
  referenceQuoteId: string | null;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const included = bundle.totals.includedCount;

  const generate = async (): Promise<string | null> => {
    if (included === 0) {
      toast.error("Incluye al menos una instalación para generar el PDF");
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/proposal-pdf?t=${Date.now()}`);
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("pdf")) {
        const j = await res.json().catch(() => ({}));
        const message =
          (j as { error?: string }).error || "Error al generar la propuesta técnica";
        if (isFinalProposalGateError(res.status, message) && referenceQuoteId) {
          setGateMessage(message);
        } else {
          setGateMessage(null);
        }
        throw new Error(message);
      }
      setGateMessage(null);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return url;
      });
      return url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al generar el PDF");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const completeWithAi = async () => {
    if (!referenceQuoteId) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${referenceQuoteId}/proposal-sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_missing" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo completar la propuesta con IA");
        return;
      }
      toast.success("Secciones completadas. Regenerando PDF…");
      await generate();
    } finally {
      setCompleting(false);
    }
  };

  return (
    <CpqPdfPreviewPanel
      mode="presentacion"
      templateSlug="standard"
      previewUrl={previewUrl}
      loading={loading || completing}
      onModeChange={() => undefined}
      onTemplateSlugChange={() => undefined}
      onGenerate={generate}
      allowedModes={["presentacion"]}
      title="Propuesta técnica consolidada"
      description="Este es el PDF que se adjunta al enviar la propuesta multi-instalación."
      emptyPresentacionText="Genera el PDF para ver la propuesta técnica consolidada (todas las instalaciones incluidas)."
      footer={
        gateMessage && referenceQuoteId ? (
          <div className="space-y-2 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-3">
            <p className="text-[13px] text-status-warn-fg">{gateMessage}</p>
            <Button
              type="button"
              className="h-11 w-full sm:h-9 sm:w-auto"
              disabled={completing || loading}
              onClick={() => void completeWithAi()}
            >
              <Sparkles className="h-4 w-4" />
              {completing ? "Completando…" : "Completar con IA"}
            </Button>
          </div>
        ) : null
      }
    />
  );
}
