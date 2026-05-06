"use client";

/**
 * IssuedDteDetailDialog — modal de detalle de un DTE emitido.
 *
 * Muestra todo el detalle granular de la factura/boleta/NC/ND emitida:
 *   - Datos del receptor (RUT, razón social, giro, dirección, comuna, ciudad, email)
 *   - Líneas de la factura (item, cantidad, precio, subtotal)
 *   - Totales (neto, IVA, total)
 *   - Estado SII (con botón actualizar) + email (con botón reenviar)
 *   - Centro de costo (editable inline dentro del modal)
 *   - Referencias (OC, HES, Contrato si las tiene)
 *   - Acciones: descargar PDF/XML, emitir NC/ND, copiar link visor SII
 *
 * Se carga vía /api/finance/billing/issued/[id] al abrir (incluye líneas).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, FileCode, Mail, RefreshCw, Loader2,
  FileMinus, FilePlus, ExternalLink, Copy, Coins,
} from "lucide-react";
import { CederDteDialog } from "./factoring/CederDteDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CostCenterEditor } from "./CostCenterEditor";
import { DteEmailTimeline } from "./DteEmailTimeline";

interface DteLine {
  id: string;
  lineNumber: number;
  itemName: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  discountPct: number;
  netAmount: number;
  isExempt: boolean;
}

interface DteFull {
  id: string;
  dteType: number;
  folio: number;
  date: string;
  createdAt: string;
  receiverRut: string;
  receiverName: string;
  receiverEmail: string | null;
  receiverGiro: string | null;
  receiverDireccion: string | null;
  receiverComuna: string | null;
  receiverCiudad: string | null;
  receiverEmailCc: string[];
  netAmount: number;
  exemptAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  siiStatus: string;
  siiTrackId: string | null;
  emailSentAt: string | null;
  emailStatus: string | null;
  referenceType: number | null;
  referenceFolio: number | null;
  referenceCode: number | null;
  referenceReason: string | null;
  additionalReferences: { tipoDocRef: string; folioRef: string; fchRef: string; razonRef: string }[] | null;
  notes: string | null;
  hasXml: boolean;
  crmAccountId: string | null;
  installationId: string | null;
  crmAccount: { id: string; name: string } | null;
  installation: { id: string; name: string } | null;
  lines: DteLine[];
}

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  41: "Boleta Exenta",
  52: "Guía de Despacho",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

const REF_TYPE_LABELS: Record<string, string> = {
  "801": "Orden de Compra",
  "802": "Nota de Pedido",
  "803": "Contrato",
  "804": "Resolución",
  HES: "Hoja Entrada Servicios",
  GD: "Guía Despacho manual",
  "52": "Guía Despacho electrónica",
};

const SII_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  SENT: { label: "Enviado", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  ACCEPTED: { label: "Aceptado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  WITH_OBJECTIONS: { label: "Aceptado con reparos", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  REJECTED: { label: "Rechazado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  ANNULLED: { label: "Anulado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

interface Props {
  open: boolean;
  onClose: () => void;
  dteId: string | null;
  canManage: boolean;
  /**
   * Callbacks opcionales para acciones que el padre maneja (ej: abrir
   * modal NC/ND). Si no se pasan, los botones se ocultan.
   */
  onEmitCreditNote?: (dteId: string) => void;
  onEmitDebitNote?: (dteId: string) => void;
}

