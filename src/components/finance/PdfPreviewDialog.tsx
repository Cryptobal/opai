"use client";

/**
 * PdfPreviewDialog
 *
 * Modal grande con el PDF del DTE embebido vía <iframe>. Usa el endpoint
 * /api/finance/billing/issued/[id]/pdf?inline=1 para que el navegador
 * renderice el PDF en lugar de descargarlo.
 *
 * Antes: max-w-5xl (1024px) con franjas grises laterales en monitor
 * grande y PDF chico adentro.
 * Ahora: ocupa hasta 1400px o 95vw (lo que sea menor), height 95vh.
 * Usa `#zoom=page-width` en la URL del iframe para que abra ajustado al
 * ancho del contenedor (visible). Botón "Abrir en pestaña nueva" para
 * inspección a tamaño real.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  41: "Boleta Exenta",
  43: "Liquidación Factura",
  46: "Factura Compra",
  52: "Guía de Despacho",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dteId: string | null;
  folio: number;
  dteType: number;
  /** Callback opcional para botón de descarga (delega al consumer). */
  onDownload?: () => void;
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  dteId,
  folio,
  dteType,
  onDownload,
}: Props) {
  const dteLabel = DTE_TYPE_LABELS[dteType] ?? `Tipo ${dteType}`;
  // `#zoom=page-width` hace que el visor PDF abra al ancho del iframe;
  // `&toolbar=1` muestra los controles nativos del navegador (zoom +/-,
  // ajustar página, descargar, imprimir).
  const pdfUrl = dteId
    ? `/api/finance/billing/issued/${dteId}/pdf?inline=1#zoom=page-width&toolbar=1`
    : "";
  const newTabUrl = dteId
    ? `/api/finance/billing/issued/${dteId}/pdf?inline=1`
    : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Antes max-w-5xl (1024px). Ahora hasta 1400px o 95vw (lo que sea
          menor), height 95vh — la factura A4 se ve a casi tamaño real
          en monitor 1440px+ y sigue dejando margen visual. */}
      <DialogContent className="w-[95vw] max-w-[1400px] h-[95vh] flex flex-col p-0 gap-0 sm:max-w-[1400px]">
        <DialogHeader className="px-6 py-4 border-b shrink-0 flex-row items-center justify-between gap-2 space-y-0">
          <DialogTitle className="font-display">
            {dteLabel} N° {folio}
          </DialogTitle>
          {dteId && (
            <Button variant="outline" size="sm" asChild>
              <a href={newTabUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir en pestaña nueva
              </a>
            </Button>
          )}
        </DialogHeader>
        {dteId ? (
          <iframe
            src={pdfUrl}
            className="flex-1 w-full bg-muted border-0"
            title={`Vista previa de ${dteLabel} ${folio}`}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Cargando…
          </div>
        )}
        <DialogFooter className="px-6 py-4 border-t shrink-0">
          {onDownload && (
            <Button variant="outline" onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
