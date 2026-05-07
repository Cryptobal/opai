"use client";

/**
 * PdfPreviewDialog
 *
 * Modal grande con un PDF embebido vía <iframe>. Soporta DOS modos:
 *
 *   1. PDF persistido del DTE emitido (modo `dteId`):
 *      - Usa `/api/finance/billing/issued/[id]/pdf?inline=1` como src.
 *      - El PDF lo genera el provider (SimpleAPI) desde el XML firmado.
 *
 *   2. PDF de vista previa pre-emisión (modo `blobUrl`):
 *      - El caller genera el PDF (típicamente vía POST a
 *        `/api/finance/billing/preview-pdf`), crea un blob URL con
 *        `URL.createObjectURL()` y lo pasa acá.
 *      - Permite mostrar el PDF antes de gastar folio SII.
 *
 * El layout es 1400px max width × 95vh para que la factura A4 se vea
 * casi a tamaño real en monitor 1440+.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Eye } from "lucide-react";

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

interface BaseProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folio: number;
  dteType: number;
  /** Callback opcional para botón de descarga (delega al consumer). */
  onDownload?: () => void;
}

interface IssuedProps extends BaseProps {
  /** ID del DTE emitido (modo provider PDF). */
  dteId: string | null;
  blobUrl?: never;
  isPreview?: never;
}

interface BlobProps extends BaseProps {
  /** Blob URL del PDF generado client-side (modo preview). */
  blobUrl: string | null;
  /** Marca el modo como preview pre-emisión: cambia título y sin folio real. */
  isPreview?: boolean;
  dteId?: never;
}

type Props = IssuedProps | BlobProps;

export function PdfPreviewDialog(props: Props) {
  const { open, onOpenChange, folio, dteType, onDownload } = props;
  const dteLabel = DTE_TYPE_LABELS[dteType] ?? `Tipo ${dteType}`;
  const isPreview = "isPreview" in props && props.isPreview === true;

  // Resolver src del iframe según el modo.
  // - blobUrl: usar tal cual (URL.createObjectURL del caller).
  // - dteId: pegarle al endpoint del provider con #zoom=page-width&toolbar=1.
  const pdfUrl = (() => {
    if ("blobUrl" in props && props.blobUrl) {
      // El blob URL local no soporta `#zoom=` pero la mayoría de
      // browsers usan zoom default; el usuario tiene Ctrl/Cmd+/-.
      return props.blobUrl;
    }
    if ("dteId" in props && props.dteId) {
      return `/api/finance/billing/issued/${props.dteId}/pdf?inline=1#zoom=page-width&toolbar=1`;
    }
    return "";
  })();

  // Solo modo "issued" puede abrir en pestaña nueva; el preview usa
  // un blob temporal que muere al cerrar el dialog (revoke).
  const newTabUrl =
    "dteId" in props && props.dteId
      ? `/api/finance/billing/issued/${props.dteId}/pdf?inline=1`
      : null;

  const title = isPreview
    ? `Vista previa · ${dteLabel}`
    : `${dteLabel} N° ${folio}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1400px] h-[95vh] flex flex-col p-0 gap-0 sm:max-w-[1400px]">
        <DialogHeader className="px-6 py-4 border-b shrink-0 flex-row items-center justify-between gap-2 space-y-0">
          <DialogTitle className="font-display flex items-center gap-2">
            {isPreview && <Eye className="h-4 w-4 text-status-warn-fg" />}
            {title}
            {isPreview && (
              <span className="text-[12px] font-normal text-status-warn-fg ml-1">
                · NO emitido al SII
              </span>
            )}
          </DialogTitle>
          {newTabUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={newTabUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir en pestaña nueva
              </a>
            </Button>
          )}
        </DialogHeader>
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="flex-1 w-full bg-muted border-0"
            title={title}
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
