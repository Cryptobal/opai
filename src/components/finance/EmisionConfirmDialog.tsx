"use client";

/**
 * Modal de confirmación pre-emisión SII. Reusable para Factura, NC, ND.
 * Muestra resumen + advertencia + checkboxes (auto-email receptor / xml
 * backoffice) y delega la emisión real al onConfirm del padre.
 */
import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const DTE_NAMES: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  41: "Boleta Exenta",
  52: "Guía de Despacho",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

export interface EmisionConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (opts: { autoSendEmail: boolean; sendXmlToBackoffice: boolean }) => void;
  loading: boolean;
  dteType: number;
  receiver: { name: string; rut: string; email: string | null };
  totals: {
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
    currency: "CLP" | "UF" | string;
    ufValue?: number;
    totalUf?: number;
  };
  lines: Array<{
    itemName: string;
    quantity: number;
    unitPrice: number;
    unitPriceUf?: number | null;
  }>;
  defaultBackofficeEmails: string[];
  defaultBackofficeAlwaysSend: boolean;
}

function fmtCLP(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export function EmisionConfirmDialog(props: EmisionConfirmProps) {
  const {
    open,
    onClose,
    onConfirm,
    loading,
    dteType,
    receiver,
    totals,
    lines,
    defaultBackofficeEmails,
    defaultBackofficeAlwaysSend,
  } = props;

  const [autoSendEmail, setAutoSendEmail] = React.useState<boolean>(true);
  const [sendXml, setSendXml] = React.useState<boolean>(defaultBackofficeAlwaysSend || defaultBackofficeEmails.length > 0);

  React.useEffect(() => {
    if (open) {
      setAutoSendEmail(true);
      setSendXml(defaultBackofficeAlwaysSend || defaultBackofficeEmails.length > 0);
    }
  }, [open, defaultBackofficeAlwaysSend, defaultBackofficeEmails.length]);

  const visibleLines = lines.slice(0, 5);
  const moreLines = Math.max(0, lines.length - visibleLines.length);
  const tipoNombre = DTE_NAMES[dteType] ?? "Documento";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar emisión al SII</DialogTitle>
          <DialogDescription>{tipoNombre}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="grid grid-cols-[120px_1fr] gap-y-1">
              <span className="text-muted-foreground">Receptor:</span>
              <span className="font-medium">{receiver.name}</span>
              <span className="text-muted-foreground">RUT:</span>
              <span>{receiver.rut}</span>
              <span className="text-muted-foreground">Email:</span>
              <span>{receiver.email ?? "—"}</span>
              <span className="text-muted-foreground">Neto:</span>
              <span className="font-mono">{fmtCLP(totals.netAmount)}</span>
              <span className="text-muted-foreground">IVA:</span>
              <span className="font-mono">{fmtCLP(totals.taxAmount)}</span>
              <span className="text-muted-foreground">Total CLP:</span>
              <span className="font-mono font-semibold">{fmtCLP(totals.totalAmount)}</span>
              {totals.currency === "UF" && totals.totalUf != null && (
                <>
                  <span className="text-muted-foreground">≈</span>
                  <span>{totals.totalUf.toFixed(4)} UF (UF día = ${totals.ufValue?.toLocaleString("es-CL")})</span>
                </>
              )}
            </div>
            <p className="mt-2 pt-2 border-t border-border text-[12px] text-muted-foreground">
              Estos son los montos <strong>exactos</strong> que recibirá el SII.
              Si no coinciden con tu expectativa, cancelá y revisá las
              cantidades y precios antes de emitir.
            </p>
          </div>

          <div className="text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Líneas</div>
            <ul className="space-y-1">
              {visibleLines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">
                    {l.quantity}x {l.itemName}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {l.unitPriceUf != null
                      ? `${l.unitPriceUf} UF c/u`
                      : fmtCLP(l.unitPrice)}
                  </span>
                </li>
              ))}
              {moreLines > 0 && (
                <li className="text-xs text-muted-foreground">+ {moreLines} línea{moreLines === 1 ? "" : "s"} más</li>
              )}
            </ul>
          </div>

          {totals.currency === "UF" && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              Conversión UF→CLP usando UF del día (${totals.ufValue?.toLocaleString("es-CL")} CLP por UF).
              Los montos al SII van en CLP. La UF queda como auditoría interna.
            </div>
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-auto-email"
              checked={autoSendEmail}
              onCheckedChange={(c) => setAutoSendEmail(c === true)}
              disabled={loading || !receiver.email}
            />
            <Label htmlFor="confirm-auto-email" className="text-sm leading-tight">
              Enviar email automáticamente al receptor
              {!receiver.email && (
                <span className="block text-xs text-muted-foreground">
                  El receptor no tiene email; este envío se omite.
                </span>
              )}
            </Label>
          </div>

          {defaultBackofficeEmails.length > 0 && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="confirm-send-xml"
                checked={sendXml}
                onCheckedChange={(c) => setSendXml(c === true)}
                disabled={loading || defaultBackofficeAlwaysSend}
              />
              <Label htmlFor="confirm-send-xml" className="text-sm leading-tight">
                Enviar XML al backoffice ({defaultBackofficeEmails.length} destinatario
                {defaultBackofficeEmails.length === 1 ? "" : "s"})
                {defaultBackofficeAlwaysSend && (
                  <span className="block text-xs text-muted-foreground">
                    Configurado como "siempre enviar" — no se puede desmarcar.
                  </span>
                )}
              </Label>
            </div>
          )}

          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <strong>Una vez emitido, el DTE se envía al SII. No se puede deshacer.</strong>
                <p className="mt-1 text-xs">
                  Si necesitas corregirlo después tendrás que emitir una Nota de Crédito (anula) o
                  Nota de Débito.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm({ autoSendEmail, sendXmlToBackoffice: sendXml })}
            disabled={loading}
          >
            {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
            Emitir y enviar al SII
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
