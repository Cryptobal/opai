"use client";

/**
 * Acciones compartidas de PDF / WhatsApp para propuestas multi-instalación.
 * Usado por la barra sticky desktop y la bottom bar móvil.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { downloadOrShareFile } from "@/lib/files/download-or-share";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

function buildWaMeUrl(phone: string | null | undefined, message: string): string {
  const encoded = encodeURIComponent(message);
  const cleaned = (phone ?? "").trim();
  return cleaned
    ? `https://wa.me/${cleaned}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function useBundleShareActions(bundle: BundleDetail) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [waLoading, setWaLoading] = useState(false);
  const canResendWhatsApp = Boolean(bundle.contactId);
  const canDownloadPdf = bundle.totals.includedCount > 0;

  const downloadPdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      const result = await downloadOrShareFile({
        url: `/api/cpq/bundles/${bundle.id}/proposal-pdf`,
        filename: `${bundle.code}-propuesta-tecnica.pdf`,
        mimeType: "application/pdf",
      });
      if (result.method === "download") {
        toast.success("PDF listo");
      }
    } catch (e) {
      console.error("[Bundle PDF]", e);
      toast.error(e instanceof Error ? e.message : "Error al generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  }, [bundle.code, bundle.id]);

  const resendWhatsApp = useCallback(async () => {
    if (!bundle.contactId) {
      toast.error("Asigna un contacto a la propuesta");
      return;
    }
    setWaLoading(true);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/whatsapp-share`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo armar el mensaje de WhatsApp");
      }
      const url = buildWaMeUrl(json.data?.whatsappPhone, json.data?.whatsappMessage ?? "");
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("WhatsApp listo para enviar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al abrir WhatsApp");
    } finally {
      setWaLoading(false);
    }
  }, [bundle.contactId, bundle.id]);

  return {
    pdfLoading,
    waLoading,
    canDownloadPdf,
    canResendWhatsApp,
    downloadPdf,
    resendWhatsApp,
  };
}
