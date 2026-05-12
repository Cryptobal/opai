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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, FileCode, Mail, RefreshCw, Loader2,
  FileMinus, FilePlus, ExternalLink, Copy, Coins, FileSearch, Upload,
  AlertTriangle, ChevronDown, ChevronRight, MoreHorizontal,
} from "lucide-react";
import { CederDteDialog } from "./factoring/CederDteDialog";
import { PdfPreviewDialog } from "./PdfPreviewDialog";
import { SendEmailDialog } from "./SendEmailDialog";
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

/** NC/ND que referencia a este DTE (lado INCOMING). */
interface LinkedCreditNote {
  id: string;
  dteType: number;
  folio: number;
  date: string;
  netAmount: number;
  totalAmount: number;
  siiStatus: string;
  /** SII CodRef: 1=anula, 2=corrige texto, 3=corrige montos. */
  referenceCode: number | null;
  referenceReason: string | null;
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
  /** Última respuesta cruda del SII (consulta/envio). Json blob. */
  siiResponse: Record<string, unknown> | null;
  /** Última fecha de consulta de estado al SII. */
  siiLastStatusCheckAt: string | null;
  /** Conteo de consultas al SII (para diagnóstico). */
  siiStatusCheckCount: number;
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
  /** NCs/NDs que referencian este DTE. Vacío si no hay. */
  creditNotes: LinkedCreditNote[];
  /** True si ya hay una NC con CodRef=1 viva sobre este DTE. */
  hasFullAnnulment: boolean;
  /** Suma de montos netos acreditados por NCs vivas (para saldo). */
  creditedNet: number;
  /** Última conciliación con cartola (post 2026-05). Permite mostrar
   *  "Pagado por mov bancario X" en el detalle del DTE emitido. */
  lastReconciliation?: {
    paymentId: string;
    paymentCode: string;
    paymentDate: string;
    paymentStatus: string;
    bankTransactionId: string | null;
    bankTransactionDate: string | null;
    bankTransactionReference: string | null;
    bankTransactionDescription: string | null;
  } | null;
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

/** Etiqueta humana del CodRef SII de una NC/ND. */
const REF_CODE_LABELS: Record<number, string> = {
  1: "Anulación total",
  2: "Corrige texto",
  3: "Corrige montos",
};

/**
 * Extrae glosa humana desde `siiResponse`. SimpleAPI guarda distintas
 * shapes según el endpoint que respondió, así que probamos varias keys
 * comunes y caemos al primer string que tenga sentido.
 */
function pickSiiGlosa(
  resp: Record<string, unknown> | null | undefined,
): string | null {
  if (!resp) return null;
  const keys = ["Glosa", "glosa", "Mensaje", "mensaje", "Estado", "estado", "Descripcion", "descripcion"];
  for (const k of keys) {
    const v = resp[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickSiiCodigo(
  resp: Record<string, unknown> | null | undefined,
): string | null {
  if (!resp) return null;
  const keys = ["Codigo", "codigo", "Code", "code"];
  for (const k of keys) {
    const v = resp[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

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
  /**
   * Modo de presentación del shell:
   *   - "dialog" (default): modal centrado tradicional (legacy).
   *   - "sheet" : slide-over derecha (desktop) / abajo (mobile).
   *
   * Refactor 2026-05: el módulo DTEs Emitidos pasa a usar "sheet" via
   * `IssuedDteSlideOver`, que es un wrapper sobre este componente.
   */
  presentation?: "dialog" | "sheet";
}

export function IssuedDteDetailDialog({
  open,
  onClose,
  dteId,
  canManage,
  onEmitCreditNote,
  onEmitDebitNote,
  presentation = "dialog",
}: Props) {
  const isMobileViewport = useIsMobileViewport();
  const router = useRouter();
  const [dte, setDte] = useState<DteFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showCederDialog, setShowCederDialog] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showAttachXml, setShowAttachXml] = useState(false);
  const [attachingXml, setAttachingXml] = useState(false);
  const [xmlPaste, setXmlPaste] = useState("");
  /** Toggle del bloque colapsable "Detalles técnicos SII". */
  const [showSiiTech, setShowSiiTech] = useState(false);

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
          siiResponse:
            d.siiResponse && typeof d.siiResponse === "object" && !Array.isArray(d.siiResponse)
              ? (d.siiResponse as Record<string, unknown>)
              : null,
          siiLastStatusCheckAt: d.siiLastStatusCheckAt ?? null,
          siiStatusCheckCount: Number(d.siiStatusCheckCount ?? 0),
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
          // El backend ahora precalcula `hasXml` (boolean) y excluye el
          // buffer crudo. Fallback al cálculo viejo solo por compat con
          // respuestas legacy: si vino el buffer es porque algún proxy
          // lo dejó pasar — medimos largo del array `data` si existe.
          hasXml: typeof d.hasXml === "boolean"
            ? d.hasXml
            : d.dteXml != null,
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
          creditNotes: Array.isArray(d.creditNotes)
            ? d.creditNotes.map((n: Record<string, unknown>) => ({
                id: String(n.id ?? ""),
                dteType: Number(n.dteType ?? 61),
                folio: Number(n.folio ?? 0),
                date: String(n.date ?? ""),
                netAmount: Number(n.netAmount ?? 0),
                totalAmount: Number(n.totalAmount ?? 0),
                siiStatus: String(n.siiStatus ?? "PENDING"),
                referenceCode: (n.referenceCode as number | null) ?? null,
                referenceReason: (n.referenceReason as string | null) ?? null,
              }))
            : [],
          hasFullAnnulment: Boolean(d.hasFullAnnulment),
          creditedNet: Number(d.creditedNet ?? 0),
          lastReconciliation: (d.lastReconciliation as
            | DteDetail["lastReconciliation"]
            | undefined) ?? null,
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

  // Reenviar email: ahora abre SendEmailDialog (controlado por el padre)
  // para que el usuario edite TO/CC/BCC antes de mandar. No más envíos
  // directos sin confirmación.
  function handleOpenSendEmail() {
    setShowSendEmail(true);
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
  // Saldo neto disponible para una NC parcial. Si llegó a 0 (o tiene
  // anulación total), el botón se desactiva con tooltip explícito.
  const remainingNet = dte ? Math.max(0, dte.netAmount - dte.creditedNet) : 0;
  const isFullyCredited =
    dte != null && dte.creditedNet > 0 && remainingNet <= 1;
  const creditNoteBlockedReason: string | null = !dte
    ? null
    : dte.hasFullAnnulment
      ? `Esta factura ya fue anulada con NC ${
          dte.creditNotes.find((n) => n.referenceCode === 1)?.folio ?? ""
        }. No se pueden emitir más notas.`
      : isFullyCredited
        ? `Saldo agotado: las NCs previas suman $${dte.creditedNet.toLocaleString("es-CL")} del neto original $${dte.netAmount.toLocaleString("es-CL")}.`
        : null;
  const canDebitNote = dte && dte.dteType === 61 && dte.siiStatus !== "ANNULLED";

  const siiGlosa = dte ? pickSiiGlosa(dte.siiResponse) : null;
  const siiCodigo = dte ? pickSiiCodigo(dte.siiResponse) : null;

  // Modo de shell: Dialog vs Sheet. Las primitivas de Title/Description
  // requieren Root context propio, así que cada rama renderiza las suyas.
  const isSheet = presentation === "sheet";
  const ShellRoot = isSheet ? Sheet : Dialog;
  const ShellContent = isSheet ? SheetContent : DialogContent;
  const ShellHeader = isSheet ? SheetHeader : DialogHeader;
  const ShellTitle = isSheet ? SheetTitle : DialogTitle;
  const ShellDescription = isSheet ? SheetDescription : DialogDescription;
  const shellContentProps: Record<string, unknown> = isSheet
    ? {
        side: isMobileViewport ? "bottom" : "right",
        className: cn(
          "!p-0 flex flex-col w-full",
          isMobileViewport ? "max-h-[92vh] rounded-t-2xl" : "sm:max-w-xl",
        ),
      }
    : { className: "sm:max-w-3xl max-h-[90vh] overflow-y-auto" };

  return (
    <ShellRoot open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <ShellContent {...shellContentProps}>
        {isSheet && isMobileViewport && (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-ds-border-default/60" />
          </div>
        )}
        <div
          className={cn(
            isSheet
              ? "flex-1 overflow-y-auto px-6 py-4 space-y-3"
              : undefined,
          )}
        >
        <ShellHeader>
          <ShellTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {tipoLabel}
            {dte && <span className="font-mono">N° {dte.folio}</span>}
            {stCfg && (
              <Badge variant="outline" className={cn("text-xs ml-2", stCfg.className)}>
                {stCfg.label}
              </Badge>
            )}
          </ShellTitle>
          <ShellDescription className="sr-only">
            Detalle del DTE emitido: estado SII, datos del receptor, líneas de
            facturación, archivos adjuntos y acciones disponibles (descargar
            PDF/XML, reenviar por email, ceder a factoring, anular).
          </ShellDescription>
        </ShellHeader>

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
            {/* Banner: NCs/NDs que referencian a este DTE.
                Aparece arriba de todo cuando dte.creditNotes.length > 0
                para que el usuario vea el estado de anulación/corrección
                antes de cualquier acción. */}
            {dte.creditNotes.length > 0 && (
              <div
                className={cn(
                  "rounded-md border p-3 space-y-2",
                  dte.hasFullAnnulment
                    ? "bg-status-danger-soft border-status-danger-border"
                    : "bg-status-warn-soft border-status-warn-border",
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      dte.hasFullAnnulment
                        ? "text-status-danger-fg"
                        : "text-status-warn-fg",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        dte.hasFullAnnulment
                          ? "text-status-danger-fg"
                          : "text-status-warn-fg",
                      )}
                    >
                      {dte.hasFullAnnulment
                        ? "Esta factura está anulada por nota de crédito"
                        : `Esta factura tiene ${dte.creditNotes.length} ${dte.creditNotes.length === 1 ? "nota" : "notas"} asociada${dte.creditNotes.length === 1 ? "" : "s"}`}
                    </p>
                    {!dte.hasFullAnnulment && dte.creditedNet > 0 && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Acreditado: {fmtCLP.format(dte.creditedNet)} de{" "}
                        {fmtCLP.format(dte.netAmount)} neto · saldo{" "}
                        {fmtCLP.format(Math.max(0, dte.netAmount - dte.creditedNet))}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-1 pl-6">
                  {dte.creditNotes.map((nc) => {
                    const ncStCfg = SII_STATUS_CONFIG[nc.siiStatus] ?? {
                      label: nc.siiStatus,
                      className: "bg-muted",
                    };
                    const codeLabel =
                      nc.referenceCode != null
                        ? REF_CODE_LABELS[nc.referenceCode] ?? `CodRef ${nc.referenceCode}`
                        : null;
                    return (
                      <div key={nc.id} className="rounded-sm px-2 py-1.5">
                        <div className="flex items-center gap-2 flex-wrap text-[13px]">
                          <Badge variant="outline" className="text-[10px]">
                            {DTE_TYPE_LABELS[nc.dteType] ?? `Tipo ${nc.dteType}`}
                          </Badge>
                          <span className="font-mono">N° {nc.folio}</span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", ncStCfg.className)}
                          >
                            {ncStCfg.label}
                          </Badge>
                          {codeLabel && (
                            <span className="text-[12px] text-muted-foreground">
                              · {codeLabel}
                            </span>
                          )}
                          <span className="text-[12px] text-muted-foreground ml-auto font-mono">
                            {fmtCLP.format(nc.totalAmount)}
                          </span>
                        </div>
                        {nc.referenceReason && (
                          <p className="text-[12px] text-muted-foreground mt-0.5 italic line-clamp-2">
                            {nc.referenceReason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

            {/* Movimiento bancario que cobró este DTE — clickeable, deep
                link al drawer de conciliación del módulo Bancos. */}
            {dte.lastReconciliation?.bankTransactionId && (
              <a
                href={`/finanzas/bancos?txId=${dte.lastReconciliation.bankTransactionId}`}
                className="block rounded-md border border-status-ok-border bg-status-ok-soft p-4 space-y-2 hover:bg-status-ok-soft/70 transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-status-ok-fg font-medium">
                    Cobrado vía movimiento bancario
                  </p>
                  <ExternalLink className="h-3.5 w-3.5 text-status-ok-fg opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {dte.lastReconciliation.bankTransactionDate && (
                    <div>
                      <p className="text-xs text-status-ok-fg/70 mb-0.5">Fecha</p>
                      <p className="font-mono font-medium text-status-ok-fg">
                        {format(
                          new Date(dte.lastReconciliation.bankTransactionDate),
                          "dd MMM yyyy",
                          { locale: es },
                        )}
                      </p>
                    </div>
                  )}
                  {dte.lastReconciliation.bankTransactionReference && (
                    <div>
                      <p className="text-xs text-status-ok-fg/70 mb-0.5">Referencia</p>
                      <p className="font-mono text-[12px] text-status-ok-fg truncate">
                        {dte.lastReconciliation.bankTransactionReference}
                      </p>
                    </div>
                  )}
                </div>
                {dte.lastReconciliation.bankTransactionDescription && (
                  <p className="text-[13px] text-status-ok-fg/90 truncate">
                    {dte.lastReconciliation.bankTransactionDescription}
                  </p>
                )}
                <p className="text-[11px] text-status-ok-fg/70 italic">
                  Click para ver el movimiento en Bancos →
                </p>
              </a>
            )}

            {/* Cliente / Instalación asociada al DTE (lo que internamente
                llamábamos "centro de costo"). Editable inline. */}
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Cliente / Instalación
                </p>
                <span className="text-[12px] text-muted-foreground italic">
                  Click para editar
                </span>
              </div>
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

            {/* SII info — muestra los datos clave del Servicio de
                Impuestos Internos. Glosa + Última consulta vienen de
                `siiResponse` (rellenado por consulta/envio). El bloque
                "Detalles técnicos" es colapsable y trae el JSON crudo
                para soporte. */}
            <div className="rounded-md border border-border p-4 space-y-1.5 text-xs">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">SII</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Track ID:</span>
                <span className="font-mono">{dte.siiTrackId ?? "—"}</span>
              </div>
              {siiCodigo && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Código:</span>
                  <span className="font-mono">{siiCodigo}</span>
                </div>
              )}
              {siiGlosa && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Glosa:</span>
                  <span className="text-right">{siiGlosa}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha emisión:</span>
                <span>{format(new Date(dte.date), "dd 'de' MMMM yyyy", { locale: es })}</span>
              </div>
              {dte.siiLastStatusCheckAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última consulta SII:</span>
                  <span>
                    {format(new Date(dte.siiLastStatusCheckAt), "dd MMM yyyy HH:mm", {
                      locale: es,
                    })}
                  </span>
                </div>
              )}
              {dte.emailSentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email enviado:</span>
                  <span>{format(new Date(dte.emailSentAt), "dd MMM yyyy HH:mm", { locale: es })}</span>
                </div>
              )}

              {/* Detalles técnicos colapsables: información para soporte
                  o auditoría (conteo de consultas, JSON crudo del SII). */}
              {(dte.siiResponse || dte.siiStatusCheckCount > 0) && (
                <div className="pt-2 border-t border-border mt-2">
                  <button
                    type="button"
                    onClick={() => setShowSiiTech((v) => !v)}
                    className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSiiTech ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Detalles técnicos
                  </button>
                  {showSiiTech && (
                    <div className="mt-2 space-y-1.5 pl-4">
                      {dte.siiStatusCheckCount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Consultas SII realizadas:
                          </span>
                          <span className="font-mono">{dte.siiStatusCheckCount}</span>
                        </div>
                      )}
                      {dte.siiResponse && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                            Respuesta cruda SII
                          </p>
                          <pre className="rounded-md bg-muted/40 border border-border p-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {JSON.stringify(dte.siiResponse, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
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

        {/* Footer con acciones — rediseñado:
            Acciones primarias siempre visibles (Vista previa, PDF, XML)
            + dropdown "Más acciones" con todo lo secundario para no saturar
            el footer con ~10 botones que rebalsan en 2 filas. */}
        {!loading && !error && dte && (() => {
          const noXmlBlockedReason = !dte.hasXml
            ? "Esta factura no tiene XML local (típicamente porque fue emitida antes del refactor que persiste el XML automáticamente). Tocá \"Subir XML\" para adjuntar el XML firmado original — lo conseguís descargándolo desde el portal SII (Servicios online → Factura electrónica → Consultar mis documentos emitidos). Una vez subido podrás ceder."
            : null;
          const showSendEmail =
            canManage && dte.hasXml && dte.siiStatus !== "ANNULLED";
          const showCheckStatus =
            canManage && (dte.siiStatus === "PENDING" || dte.siiStatus === "SENT");
          const showCreditNote =
            canManage &&
            [33, 34, 39, 41, 56].includes(dte.dteType) &&
            dte.siiStatus !== "ANNULLED" &&
            !!onEmitCreditNote;
          const showDebitNote = canManage && !!canDebitNote && !!onEmitDebitNote;
          const showCede = canManage;
          const showSiiLink = !!dte.siiTrackId;
          const hasAnySecondary =
            showSendEmail ||
            showCheckStatus ||
            canManage ||
            showCreditNote ||
            showDebitNote ||
            showCede ||
            showSiiLink;
          return (
            <DialogFooter className="flex items-center justify-between gap-2 sm:flex-row flex-row-reverse flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {dte.hasXml ? (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setShowPdfPreview(true)}
                      className="gap-1.5"
                    >
                      <FileSearch className="h-3.5 w-3.5" />
                      Vista previa
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf}
                      className="gap-1.5"
                    >
                      {downloadingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadXml}
                      disabled={downloadingXml}
                      className="gap-1.5 hidden sm:inline-flex"
                    >
                      {downloadingXml ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileCode className="h-3.5 w-3.5" />
                      )}
                      XML
                    </Button>
                  </>
                ) : canManage ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setXmlPaste("");
                      setShowAttachXml(true);
                    }}
                    title="Subir el XML firmado original (necesario para ceder a factoring)"
                    className="gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Subir XML
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground italic px-2 py-1.5">
                    Sin XML local
                  </span>
                )}

                {hasAnySecondary && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        aria-label="Más acciones"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Más</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-ds-text-3">
                        Acciones
                      </DropdownMenuLabel>
                      {!dte.hasXml && (
                        <DropdownMenuItem
                          disabled
                          className="text-xs italic text-muted-foreground"
                        >
                          XML no disponible
                        </DropdownMenuItem>
                      )}
                      {dte.hasXml && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            handleDownloadXml();
                          }}
                          className="sm:hidden"
                        >
                          <FileCode className="h-4 w-4 mr-2" />
                          Descargar XML
                        </DropdownMenuItem>
                      )}
                      {showSendEmail && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            handleOpenSendEmail();
                          }}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          {dte.emailSentAt ? "Reenviar email…" : "Enviar email…"}
                        </DropdownMenuItem>
                      )}
                      {showCheckStatus && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            handleCheckStatus();
                          }}
                          disabled={checkingStatus}
                        >
                          {checkingStatus ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Consultar estado SII
                        </DropdownMenuItem>
                      )}
                      {canManage && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            handleDuplicateAsDraft();
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar como borrador
                        </DropdownMenuItem>
                      )}
                      {(showCreditNote || showDebitNote) && <DropdownMenuSeparator />}
                      {showCreditNote && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            if (creditNoteBlockedReason) {
                              toast.error(creditNoteBlockedReason, { duration: 8000 });
                              return;
                            }
                            onClose();
                            onEmitCreditNote!(dte.id);
                          }}
                          className={creditNoteBlockedReason ? "opacity-60" : undefined}
                        >
                          <FileMinus className="h-4 w-4 mr-2" />
                          Nota de Crédito
                        </DropdownMenuItem>
                      )}
                      {showDebitNote && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            onClose();
                            onEmitDebitNote!(dte.id);
                          }}
                        >
                          <FilePlus className="h-4 w-4 mr-2" />
                          Nota de Débito
                        </DropdownMenuItem>
                      )}
                      {(showCede || showSiiLink) && <DropdownMenuSeparator />}
                      {showCede && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            if (noXmlBlockedReason) {
                              toast.error(noXmlBlockedReason, { duration: 9000 });
                              return;
                            }
                            setShowCederDialog(true);
                          }}
                          className={noXmlBlockedReason ? "opacity-60" : undefined}
                        >
                          <Coins className="h-4 w-4 mr-2" />
                          Ceder a factoring
                        </DropdownMenuItem>
                      )}
                      {showSiiLink && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            window.open(
                              "https://www4.sii.cl/consdcvinternetui/#/index",
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver en portal SII
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <Button variant="ghost" size="sm" onClick={onClose}>
                Cerrar
              </Button>
            </DialogFooter>
          );
        })()}
        </div>
      </ShellContent>
      {dte ? (
        <CederDteDialog
          open={showCederDialog}
          onOpenChange={setShowCederDialog}
          dte={{
            id: dte.id,
            dteType: dte.dteType,
            folio: dte.folio,
            receiverName: dte.receiverName,
            receiverEmail: dte.receiverEmail,
            receiverEmailCc: dte.receiverEmailCc ?? [],
            totalAmount: dte.totalAmount,
            date: dte.date,
          }}
        />
      ) : null}
      {dte ? (
        <PdfPreviewDialog
          open={showPdfPreview}
          onOpenChange={setShowPdfPreview}
          dteId={dte.id}
          folio={dte.folio}
          dteType={dte.dteType}
          onDownload={handleDownloadPdf}
        />
      ) : null}
      {dte ? (
        <SendEmailDialog
          open={showSendEmail}
          onOpenChange={setShowSendEmail}
          dteId={dte.id}
          folio={dte.folio}
          dteType={dte.dteType}
          defaultRecipient={dte.receiverEmail}
          defaultCc={dte.receiverEmailCc}
          onSent={() => {
            router.refresh();
            // Actualizamos el local state para reflejar emailSentAt al instante
            // sin esperar a que router.refresh re-fetchee.
            setDte((prev) =>
              prev
                ? { ...prev, emailSentAt: new Date().toISOString(), emailStatus: "SENT" }
                : prev,
            );
          }}
        />
      ) : null}

      {/* Modal: subir el XML firmado original (para DTEs históricos sin
          dteXml persistido en BD). Acepta drag & drop, file picker, o
          paste directo del XML. El backend valida que el XML coincida
          exactamente con este DTE (folio, tipo, RUTs, total). */}
      {dte && (
        <Dialog
          open={showAttachXml}
          onOpenChange={(o) => !o && !attachingXml && setShowAttachXml(false)}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Subir XML firmado original</DialogTitle>
              <DialogDescription>
                Adjuntá el XML firmado de este DTE para poder generar PDFs,
                ceder a factoring y reauditar sin re-emitir contra el SII.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md bg-status-info-soft border border-status-info-border p-3 text-[13px] text-status-info-fg">
                <p className="font-medium mb-1">
                  ¿De dónde sacar el XML?
                </p>
                <ol className="list-decimal pl-5 space-y-0.5">
                  <li>Entrá al portal SII con la clave de la empresa.</li>
                  <li>
                    Servicios online → Factura electrónica →
                    <span className="font-medium"> Consultar mis documentos emitidos</span>.
                  </li>
                  <li>
                    Filtrá por folio <span className="font-mono">{dte.folio}</span>{" "}
                    y descargá el XML.
                  </li>
                </ol>
                <p className="mt-2 text-[12px] opacity-80">
                  El XML debe coincidir exactamente con esta factura (tipo{" "}
                  {dte.dteType}, folio {dte.folio}). Validamos antes de
                  guardarlo.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Subir archivo .xml
                </label>
                <input
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-input file:text-sm file:font-medium file:bg-background hover:file:bg-muted"
                  disabled={attachingXml}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setXmlPaste(text);
                  }}
                />
              </div>

              <div className="text-[12px] text-muted-foreground text-center">
                — o pegá el contenido XML acá —
              </div>

              <textarea
                value={xmlPaste}
                onChange={(e) => setXmlPaste(e.target.value)}
                placeholder='<?xml version="1.0" encoding="ISO-8859-1"?>...'
                rows={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-[12px] font-mono"
                disabled={attachingXml}
                spellCheck={false}
                autoComplete="off"
              />

              {xmlPaste && (
                <p className="text-[12px] text-muted-foreground">
                  {xmlPaste.length.toLocaleString("es-CL")} caracteres listos
                  para subir.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAttachXml(false)}
                disabled={attachingXml}
              >
                Cancelar
              </Button>
              <Button
                disabled={attachingXml || !xmlPaste.trim()}
                onClick={async () => {
                  if (!dte) return;
                  setAttachingXml(true);
                  try {
                    const res = await fetch(
                      `/api/finance/billing/issued/${dte.id}/attach-xml`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ xml: xmlPaste }),
                      },
                    );
                    const json = await res.json();
                    if (!res.ok || !json.success) {
                      throw new Error(json.error ?? "Error al adjuntar XML");
                    }
                    toast.success(
                      json.data?.message ?? "XML adjuntado correctamente",
                      { duration: 7000 },
                    );
                    setShowAttachXml(false);
                    setXmlPaste("");
                    // Reflejar localmente que ahora SÍ tiene XML, así el
                    // botón "Ceder a factoring" se desbloquea sin esperar
                    // refetch.
                    setDte((prev) => (prev ? { ...prev, hasXml: true } : prev));
                    router.refresh();
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Error al adjuntar XML",
                      { duration: 9000 },
                    );
                  } finally {
                    setAttachingXml(false);
                  }
                }}
              >
                {attachingXml ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1.5" />
                )}
                Subir y validar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ShellRoot>
  );
}
