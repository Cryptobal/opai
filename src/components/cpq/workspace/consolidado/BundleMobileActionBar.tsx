"use client";

/**
 * Bottom bar móvil del workspace multi-instalación: PDF, WhatsApp, agregar
 * instalación y Enviar. Complementa BundleStickyBar (solo desktop).
 */

import { FileDown, Loader2, MessageCircle, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";
import { useBundleShareActions } from "./useBundleShareActions";

export function BundleMobileActionBar({
  bundle,
  onAddInstallation,
  onSend,
}: {
  bundle: BundleDetail;
  onAddInstallation: () => void;
  onSend: () => void;
}) {
  const {
    pdfLoading,
    waLoading,
    canDownloadPdf,
    canResendWhatsApp,
    downloadPdf,
    resendWhatsApp,
  } = useBundleShareActions(bundle);

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-3 py-2 lg:hidden opai-liquid-glass-bar"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={!canDownloadPdf || pdfLoading}
          aria-label={pdfLoading ? "Generando PDF" : "Descargar o compartir PDF"}
          title="Descargar o compartir PDF técnico"
          onClick={() => void downloadPdf()}
        >
          {pdfLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 border-status-ok-border text-status-ok-fg"
          disabled={!canResendWhatsApp || waLoading}
          aria-label={waLoading ? "Preparando WhatsApp" : "Reenviar por WhatsApp"}
          title={
            !canResendWhatsApp
              ? "Asigna un contacto a la propuesta"
              : "Reenviar por WhatsApp"
          }
          onClick={() => void resendWhatsApp()}
        >
          {waLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="outline"
          className="h-11 gap-1.5"
          onClick={onAddInstallation}
        >
          <Plus className="h-4 w-4" />
          Instalación
        </Button>
        <Button
          className="h-11 min-w-0 flex-1 gap-1.5 bg-status-ok text-white hover:brightness-110 sm:flex-none"
          disabled={bundle.totals.includedCount === 0 || !bundle.accountId}
          title={
            !bundle.accountId
              ? "La propuesta no tiene cuenta asignada"
              : undefined
          }
          onClick={onSend}
        >
          <Send className="h-4 w-4" />
          Enviar
        </Button>
      </div>
      <div className="h-16 lg:hidden" />
    </>
  );
}