export function IssuedDteDetailDialog({
  open,
  onClose,
  dteId,
  canManage,
  onEmitCreditNote,
  onEmitDebitNote,
}: Props) {
  const router = useRouter();
  const [dte, setDte] = useState<DteFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showCederDialog, setShowCederDialog] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    if (!open || !dteId) {
      setDte(null);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/finance/billing/issued/${dteId}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        const d = json.data;
        setDte({
          id: d.id,
          dteType: d.dteType,
          folio: d.folio,
          date: d.date,
          createdAt: d.createdAt,
          receiverRut: d.receiverRut ?? "",
          receiverName: d.receiverName ?? "",
          receiverEmail: d.receiverEmail ?? null,
          receiverGiro: d.receiverGiro ?? null,
          receiverDireccion: d.receiverDireccion ?? null,
          receiverComuna: d.receiverComuna ?? null,
          receiverCiudad: d.receiverCiudad ?? null,
          receiverEmailCc: Array.isArray(d.receiverEmailCc) ? d.receiverEmailCc : [],
          netAmount: Number(d.netAmount ?? 0),
          exemptAmount: Number(d.exemptAmount ?? 0),
          taxAmount: Number(d.taxAmount ?? 0),
          totalAmount: Number(d.totalAmount ?? 0),
          currency: d.currency ?? "CLP",
          siiStatus: d.siiStatus ?? "PENDING",
          siiTrackId: d.siiTrackId ?? null,
          emailSentAt: d.emailSentAt ?? null,
          emailStatus: d.emailStatus ?? null,
          referenceType: d.referenceType ?? null,
          referenceFolio: d.referenceFolio ?? null,
          referenceCode: d.referenceCode ?? null,
          referenceReason: d.referenceReason ?? null,
          additionalReferences: Array.isArray(d.additionalReferences)
            ? d.additionalReferences
            : null,
          notes: d.notes ?? null,
          hasXml: d.dteXml !== null && (d.dteXml?.length ?? 0) > 0,
          crmAccountId: d.crmAccountId ?? null,
          installationId: d.installationId ?? null,
          crmAccount: d.crmAccount ?? null,
          installation: d.installation ?? null,
          lines: Array.isArray(d.lines)
            ? d.lines.map((l: Record<string, unknown>) => ({
                id: String(l.id ?? ""),
                lineNumber: Number(l.lineNumber ?? 0),
                itemName: String(l.itemName ?? ""),
                description: (l.description as string | null) ?? null,
                quantity: Number(l.quantity ?? 0),
                unit: (l.unit as string | null) ?? null,
                unitPrice: Number(l.unitPrice ?? 0),
                discountPct: Number(l.discountPct ?? 0),
                netAmount: Number(l.netAmount ?? 0),
                isExempt: Boolean(l.isExempt),
              }))
            : [],
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message ?? "Error");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, dteId]);

  async function handleDownloadPdf() {
    if (!dte) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/finance/billing/issued/${dte.id}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTE-${dte.folio}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadXml() {
    if (!dte) return;
    setDownloadingXml(true);
    try {
      const res = await fetch(`/api/finance/billing/issued/${dte.id}/xml`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTE-${dte.folio}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloadingXml(false);
    }
  }

  async function handleResendEmail() {
    if (!dte) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/finance/billing/issued/${dte.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Error");
      toast.success("Email enviado");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleDuplicateAsDraft() {
    if (!dte) return;
    try {
      const res = await fetch(`/api/finance/billing/issued/${dte.id}/duplicate-as-draft`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success("Borrador creado a partir del DTE");
      onClose();
      router.push(`/finanzas/facturacion/emitir?draftId=${body.data?.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleCheckStatus() {
    if (!dte) return;
    setCheckingStatus(true);
    try {
      const res = await fetch(`/api/finance/billing/issued/${dte.id}/status`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || `HTTP ${res.status}`);
      const newStatus = body.data?.status ?? "PENDING";
      toast.success(`Estado SII actualizado → ${newStatus}`);
      router.refresh();
      // Update local state también
      setDte((prev) => (prev ? { ...prev, siiStatus: newStatus } : prev));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCheckingStatus(false);
    }
  }

  if (!open) return null;

  const tipoLabel = dte ? DTE_TYPE_LABELS[dte.dteType] ?? `Tipo ${dte.dteType}` : "";
  const stCfg = dte ? SII_STATUS_CONFIG[dte.siiStatus] ?? { label: dte.siiStatus, className: "bg-muted" } : null;
  const canAnular = dte && (dte.siiStatus === "PENDING" || dte.siiStatus === "SENT");
  const canCreditNote = dte && [33, 34, 39, 41, 56].includes(dte.dteType) && dte.siiStatus !== "ANNULLED";
  const canDebitNote = dte && dte.dteType === 61 && dte.siiStatus !== "ANNULLED";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {tipoLabel}
            {dte && <span className="font-mono">N° {dte.folio}</span>}
            {stCfg && (
              <Badge variant="outline" className={cn("text-xs ml-2", stCfg.className)}>
                {stCfg.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="py-8 text-center">
            <p className="text-status-danger-fg font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && dte && (
          <div className="space-y-4 py-2">
            {/* Receptor */}
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Receptor</p>
              <p className="font-medium">{dte.receiverName}</p>
              <p className="text-sm font-mono text-muted-foreground">{dte.receiverRut}</p>
              <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                {dte.receiverGiro && (
                  <div><span className="text-muted-foreground">Giro:</span> {dte.receiverGiro}</div>
                )}
                {dte.receiverDireccion && (
                  <div><span className="text-muted-foreground">Dirección:</span> {dte.receiverDireccion}</div>
                )}
                {dte.receiverComuna && (
                  <div><span className="text-muted-foreground">Comuna:</span> {dte.receiverComuna}</div>
                )}
                {dte.receiverCiudad && (
                  <div><span className="text-muted-foreground">Ciudad:</span> {dte.receiverCiudad}</div>
                )}
                {dte.receiverEmail && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Email:</span> {dte.receiverEmail}
                    {dte.receiverEmailCc.length > 0 && (
                      <span className="text-muted-foreground"> · CC: {dte.receiverEmailCc.join(", ")}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Centro de costo - editable */}
            <div className="rounded-md border border-border p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Centro de costo
              </p>
              <CostCenterEditor
                dteId={dte.id}
                currentAccountId={dte.crmAccountId}
                currentAccountName={dte.crmAccount?.name ?? null}
                currentInstallationId={dte.installationId}
                currentInstallationName={dte.installation?.name ?? null}
                canEdit={canManage}
                restrictToRut={dte.receiverRut}
                onChange={(next) => {
                  setDte((prev) =>
                    prev
                      ? {
                          ...prev,
                          crmAccountId: next.crmAccountId,
                          installationId: next.installationId,
                          crmAccount: next.crmAccountId && next.accountName
                            ? { id: next.crmAccountId, name: next.accountName }
                            : null,
                          installation: next.installationId && next.installationName
                            ? { id: next.installationId, name: next.installationName }
                            : null,
                        }
                      : prev,
                  );
                  router.refresh();
                }}
              />
            </div>

            {/* Líneas */}
            {dte.lines.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <div className="bg-muted/30 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Detalle ({dte.lines.length} línea{dte.lines.length !== 1 ? "s" : ""})
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/20">
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-medium">Item</th>
                      <th className="px-3 py-1.5 text-right font-medium">Cant.</th>
                      <th className="px-3 py-1.5 text-right font-medium">Precio</th>
                      <th className="px-3 py-1.5 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dte.lines.map((l) => (
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="font-medium">{l.itemName}</div>
                          {l.description && (
                            <div className="text-xs text-muted-foreground">{l.description}</div>
                          )}
                          {l.isExempt && (
                            <Badge variant="outline" className="text-[10px] mt-1 bg-status-info-soft text-status-info-fg border-status-info-border">
                              Exento
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {l.quantity} {l.unit ?? ""}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {fmtCLP.format(l.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmtCLP.format(l.netAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totales */}
            <div className="rounded-md border border-border p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Neto</span>
                <span className="font-mono">{fmtCLP.format(dte.netAmount)}</span>
              </div>
              {dte.exemptAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Exento</span>
                  <span className="font-mono">{fmtCLP.format(dte.exemptAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA (19%)</span>
                <span className="font-mono">{fmtCLP.format(dte.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-medium pt-2 border-t border-border">
                <span>Total</span>
                <span className="font-mono">{fmtCLP.format(dte.totalAmount)}</span>
              </div>
            </div>

            {/* Referencias */}
            {(dte.referenceFolio !== null ||
              (dte.additionalReferences && dte.additionalReferences.length > 0)) && (
              <div className="rounded-md border border-border p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Referencias</p>
                {dte.referenceFolio !== null && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">DTE original:</span> tipo {dte.referenceType} folio{" "}
                    <span className="font-mono">{dte.referenceFolio}</span>
                    {dte.referenceReason && <span className="text-muted-foreground"> — {dte.referenceReason}</span>}
                  </div>
                )}
                {dte.additionalReferences?.map((r, i) => (
                  <div key={i} className="text-sm flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {REF_TYPE_LABELS[r.tipoDocRef] ?? r.tipoDocRef}
                    </Badge>
                    <span className="font-mono">{r.folioRef}</span>
                    <span className="text-xs text-muted-foreground">· {r.fchRef} · {r.razonRef}</span>
                  </div>
                ))}
              </div>
            )}

            {/* SII info */}
            <div className="rounded-md border border-border p-4 space-y-1.5 text-xs">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">SII</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Track ID:</span>
                <span className="font-mono">{dte.siiTrackId ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha emisión:</span>
                <span>{format(new Date(dte.date), "dd 'de' MMMM yyyy", { locale: es })}</span>
              </div>
              {dte.emailSentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email enviado:</span>
                  <span>{format(new Date(dte.emailSentAt), "dd MMM yyyy HH:mm", { locale: es })}</span>
                </div>
              )}
            </div>

            {/* Notas */}
            {dte.notes && (
              <div className="rounded-md border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notas</p>
                <p className="text-sm">{dte.notes}</p>
              </div>
            )}

            {/* Timeline auditable de emails enviados (auto + manuales) */}
            <DteEmailTimeline dteId={dte.id} />
          </div>
        )}

        {/* Footer con acciones */}
        {!loading && !error && dte && (
          <DialogFooter className="flex flex-wrap gap-2">
            {dte.hasXml && (
              <>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                  {downloadingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadXml} disabled={downloadingXml}>
                  {downloadingXml ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileCode className="h-3.5 w-3.5 mr-1.5" />}
                  XML
                </Button>
              </>
            )}
            {!dte.hasXml && (
              <span className="text-xs text-muted-foreground italic px-2 py-1.5">
                Importado del SII (sin XML local)
              </span>
            )}
            {canManage && dte.receiverEmail && dte.hasXml && dte.siiStatus !== "ANNULLED" && (
              <Button variant="outline" size="sm" onClick={handleResendEmail} disabled={sendingEmail}>
                {sendingEmail ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
                {dte.emailSentAt ? "Reenviar email" : "Enviar email"}
              </Button>
            )}
            {canManage && (dte.siiStatus === "PENDING" || dte.siiStatus === "SENT") && (
              <Button variant="outline" size="sm" onClick={handleCheckStatus} disabled={checkingStatus}>
                {checkingStatus ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Estado SII
              </Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" onClick={handleDuplicateAsDraft}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Duplicar como borrador
              </Button>
            )}
            {canManage && canCreditNote && onEmitCreditNote && (
              <Button variant="outline" size="sm" onClick={() => { onClose(); onEmitCreditNote(dte.id); }}>
                <FileMinus className="h-3.5 w-3.5 mr-1.5" />
                Nota de Crédito
              </Button>
            )}
            {canManage && canDebitNote && onEmitDebitNote && (
              <Button variant="outline" size="sm" onClick={() => { onClose(); onEmitDebitNote(dte.id); }}>
                <FilePlus className="h-3.5 w-3.5 mr-1.5" />
                Nota de Débito
              </Button>
            )}
            {dte.siiTrackId && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://www4.sii.cl/consdcvinternetui/#/index"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Ver en SII
                </a>
              </Button>
            )}
            {canManage &&
            dte.hasXml &&
            dte.siiStatus === "ACCEPTED" &&
            [33, 34, 43, 46].includes(dte.dteType) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCederDialog(true)}
              >
                <Coins className="h-3.5 w-3.5 mr-1.5" />
                Ceder a factoring
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        )}
      </DialogContent>
      {dte ? (
        <CederDteDialog
          open={showCederDialog}
          onOpenChange={setShowCederDialog}
          dte={{
            id: dte.id,
            dteType: dte.dteType,
            folio: dte.folio,
            receiverName: dte.receiverName,
            totalAmount: dte.totalAmount,
          }}
        />
      ) : null}
    </Dialog>
  );
}
