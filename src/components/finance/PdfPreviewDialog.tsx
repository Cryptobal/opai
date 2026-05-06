"use client";

/**
 * PdfPreviewDialog
 *
 * Modal grande con el PDF del DTE embebido vía <iframe>. Usa el endpoint
 * /api/finance/billing/issued/[id]/pdf?inline=1 para que el navegador
 * renderice el PDF en lugar de descargarlo.
 *
 * El botón "Descargar" delega al callback opcional `onDownload`, que
 * típicamente invoca el handler existente de la tabla / detalle.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

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
  const pdfUrl = dteId
    ? `/api/finance/billing/issued/${dteId}/pdf?inline=1`
    : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>
            {dteLabel} N° {folio}
          </DialogTitle>
        </DialogHeader>
        {dteId ? (
          <iframe
            src={pdfUrl}
            className="flex-1 w-full bg-muted"
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
