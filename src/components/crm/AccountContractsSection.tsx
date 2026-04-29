"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  Eye,
  Trash2,
  Globe,
  FileText,
  Paperclip,
  Info,
  AlertTriangle,
  XCircle,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DOC_STATUS_CONFIG } from "@/lib/docs/token-registry";
import {
  CONTRACT_CATEGORIES,
  CONTRACT_CATEGORY_LABELS,
  type ContractCategory,
} from "@/lib/validations/docs";

interface Contract {
  id: string;
  uniqueId: string;
  title: string;
  category: string;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  alertDaysBefore: number;
  pdfUrl: string | null;
  portalVisible: boolean;
  templateName: string | null;
  deal: { id: string; title: string } | null;
  signedAt: string | null;
  signedBy: string | null;
  signatureStatus: string | null;
  signatureRecipients: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
  }>;
  createdAt: string;
}

interface Props {
  accountId: string;
  accountName: string;
  onRefresh?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsISO(isoDate: string, months: number): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const out = new Date(Date.UTC(y, mo + months, d));
  out.setUTCDate(out.getUTCDate() - 1);
  return out.toISOString().slice(0, 10);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL");
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const target = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AccountContractsSection({
  accountId,
  accountName,
  onRefresh,
}: Props) {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] =
    useState<ContractCategory>("contrato_cliente");
  const [uploadEffective, setUploadEffective] = useState("");
  const [uploadDuration, setUploadDuration] = useState<string>("12");
  const [uploadExpiration, setUploadExpiration] = useState("");
  const [expirationManuallyEdited, setExpirationManuallyEdited] = useState(false);
  const [uploadAlertDays, setUploadAlertDays] = useState<string>("30");
  const [uploadSignedExternally, setUploadSignedExternally] = useState(false);
  const [uploadSignedAt, setUploadSignedAt] = useState("");
  const [uploadSignedBy, setUploadSignedBy] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchContracts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/crm/accounts/${accountId}/contracts`);
      const data = await res.json();
      if (data.success) setContracts(data.data ?? []);
    } catch {
      toast.error("Error al cargar contratos");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // ─── Auto-compute expiration when effective + duration change ──
  useEffect(() => {
    if (expirationManuallyEdited) return;
    const months = Number(uploadDuration);
    if (!uploadEffective || !Number.isFinite(months) || months <= 0) {
      setUploadExpiration("");
      return;
    }
    setUploadExpiration(addMonthsISO(uploadEffective, months));
  }, [uploadEffective, uploadDuration, expirationManuallyEdited]);

  // ─── Reset upload form ─────────────────────────────────────────
  const resetUploadForm = useCallback(() => {
    setUploadFile(null);
    setUploadTitle("");
    setUploadCategory("contrato_cliente");
    setUploadEffective("");
    setUploadDuration("12");
    setUploadExpiration("");
    setExpirationManuallyEdited(false);
    setUploadAlertDays("30");
    setUploadSignedExternally(false);
    setUploadSignedAt("");
    setUploadSignedBy("");
    setUploadNotes("");
  }, []);

  // ─── Handle file selection ─────────────────────────────────────
  const handleFileSelected = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      toast.error("Solo se permiten archivos PDF");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error("El archivo supera el límite de 25 MB");
      return;
    }
    setUploadFile(f);
    setUploadTitle((prev) => prev || f.name.replace(/\.pdf$/i, ""));
    if (!uploadEffective) setUploadEffective(todayISO());
    setUploadOpen(true);
  };

  // ─── Validation for the dialog ─────────────────────────────────
  const dialogError = useMemo(() => {
    if (!uploadFile) return "Archivo requerido";
    if (!uploadTitle.trim()) return "Título requerido";
    if (uploadEffective && uploadExpiration) {
      if (new Date(uploadExpiration) < new Date(uploadEffective)) {
        return "La fecha de vencimiento debe ser posterior a la fecha de inicio";
      }
    }
    if (uploadSignedExternally && !uploadSignedAt) {
      return "Indica la fecha de firma externa";
    }
    return null;
  }, [
    uploadFile,
    uploadTitle,
    uploadEffective,
    uploadExpiration,
    uploadSignedExternally,
    uploadSignedAt,
  ]);

  // ─── Submit upload ─────────────────────────────────────────────
  const handleUpload = async () => {
    if (dialogError) {
      toast.error(dialogError);
      return;
    }
    if (!uploadFile) return;
    setUploadSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("title", uploadTitle.trim());
      fd.append("category", uploadCategory);
      if (uploadEffective) fd.append("effectiveDate", uploadEffective);
      if (uploadExpiration) fd.append("expirationDate", uploadExpiration);
      if (uploadDuration) fd.append("durationMonths", uploadDuration);
      if (uploadAlertDays) fd.append("alertDaysBefore", uploadAlertDays);
      fd.append("signedExternally", String(uploadSignedExternally));
      if (uploadSignedExternally && uploadSignedAt) fd.append("signedAt", uploadSignedAt);
      if (uploadSignedExternally && uploadSignedBy.trim())
        fd.append("signedBy", uploadSignedBy.trim());
      if (uploadNotes.trim()) fd.append("notes", uploadNotes.trim());

      const res = await fetch(`/api/crm/accounts/${accountId}/contracts`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Contrato subido exitosamente");
        setUploadOpen(false);
        resetUploadForm();
        fetchContracts();
        onRefresh?.();
      } else {
        toast.error(data.error || "Error al subir contrato");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setUploadSaving(false);
    }
  };

  // ─── Actions on existing contracts ─────────────────────────────
  const togglePortal = async (contract: Contract) => {
    setActionLoading((p) => ({ ...p, [contract.id]: true }));
    try {
      const res = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contract.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalVisible: !contract.portalVisible }),
        },
      );
      const data = await res.json();
      if (data.success) {
        toast.success(
          contract.portalVisible
            ? "Contrato removido del portal"
            : "Contrato compartido al portal",
        );
        fetchContracts();
      }
    } catch {
      toast.error("Error actualizando visibilidad");
    } finally {
      setActionLoading((p) => ({ ...p, [contract.id]: false }));
    }
  };

  const deleteContract = async (contract: Contract) => {
    if (!confirm(`¿Eliminar el contrato "${contract.title}"?\nEsta acción no se puede deshacer.`))
      return;
    setActionLoading((p) => ({ ...p, [contract.id]: true }));
    try {
      const res = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contract.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Contrato eliminado");
        fetchContracts();
        onRefresh?.();
      }
    } catch {
      toast.error("Error eliminando contrato");
    } finally {
      setActionLoading((p) => ({ ...p, [contract.id]: false }));
    }
  };

  // ─── Render helpers ────────────────────────────────────────────
  const getStatusConfig = (status: string) =>
    DOC_STATUS_CONFIG[status] ?? {
      label: status,
      color: "bg-gray-100 text-gray-700",
    };

  const getSignatureLabel = (
    signatureStatus: string | null,
    signedAt: string | null,
  ): { label: string; color: string } | null => {
    if (!signatureStatus) return null;
    if (signatureStatus === "external") {
      return {
        label: signedAt
          ? `Firma externa · ${formatDate(signedAt)}`
          : "Firma externa",
        color: "bg-slate-100 text-slate-700",
      };
    }
    const map: Record<string, { label: string; color: string }> = {
      draft: { label: "Firma pendiente", color: "bg-gray-100 text-gray-600" },
      pending: {
        label: "Enviada a firma",
        color: "bg-yellow-100 text-yellow-700",
      },
      in_progress: {
        label: "En proceso de firma",
        color: "bg-blue-100 text-blue-700",
      },
      completed: {
        label: signedAt ? `Firmado · ${formatDate(signedAt)}` : "Firmado",
        color: "bg-green-100 text-green-700",
      },
      cancelled: {
        label: "Firma cancelada",
        color: "bg-red-100 text-red-700",
      },
    };
    return map[signatureStatus] ?? null;
  };

  const renderExpirationPill = (c: Contract) => {
    if (!c.expirationDate) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          Sin vencimiento (indefinido)
        </span>
      );
    }
    const days = daysUntil(c.expirationDate);
    if (days === null) return null;
    if (days < 0) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
          <XCircle className="h-3 w-3" />
          Vencido el {formatDate(c.expirationDate)}
        </span>
      );
    }
    if (days <= c.alertDaysBefore) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700">
          <AlertTriangle className="h-3 w-3" />
          Vence en {days} {days === 1 ? "día" : "días"} ({formatDate(c.expirationDate)})
        </span>
      );
    }
    return (
      <span className="text-xs text-muted-foreground">
        Vence el {formatDate(c.expirationDate)}
      </span>
    );
  };

  const rowAccent = (c: Contract): string => {
    if (c.status === "expired") return "border-red-300 bg-red-50/60";
    if (c.status === "expiring") return "border-orange-300 bg-orange-50/60";
    return "border-border bg-card";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Contratos</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sube un PDF firmado externamente, o genera uno nuevo desde una cotización ganada del cliente.
          </p>
        </div>
      </div>

      {/* Dropzone for PDF upload */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFileSelected(f);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
        )}
      >
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          id={`contract-upload-${accountId}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelected(f);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={`contract-upload-${accountId}`}
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Paperclip className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Arrastra un PDF aquí o haz clic para seleccionar
          </span>
          <span className="text-xs text-muted-foreground/80">
            Máximo 25 MB · Solo archivos PDF
          </span>
        </label>
      </div>

