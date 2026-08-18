"use client";

/**
 * PdfPreviewDialog
 *
 * Modal grande con un PDF embebido vía <iframe>. Soporta DOS modos:
 *
 *   1. PDF persistido del DTE emitido (modo `dteId`)
 *   2. PDF de vista previa pre-emisión (modo `blobUrl`)
 *
 * En móvil el header incluye el botón Compartir (iOS) para reenviar por WhatsApp.
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
import { DocumentShareButton } from "@/components/shared/DocumentShareButton";

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

  const pdfUrl = (() => {
    if ("blobUrl" in props && props.blobUrl) {
      return props.blobUrl;
    }
    if ("dteId" in props && props.dteId) {
      return `/api/finance/billing/issued/${props.dteId}/pdf?inline=1#zoom=page-width&toolbar=1`;
    }
    return "";
  })();

  const shareUrl = (() => {
    if ("blobUrl" in props && props.blobUrl) return props.blobUrl;
    if ("dteId" in props && props.dteId) {
      return `/api/finance/billing/issued/${props.dteId}/pdf?inline=1`;
    }
    return "";
  })();

  const newTabUrl =
    "dteId" in props && props.dteId
      ? `/api/finance/billing/issued/${props.dteId}/pdf?inline=1`
      : null;

  const title = isPreview
    ? `Vista previa · ${dteLabel}`
    : `${dteLabel} N° ${folio}`;

  const shareFilename = isPreview
    ? `preview-${dteType}.pdf`
    : `${dteLabel.replace(/\s+/g, "-")}-${folio}.pdf`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70]"
        className="z-[70] w-[95vw] max-w-[1400px] h-[95vh] flex flex-col p-0 gap-0 sm:max-w-[1400px]"
      >
        <DialogHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b shrink-0 flex-row items-center justify-between gap-2 space-y-0">
          <DialogTitle className="font-display flex min-w-0 items-center gap-2 text-[15px] sm:text-base">
            {isPreview && <Eye className="h-4 w-4 shrink-0 text-status-warn-fg" />}
            <span className="truncate">{title}</span>
            {isPreview && (
              <span className="hidden text-[12px] font-normal text-status-warn-fg sm:inline">
                · NO emitido al SII
              </span>
            )}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {shareUrl ? (
              <DocumentShareButton
                url={shareUrl}
                filename={shareFilename}
                mimeType="application/pdf"
                tone="light"
                size="md"
              />
            ) : null}
            {newTabUrl && (
              <Button variant="outline" size="sm" className="hidden h-10 sm:inline-flex" asChild>
                <a href={newTabUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Abrir
                </a>
              </Button>
            )}
          </div>
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
        <DialogFooter className="px-4 py-3 sm:px-6 sm:py-4 border-t shrink-0 gap-2">
          {onDownload && (
            <Button variant="outline" className="h-10" onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          )}
          <Button className="h-10" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
