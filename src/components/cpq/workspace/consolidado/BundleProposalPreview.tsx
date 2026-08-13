"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CpqPdfPreviewPanel,
} from "@/components/cpq/CpqPdfPreviewPanel";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

export function BundleProposalPreview({ bundle }: { bundle: BundleDetail }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
        throw new Error(
          (j as { error?: string }).error || "Error al generar la propuesta técnica",
        );
      }
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

  return (
    <CpqPdfPreviewPanel
      mode="presentacion"
      templateSlug="standard"
      previewUrl={previewUrl}
      loading={loading}
      onModeChange={() => undefined}
      onTemplateSlugChange={() => undefined}
      onGenerate={generate}
      allowedModes={["presentacion"]}
      title="Propuesta técnica consolidada"
      description="Este es el PDF que se adjunta al enviar la propuesta multi-instalación."
      emptyPresentacionText="Genera el PDF para ver la propuesta técnica consolidada (todas las instalaciones incluidas)."
    />
  );
}