      {/* Contract list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No hay contratos aún</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Para generar un contrato desde plantilla, ve a una cotización ganada del cliente y
            usa el botón <span className="font-medium">&quot;Generar contrato&quot;</span>. O sube aquí un PDF firmado externamente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => {
            const statusCfg = getStatusConfig(c.status);
            const sigLabel = getSignatureLabel(c.signatureStatus, c.signedAt);
            const isLoading = actionLoading[c.id];
            const isUpload = !c.templateName && c.signatureStatus === "external";

            return (
              <div
                key={c.id}
                className={cn(
                  "flex items-start sm:items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/30 flex-col sm:flex-row",
                  rowAccent(c),
                )}
              >
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate max-w-[16rem] sm:max-w-none">
                      {c.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${statusCfg.color}`}
                    >
                      {statusCfg.label}
                    </Badge>
                    {sigLabel && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${sigLabel.color}`}
                      >
                        {sigLabel.label}
                      </Badge>
                    )}
                    {c.portalVisible && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700"
                      >
                        <Globe className="h-2.5 w-2.5 mr-0.5" />
                        Portal
                      </Badge>
                    )}
                    {isUpload && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-700"
                      >
                        Subido manualmente
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 mt-1 gap-1">
                    <span className="text-xs text-muted-foreground">
                      Inicio: {formatDate(c.effectiveDate)}
                    </span>
                    {renderExpirationPill(c)}
                    {c.deal && (
                      <span className="text-xs text-muted-foreground truncate">
                        Negocio: {c.deal.title}
                      </span>
                    )}
                    {c.templateName && (
                      <span className="text-xs text-muted-foreground truncate">
                        Plantilla: {c.templateName}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {CONTRACT_CATEGORY_LABELS[c.category as ContractCategory] ?? c.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Ver documento"
                    onClick={() => router.push(`/opai/documentos/${c.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {c.pdfUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Descargar PDF"
                      asChild
                    >
                      <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-7 p-0 ${
                      c.portalVisible ? "text-emerald-600" : ""
                    }`}
                    title={
                      c.portalVisible ? "Quitar del portal" : "Compartir en portal"
                    }
                    onClick={() => togglePortal(c)}
                    disabled={isLoading}
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive"
                    title="Eliminar"
                    onClick={() => deleteContract(c)}
                    disabled={isLoading}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Upload Dialog ──────────────────────────────────────── */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) resetUploadForm();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Subir Contrato PDF</DialogTitle>
            <DialogDescription>
              Sube un contrato firmado fuera de Opai. Define las fechas para activar las alertas
              automáticas de vencimiento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {uploadFile && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate flex-1">{uploadFile.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder={`Contrato ${accountName}`}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de contrato</Label>
              <Select
                value={uploadCategory}
                onValueChange={(v) => setUploadCategory(v as ContractCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CONTRACT_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha de inicio</Label>
                <Input
                  type="date"
                  value={uploadEffective}
                  onChange={(e) => {
                    setUploadEffective(e.target.value);
                    setExpirationManuallyEdited(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Duración (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={uploadDuration}
                  onChange={(e) => {
                    setUploadDuration(e.target.value);
                    setExpirationManuallyEdited(false);
                  }}
                  placeholder="12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Fecha de vencimiento
                <span className="text-[10px] text-muted-foreground font-normal">
                  (calculada automáticamente · puedes editarla)
                </span>
              </Label>
              <Input
                type="date"
                value={uploadExpiration}
                onChange={(e) => {
                  setUploadExpiration(e.target.value);
                  setExpirationManuallyEdited(true);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Si dejas estos campos vacíos, el contrato quedará sin fecha de vencimiento (indefinido)
                y no recibirá alertas automáticas.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Días de alerta antes de vencer</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={uploadAlertDays}
                onChange={(e) => setUploadAlertDays(e.target.value)}
              />
            </div>

            <div className="rounded-md border border-border p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={uploadSignedExternally}
                  onCheckedChange={(v) => setUploadSignedExternally(v === true)}
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    Este contrato fue firmado fuera de Opai
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Registra los datos de la firma externa para mantener trazabilidad legal.
                  </p>
                </div>
              </label>

              {uploadSignedExternally && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                  <div className="space-y-2">
                    <Label>Fecha de firma</Label>
                    <Input
                      type="date"
                      value={uploadSignedAt}
                      onChange={(e) => setUploadSignedAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Firmado por</Label>
                    <Input
                      value={uploadSignedBy}
                      onChange={(e) => setUploadSignedBy(e.target.value)}
                      placeholder="Nombre completo"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Notas internas{" "}
                <span className="text-[10px] text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Textarea
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Ej: contrato firmado en notaría, original físico en archivo Gard, etc."
                rows={2}
              />
            </div>

            {dialogError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {dialogError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadSaving || !!dialogError}
            >
              {uploadSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Subir Contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
