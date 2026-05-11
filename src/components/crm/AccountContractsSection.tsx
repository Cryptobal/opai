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
  Pencil,
  ExternalLink,
  Wallet,
  MapPin,
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
  installationId?: string | null;
  installationIds?: string[];
  cashflow?: {
    itemId: string;
    amountClp: number;
    currency: string;
    dayOfMonth: number | null;
    hasIpcAdjustment?: boolean;
    ipcAdjustmentMonths?: number | null;
  } | null;
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

function monthsBetweenISO(startISO: string, endISO: string): number | null {
  const s = startISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const e = endISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!s || !e) return null;
  const months =
    (Number(e[1]) - Number(s[1])) * 12 + (Number(e[2]) - Number(s[2]));
  return months > 0 ? months : null;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL");
}

/** Parser robusto de montos en formato chileno: punto miles, coma decimal. */
function parseChileanAmount(input: string): number {
  if (!input) return NaN;
  const cleaned = input.replace(/\./g, "").replace(",", ".");
  return Number(cleaned);
}

/** Formato de monto según moneda: UF acepta hasta 2 decimales, CLP entero. */
function formatAmount(n: number, currency: string): string {
  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: currency === "UF" ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(n);
}

/** Renderiza el monto con su signo: "$1.500.000" o "UF 117,50". */
function renderAmountWithCurrency(n: number, currency: string): string {
  if (currency === "UF") {
    return `UF ${new Intl.NumberFormat("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)}`;
  }
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;
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
  // Instalación + integración con Flujo de Caja al subir contrato.
  const [installations, setInstallations] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [uploadInstallationId, setUploadInstallationId] = useState<string>("");
  const [uploadInstallationIds, setUploadInstallationIds] = useState<string[]>([]);
  const [uploadAddToCashflow, setUploadAddToCashflow] = useState(false);
  const [uploadMonthlyAmount, setUploadMonthlyAmount] = useState<string>("");
  const [uploadCurrency, setUploadCurrency] = useState<"CLP" | "UF">("CLP");
  const [uploadPaymentDay, setUploadPaymentDay] = useState<string>("5");
  // Diálogo "Configurar flujo de caja" por contrato individual.

  // Cotizaciones aceptadas con flujo de caja (CpqQuote-derived). Históricamente
  // se mostraban en una sección separada (AccountCashflowQuotesSection), pero
  // conceptualmente son contratos del cliente igual que los Documents — los
  // renderizamos en la misma lista para no duplicar visualmente.
  interface QuoteContract {
    id: string;
    code: string;
    clientName: string | null;
    monthlyCost: number;
    currency: string;
    contractStartDate: string | null;
    contractDuration: number;
    paymentDays: number;
    paymentDayMode: string;
    installation: { id: string; name: string } | null;
  }
  const [quoteContracts, setQuoteContracts] = useState<QuoteContract[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);

  // Edit dialog state (only for manually uploaded contracts)
  const [editOpen, setEditOpen] = useState(false);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [editStatus, setEditStatus] = useState<"active" | "expired" | "renewed">(
    "active",
  );
  const [editEffective, setEditEffective] = useState("");
  const [editExpiration, setEditExpiration] = useState("");
  const [editDuration, setEditDuration] = useState<string>("12");
  const [editExpirationManuallyEdited, setEditExpirationManuallyEdited] = useState(false);
  const [editIndefinite, setEditIndefinite] = useState(false);
  const [editAlertDays, setEditAlertDays] = useState<string>("30");
  const [editSaving, setEditSaving] = useState(false);
  // Edit ampliado: instalación, flujo de caja, monto y moneda
  const [editInstallationId, setEditInstallationId] = useState<string>("");
  const [editInstallationIds, setEditInstallationIds] = useState<string[]>([]);
  const [editInCashflow, setEditInCashflow] = useState(false);
  const [editMonthlyAmount, setEditMonthlyAmount] = useState<string>("");
  const [editCurrency, setEditCurrency] = useState<"CLP" | "UF">("CLP");
  const [editPaymentDay, setEditPaymentDay] = useState<string>("5");
  // Fase E — ajuste IPC (sólo aplicable a CLP)
  const [editHasIpc, setEditHasIpc] = useState<boolean>(false);
  const [editIpcMonths, setEditIpcMonths] = useState<string>("12");

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

  // Cargar cotizaciones (CpqQuote) con cashflow para mostrarlas en la
  // misma lista. Endpoint reutilizado: AccountCashflowQuotesSection ya lo
  // usaba.
  const fetchQuoteContracts = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const r = await fetch(`/api/crm/accounts/${accountId}/cashflow-quotes`);
      const j = await r.json();
      if (j?.success) {
        setQuoteContracts(j.data.quotes ?? []);
      }
    } finally {
      setQuotesLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchQuoteContracts();
  }, [fetchQuoteContracts]);

  // Lazy-load instalaciones del cliente para el selector del upload.
  // Solo se trae una vez al montar; el set cambia poco en runtime.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/installations?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const items = (j.data ?? []).map(
          (i: { id: string; name: string }) => ({ id: i.id, name: i.name }),
        );
        setInstallations(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountId]);

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
    setUploadInstallationId("");
    setUploadInstallationIds([]);
    setUploadAddToCashflow(false);
    setUploadMonthlyAmount("");
    setUploadCurrency("CLP");
    setUploadPaymentDay("5");
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
      // Subida en dos pasos para bypassear el límite de body de Vercel
      // (Hobby ~4.5MB). Pedimos un presigned URL, subimos el PDF directo
      // a R2, y después POSTeamos sólo metadata + storageKey al endpoint.
      const presignRes = await fetch("/api/storage/presigned-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: uploadFile.name,
          mimeType: uploadFile.type || "application/pdf",
          prefix: "contracts",
        }),
      });
      const presign = await presignRes.json();
      if (!presign.success) {
        toast.error(presign.error || "No se pudo iniciar la subida");
        return;
      }
      const putRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "application/pdf" },
        body: uploadFile,
      });
      if (!putRes.ok) {
        toast.error(`Error subiendo el PDF al storage (${putRes.status})`);
        return;
      }

      const amt = uploadAddToCashflow
        ? Number(uploadMonthlyAmount.replace(/\./g, "").replace(",", "."))
        : null;
      const payload: Record<string, unknown> = {
        storageKey: presign.storageKey,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        title: uploadTitle.trim(),
        category: uploadCategory,
        effectiveDate: uploadEffective || undefined,
        expirationDate: uploadExpiration || undefined,
        durationMonths: uploadDuration || undefined,
        alertDaysBefore: uploadAlertDays || undefined,
        signedExternally: uploadSignedExternally,
        signedAt: uploadSignedExternally && uploadSignedAt ? uploadSignedAt : undefined,
        signedBy:
          uploadSignedExternally && uploadSignedBy.trim()
            ? uploadSignedBy.trim()
            : undefined,
        notes: uploadNotes.trim() || undefined,
        installationId: uploadInstallationId || undefined,
        installationIds:
          uploadInstallationIds.length > 0 ? uploadInstallationIds : undefined,
        addToCashflow: uploadAddToCashflow,
      };
      if (uploadAddToCashflow) {
        if (Number.isFinite(amt) && (amt ?? 0) > 0) {
          payload.monthlyAmountClp = amt;
        }
        payload.currency = uploadCurrency;
        if (uploadPaymentDay) payload.paymentDay = Number(uploadPaymentDay);
      }

      const res = await fetch(`/api/crm/accounts/${accountId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  // ─── Edit dialog: open / save ──────────────────────────────────
  const openEditDialog = (contract: Contract) => {
    setEditContract(contract);
    const allowedStatus =
      contract.status === "expired" || contract.status === "renewed"
        ? contract.status
        : "active";
    setEditStatus(allowedStatus);
    const effISO = contract.effectiveDate?.slice(0, 10) ?? "";
    const expISO = contract.expirationDate?.slice(0, 10) ?? "";
    setEditEffective(effISO);
    setEditExpiration(expISO);
    setEditIndefinite(!contract.expirationDate);
    const inferred = effISO && expISO ? monthsBetweenISO(effISO, expISO) : null;
    setEditDuration(inferred ? String(inferred) : "12");
    setEditExpirationManuallyEdited(true);
    setEditAlertDays(String(contract.alertDaysBefore ?? 30));
    setEditInstallationId(contract.installationId ?? "");
    setEditInstallationIds(
      contract.installationIds && contract.installationIds.length > 0
        ? contract.installationIds
        : contract.installationId
          ? [contract.installationId]
          : [],
    );
    if (contract.cashflow) {
      setEditInCashflow(true);
      const amt = contract.cashflow.amountClp;
      const currency = contract.cashflow.currency === "UF" ? "UF" : "CLP";
      setEditCurrency(currency);
      setEditMonthlyAmount(formatAmount(amt, currency));
      setEditPaymentDay(String(contract.cashflow.dayOfMonth ?? 5));
      setEditHasIpc(!!contract.cashflow.hasIpcAdjustment);
      setEditIpcMonths(String(contract.cashflow.ipcAdjustmentMonths ?? 12));
    } else {
      setEditInCashflow(false);
      setEditMonthlyAmount("");
      setEditCurrency("CLP");
      setEditPaymentDay("5");
      setEditHasIpc(false);
      setEditIpcMonths("12");
    }
    setEditOpen(true);
  };

  const editError = useMemo(() => {
    if (!editContract) return null;
    if (!editIndefinite && editEffective && editExpiration) {
      if (new Date(editExpiration) < new Date(editEffective)) {
        return "La fecha de vencimiento debe ser posterior a la fecha de inicio";
      }
    }
    return null;
  }, [editContract, editIndefinite, editEffective, editExpiration]);

  // Recalcula fecha de término cuando cambia inicio o duración, salvo que el
  // usuario haya editado manualmente la fecha de término en esta sesión.
  useEffect(() => {
    if (!editOpen || editIndefinite || editExpirationManuallyEdited) return;
    const months = Number(editDuration);
    if (!editEffective || !Number.isFinite(months) || months <= 0) return;
    setEditExpiration(addMonthsISO(editEffective, months));
  }, [editOpen, editEffective, editDuration, editIndefinite, editExpirationManuallyEdited]);

  const handleEditSave = async () => {
    if (!editContract) return;
    if (editError) {
      toast.error(editError);
      return;
    }
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        status: editStatus,
        effectiveDate: editEffective || null,
        expirationDate: editIndefinite ? null : editExpiration || null,
        alertDaysBefore: Number(editAlertDays) || 30,
        installationId:
          editInstallationIds[0] ?? (editInstallationId || null),
        installationIds: editInstallationIds,
      };
      const res = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${editContract.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Error al actualizar contrato");
        return;
      }

      // Si se cambió algo del cashflow (monto/moneda/día/instalación o
      // toggle), upsert/delete vía el mismo endpoint que usa el dialog
      // específico de cashflow para no duplicar la lógica.
      const hadCashflow = !!editContract.cashflow;
      const cashflowChanged =
        hadCashflow !== editInCashflow ||
        (editInCashflow &&
          (parseFloat(editMonthlyAmount.replace(/\./g, "").replace(",", ".")) !==
            (editContract.cashflow?.amountClp ?? NaN) ||
            editCurrency !== (editContract.cashflow?.currency ?? "CLP") ||
            Number(editPaymentDay) !== (editContract.cashflow?.dayOfMonth ?? NaN) ||
            editInstallationId !== (editContract.installationId ?? "") ||
            editHasIpc !== !!editContract.cashflow?.hasIpcAdjustment ||
            (editHasIpc &&
              Number(editIpcMonths) !==
                (editContract.cashflow?.ipcAdjustmentMonths ?? NaN))));

      if (cashflowChanged) {
        if (editInCashflow) {
          const amt = parseFloat(
            editMonthlyAmount.replace(/\./g, "").replace(",", "."),
          );
          if (!Number.isFinite(amt) || amt <= 0) {
            toast.error("Indica el monto mensual del contrato");
            return;
          }
          const pd = Number(editPaymentDay);
          const cfRes = await fetch(
            `/api/crm/accounts/${accountId}/contracts/${editContract.id}/cashflow`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                // En multi-instalación pasamos null al cashflow item (vive a
                // nivel cuenta y la UI lista las instalaciones desde DocAssoc).
                installationId:
                  editInstallationIds.length === 1
                    ? editInstallationIds[0]
                    : null,
                monthlyAmountClp: amt,
                currency: editCurrency,
                paymentDay: Number.isFinite(pd) && pd !== 0 ? pd : 5,
                startDate: editEffective || todayISO(),
                endDate:
                  editIndefinite || !editExpiration ? null : editExpiration,
                hasIpcAdjustment: editCurrency === "CLP" ? editHasIpc : false,
                ipcAdjustmentMonths:
                  editCurrency === "CLP" && editHasIpc
                    ? Number(editIpcMonths) || 12
                    : null,
              }),
            },
          );
          const cfJson = await cfRes.json();
          if (!cfJson?.success) {
            toast.error(cfJson?.error || "Error guardando flujo de caja");
            return;
          }
        } else if (hadCashflow) {
          await fetch(
            `/api/crm/accounts/${accountId}/contracts/${editContract.id}/cashflow`,
            { method: "DELETE" },
          );
        }
      }

      toast.success("Contrato actualizado");
      setEditOpen(false);
      setEditContract(null);
      fetchContracts();
      onRefresh?.();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setEditSaving(false);
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
        color: "bg-status-warn-soft text-status-warn-fg",
      },
      in_progress: {
        label: "En proceso de firma",
        color: "bg-status-info-soft text-status-info-fg",
      },
      completed: {
        label: signedAt ? `Firmado · ${formatDate(signedAt)}` : "Firmado",
        color: "bg-status-ok-soft text-status-ok-fg",
      },
      cancelled: {
        label: "Firma cancelada",
        color: "bg-status-danger-soft text-status-danger-fg",
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
        <span className="inline-flex items-center gap-1 text-xs font-medium text-status-danger-fg">
          <XCircle className="h-3 w-3" />
          Vencido el {formatDate(c.expirationDate)}
        </span>
      );
    }
    if (days <= c.alertDaysBefore) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warn-fg">
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
    if (c.status === "expired") return "border-status-danger-border bg-status-danger-soft/60";
    if (c.status === "expiring") return "border-status-warn-border bg-status-warn-soft/60";
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
      ) : contracts.length === 0 && quoteContracts.length === 0 ? (
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
            // Es un upload manual cualquier doc con PDF que no nació de una
            // plantilla (independiente de si se marcó firma externa o no).
            const isUpload = !c.templateName && !!c.pdfUrl;

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
                    <span className="font-medium text-sm break-words">
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
                        className="text-[10px] px-1.5 py-0 bg-status-ok-soft text-status-ok-fg"
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
                    {(() => {
                      const ids =
                        c.installationIds && c.installationIds.length > 0
                          ? c.installationIds
                          : c.installationId
                            ? [c.installationId]
                            : [];
                      if (ids.length === 0) return null;
                      const names = ids
                        .map(
                          (id) =>
                            installations.find((i) => i.id === id)?.name ?? "—",
                        )
                        .filter(Boolean);
                      return (
                        <span className="text-xs text-muted-foreground break-words inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {names.length === 1
                            ? names[0]
                            : `${names.length} instalaciones: ${names.join(", ")}`}
                        </span>
                      );
                    })()}
                    {c.deal && (
                      <span className="text-xs text-muted-foreground break-words">
                        Negocio: {c.deal.title}
                      </span>
                    )}
                    {c.templateName && (
                      <span className="text-xs text-muted-foreground break-words">
                        Plantilla: {c.templateName}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {CONTRACT_CATEGORY_LABELS[c.category as ContractCategory] ?? c.category}
                    </span>
                  </div>
                  {c.cashflow ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-status-ok-soft/30 border border-status-ok-fg/20 px-2.5 py-1.5">
                      <Wallet className="h-3.5 w-3.5 text-status-ok-fg" />
                      <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-status-ok-fg">
                        En flujo de caja
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-status-ok-fg">
                        {renderAmountWithCurrency(c.cashflow.amountClp, c.cashflow.currency)}/mes
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        · día {c.cashflow.dayOfMonth === -1 ? "último" : c.cashflow.dayOfMonth}
                      </span>
                      <div className="flex gap-1 ml-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => router.push(`/finanzas/flujo-caja?itemId=${c.cashflow!.itemId}`)}
                        >
                          Ver
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEditDialog(c)}
                      className="mt-2 w-full sm:w-auto flex items-center gap-2 rounded-md border border-dashed border-status-ok-fg/40 bg-status-ok-soft/10 hover:bg-status-ok-soft/30 hover:border-status-ok-fg/70 px-3 py-2 text-left transition-colors"
                    >
                      <Wallet className="h-4 w-4 text-status-ok-fg shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-foreground">
                          Agregar a flujo de caja
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Configurar monto mensual, instalación y día de pago
                        </p>
                      </div>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                  {isUpload && c.pdfUrl ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Ver PDF"
                      asChild
                    >
                      <a
                        href={c.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Ver en Gestión Documental"
                      onClick={() => router.push(`/opai/documentos/${c.id}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Editar contrato"
                    onClick={() => openEditDialog(c)}
                    disabled={isLoading}
                  >
                    <Pencil className="h-3.5 w-3.5" />
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
                      c.portalVisible ? "text-status-ok-fg" : ""
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

          {/* Cotizaciones aceptadas (CpqQuote-derived). Aparecen en la
              misma lista para que el usuario las vea como "el contrato"
              independiente del origen (PDF subido vs cotización ganada). */}
          {quoteContracts.map((q) => {
            const monthly = new Intl.NumberFormat("es-CL", {
              maximumFractionDigits: 0,
            }).format(Number(q.monthlyCost));
            const startStr = q.contractStartDate
              ? new Date(q.contractStartDate).toLocaleDateString("es-CL")
              : "—";
            const payLabel =
              q.paymentDayMode === "SPECIFIC_DAY"
                ? `día ${q.paymentDays}`
                : q.paymentDayMode === "FIRST_BUSINESS_DAY"
                  ? "primer día hábil"
                  : q.paymentDayMode === "LAST_BUSINESS_DAY"
                    ? "último día hábil"
                    : q.paymentDayMode === "FIRST_MONDAY"
                      ? "primer lunes"
                      : q.paymentDayMode;
            return (
              <div
                key={`quote-${q.id}`}
                className="flex items-start sm:items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/30 flex-col sm:flex-row"
              >
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm break-words">
                      {q.installation?.name ?? q.clientName ?? "Cotización"}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 font-mono"
                    >
                      {q.code}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-status-info-soft text-status-info-fg"
                    >
                      Desde cotización
                    </Badge>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 mt-1 gap-1">
                    <span className="text-xs text-muted-foreground">
                      Inicio: {startStr}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Duración: {q.contractDuration} meses
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-status-ok-soft/30 border border-status-ok-fg/20 px-2.5 py-1.5">
                    <Wallet className="h-3.5 w-3.5 text-status-ok-fg" />
                    <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-status-ok-fg">
                      En flujo de caja
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-status-ok-fg">
                      ${monthly}/mes
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      · {payLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    title="Abrir cotización"
                    onClick={() => router.push(`/crm/cotizaciones/${q.id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Cotización
                  </Button>
                </div>
              </div>
            );
          })}

          {quotesLoading && quoteContracts.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando cotizaciones…
            </div>
          )}
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
                <span className="break-all flex-1 min-w-0">{uploadFile.name}</span>
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

            {/* ── Vinculación: Instalación + Flujo de Caja ───────────── */}
            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Instalaciones vinculadas
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (puede ser más de una)
                  </span>
                </Label>
                {uploadInstallationIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {uploadInstallationIds.map((id) => {
                      const inst = installations.find((i) => i.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-md bg-status-info-soft text-status-info-fg text-xs px-2 py-0.5"
                        >
                          <MapPin className="h-3 w-3" />
                          {inst?.name ?? id.slice(0, 8)}
                          <button
                            type="button"
                            onClick={() =>
                              setUploadInstallationIds((prev) =>
                                prev.filter((x) => x !== id),
                              )
                            }
                            className="ml-0.5 hover:opacity-70"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v && !uploadInstallationIds.includes(v)) {
                      setUploadInstallationIds((prev) => [...prev, v]);
                    }
                    if (v && uploadInstallationIds.length === 0) {
                      setUploadInstallationId(v);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="+ Agregar instalación" />
                  </SelectTrigger>
                  <SelectContent>
                    {installations
                      .filter((i) => !uploadInstallationIds.includes(i.id))
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Una instalación: el contrato aparece sólo en su detalle.
                  Varias: aparece bajo el cliente en el flujo de caja con todas
                  las instalaciones listadas.
                </p>
              </div>

              <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-border">
                <Checkbox
                  checked={uploadAddToCashflow}
                  onCheckedChange={(v) => setUploadAddToCashflow(v === true)}
                  className="mt-1"
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    Ingresa al flujo de caja
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Crea automáticamente un ingreso mensual recurrente en
                    &quot;Ventas por contrato&quot;, vinculado a este PDF.
                    Termina cuando vence el contrato.
                  </p>
                </div>
              </label>

              {uploadAddToCashflow && (
                <div className="pt-2 border-t border-border space-y-3">
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div className="space-y-2">
                      <Label>Monto mensual ({uploadCurrency})</Label>
                      <Input
                        inputMode="decimal"
                        value={uploadMonthlyAmount}
                        onChange={(e) => {
                          // Permite tipear coma decimal (UF) sin que se reemplace en vivo.
                          setUploadMonthlyAmount(e.target.value.replace(/[^\d.,]/g, ""));
                        }}
                        onBlur={() => {
                          const n = parseChileanAmount(uploadMonthlyAmount);
                          if (Number.isFinite(n) && n > 0) {
                            setUploadMonthlyAmount(formatAmount(n, uploadCurrency));
                          }
                        }}
                        placeholder={uploadCurrency === "UF" ? "117,50" : "1.500.000"}
                        className="font-mono text-right"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Moneda</Label>
                      <Select
                        value={uploadCurrency}
                        onValueChange={(v) => {
                          const next = v === "UF" ? "UF" : "CLP";
                          setUploadCurrency(next);
                          const n = parseChileanAmount(uploadMonthlyAmount);
                          if (Number.isFinite(n) && n > 0) {
                            setUploadMonthlyAmount(formatAmount(n, next));
                          }
                        }}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CLP">CLP</SelectItem>
                          <SelectItem value="UF">UF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Día de pago</Label>
                    <Input
                      type="number"
                      min={-1}
                      max={31}
                      value={uploadPaymentDay}
                      onChange={(e) => setUploadPaymentDay(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      <code className="font-mono">-1</code> = último día del mes.
                      {uploadCurrency === "UF" && (
                        <> Monto en UF, convertido a CLP con la UF del día de pago.</>
                      )}
                    </p>
                  </div>
                </div>
              )}
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

      {/* ─── Edit Dialog (uploads manuales) ─────────────────────── */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditContract(null);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar contrato</DialogTitle>
            <DialogDescription>
              Actualiza estado, fechas, alerta, instalación y configuración de
              flujo de caja del PDF cargado manualmente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {editContract && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="break-words flex-1 min-w-0">{editContract.title}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                value={editStatus}
                onValueChange={(v) =>
                  setEditStatus(v as "active" | "expired" | "renewed")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="expired">Vencido / Inactivo</SelectItem>
                  <SelectItem value="renewed">Renovado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                «Por vencer» se calcula automáticamente desde la fecha de
                término y los días de alerta.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha de inicio</Label>
                <Input
                  type="date"
                  value={editEffective}
                  onChange={(e) => {
                    setEditEffective(e.target.value);
                    setEditExpirationManuallyEdited(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Duración (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={editDuration}
                  onChange={(e) => {
                    setEditDuration(e.target.value);
                    setEditExpirationManuallyEdited(false);
                  }}
                  placeholder="12"
                  disabled={editIndefinite}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Fecha de término
                <span className="text-[10px] text-muted-foreground font-normal">
                  (calculada · puedes editarla)
                </span>
              </Label>
              <Input
                type="date"
                value={editExpiration}
                onChange={(e) => {
                  setEditExpiration(e.target.value);
                  setEditExpirationManuallyEdited(true);
                  if (e.target.value) setEditIndefinite(false);
                }}
                disabled={editIndefinite}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={editIndefinite}
                onCheckedChange={(v) => {
                  const next = v === true;
                  setEditIndefinite(next);
                  if (next) {
                    setEditExpiration("");
                  } else {
                    setEditExpirationManuallyEdited(false);
                  }
                }}
              />
              <span className="text-sm">
                Sin fecha de término (contrato indefinido)
              </span>
            </label>

            <div className="space-y-2">
              <Label>Días de alerta antes de vencer</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={editAlertDays}
                onChange={(e) => setEditAlertDays(e.target.value)}
                disabled={editIndefinite}
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label>
                Instalaciones vinculadas{" "}
                <span className="text-[10px] text-muted-foreground font-normal">
                  (puede ser más de una)
                </span>
              </Label>
              {editInstallationIds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {editInstallationIds.map((id) => {
                    const inst = installations.find((i) => i.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-md bg-status-info-soft text-status-info-fg text-xs px-2 py-0.5"
                      >
                        <MapPin className="h-3 w-3" />
                        {inst?.name ?? id.slice(0, 8)}
                        <button
                          type="button"
                          onClick={() =>
                            setEditInstallationIds((prev) =>
                              prev.filter((x) => x !== id),
                            )
                          }
                          className="ml-0.5 hover:opacity-70"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <Select
                value=""
                onValueChange={(v) => {
                  if (v && !editInstallationIds.includes(v)) {
                    setEditInstallationIds((prev) => [...prev, v]);
                  }
                  // sincroniza el legacy `installationId` con la primera
                  // elegida para retrocompatibilidad con UI vieja.
                  if (v && editInstallationIds.length === 0) {
                    setEditInstallationId(v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="+ Agregar instalación" />
                </SelectTrigger>
                <SelectContent>
                  {installations
                    .filter((i) => !editInstallationIds.includes(i.id))
                    .map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-start gap-2 cursor-pointer pt-2 border-t border-border">
              <Checkbox
                checked={editInCashflow}
                onCheckedChange={(v) => setEditInCashflow(v === true)}
                className="mt-1"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  Ingresa al flujo de caja
                </span>
                <p className="text-xs text-muted-foreground">
                  Crea un ingreso mensual recurrente vinculado a este contrato.
                  Termina cuando vence el contrato.
                </p>
              </div>
            </label>

            {editInCashflow && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-2">
                    <Label>Monto mensual ({editCurrency})</Label>
                    <Input
                      inputMode="decimal"
                      value={editMonthlyAmount}
                      onChange={(e) => {
                        // Acepta dígitos, punto (miles) y coma (decimal).
                        // No re-formateamos en cada keystroke porque eso
                        // se come la coma cuando el usuario está tipeando.
                        setEditMonthlyAmount(e.target.value.replace(/[^\d.,]/g, ""));
                      }}
                      onBlur={() => {
                        const n = parseChileanAmount(editMonthlyAmount);
                        if (Number.isFinite(n) && n > 0) {
                          setEditMonthlyAmount(formatAmount(n, editCurrency));
                        }
                      }}
                      placeholder={editCurrency === "UF" ? "117,50" : "1.500.000"}
                      className="font-mono text-right"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select
                      value={editCurrency}
                      onValueChange={(v) => {
                        const next = v === "UF" ? "UF" : "CLP";
                        setEditCurrency(next);
                        const n = parseChileanAmount(editMonthlyAmount);
                        if (Number.isFinite(n) && n > 0) {
                          setEditMonthlyAmount(formatAmount(n, next));
                        }
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLP">CLP</SelectItem>
                        <SelectItem value="UF">UF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Día de pago</Label>
                  <Input
                    type="number"
                    min={-1}
                    max={31}
                    value={editPaymentDay}
                    onChange={(e) => setEditPaymentDay(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    <code className="font-mono">-1</code> = último día del mes.
                    {editCurrency === "UF" && (
                      <> Monto en UF, convertido a CLP con la UF del día de pago.</>
                    )}
                  </p>
                </div>
                {/* Ajuste IPC — sólo aplica a contratos CLP (los UF se reajustan solos vía UF) */}
                {editCurrency === "CLP" ? (
                  <div className="space-y-2 pt-3 border-t border-border">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={editHasIpc}
                        onCheckedChange={(v) => setEditHasIpc(v === true)}
                        className="mt-1"
                      />
                      <div className="space-y-0.5">
                        <span className="text-sm font-medium">
                          Tiene ajuste de IPC
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Cuando se acerque la fecha del ajuste, te avisamos para
                          que ingreses el % del período (el IPC real recién se
                          conoce ese mes, no se puede predefinir).
                        </p>
                      </div>
                    </label>
                    {editHasIpc ? (
                      <div className="space-y-1 pl-6">
                        <Label className="text-xs">Cada cuántos meses se ajusta</Label>
                        <Input
                          type="number"
                          min={1}
                          max={36}
                          value={editIpcMonths}
                          onChange={(e) => setEditIpcMonths(e.target.value)}
                          className="max-w-[120px]"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Típico: <strong>12</strong> (anual) o <strong>6</strong> (semestral).
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {editError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {editError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={editSaving || !!editError}
            >
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
