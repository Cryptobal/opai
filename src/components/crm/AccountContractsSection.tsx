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
  Briefcase,
  TrendingUp,
  PlusCircle,
  X,
  History,
} from "lucide-react";
import { ApplyIpcDialog } from "./ApplyIpcDialog";
import { IpcHistoryDialog } from "./IpcHistoryDialog";
import { ContactsMultiSelect } from "@/components/finance/recurring/ContactsMultiSelect";
import { cn } from "@/lib/utils";
import { DOC_STATUS_CONFIG } from "@/lib/docs/token-registry";
import {
  CONTRACT_CATEGORIES,
  CONTRACT_CATEGORY_LABELS,
  type ContractCategory,
} from "@/lib/validations/docs";

/**
 * Fase 4 — La tarjeta de contrato deja de mostrar/gestionar el flujo de caja:
 * el cobro, la emisión y el reajuste IPC viven ahora en Programación / Flujo de
 * Caja (módulo Finanzas). Acá solo se manejan los TÉRMINOS del contrato (estado,
 * fechas, vencimiento, alerta, instalaciones).
 *
 * Se deja como flag (no se borra el código) para poder re-encender la gestión
 * antigua al instante si la migración de datos a Programación revela algo. Una
 * vez confirmada la migración en prod, este bloque y su UI se eliminan.
 */
const SHOW_CONTRACT_CASHFLOW: boolean = false;

interface CfItem {
  itemId: string;
  installationId: string | null;
  amountClp: number;
  currency: string;
  dayOfMonth: number | null;
  startDate?: string | null;
  endDate?: string | null;
  hasIpcAdjustment?: boolean;
  ipcAdjustmentMonths?: number | null;
  ipcStartDate?: string | null;
  // Bloque 5 — calendario de cobro por contrato
  nickname?: string | null;
  emiteProforma?: boolean;
  diaEmisionProforma?: number | null;
  diasFacturaDesdeProforma?: number | null;
  diaEmisionFactura?: number | null;
  mesFacturaRelativo?: "MISMO_MES" | "MES_SIGUIENTE" | string;
  modoCobro?: "DIRECTO" | "FACTORING" | string;
  diasCobroDesdeFactura?: number;
  pendingIpcAdjustments?: Array<{ id: string; dueDate: string }>;
}

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
  deals?: Array<{ id: string; title: string }>;
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
  cashflowItems: CfItem[];
}

interface Props {
  accountId: string;
  accountName: string;
  // Datos del CrmAccount necesarios para pre-rellenar la plantilla de
  // factura recurrente (SII). Todos opcionales: si faltan, el usuario los
  // completa en el modal antes de crear la plantilla.
  accountRut?: string | null;
  accountLegalName?: string | null;
  accountGiro?: string | null;
  accountAddress?: string | null;
  accountCommune?: string | null;
  accountCity?: string | null;
  accountEmail?: string | null;
  onRefresh?: () => void;
}

// ─── RUT helper (DV check, espejo del validador del schema Zod en
// /lib/validations/finance.ts). Lo dejamos local para no exportar desde el
// archivo de validaciones del server y evitar inflar el bundle del cliente
// con dependencias innecesarias.
function validateRutDVClient(rut: string): boolean {
  const clean = rut.replace(/[^\dKk]/g, "").toUpperCase();
  if (clean.length < 2) return false;
  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let multi = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multi;
    multi = multi === 7 ? 2 : multi + 1;
  }
  const resto = 11 - (suma % 11);
  const dvCalc = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === dvCalc;
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
  accountRut,
  accountLegalName,
  accountGiro,
  accountAddress,
  accountCommune,
  accountCity,
  accountEmail,
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
  // Negocios de la cuenta (cruce contrato ↔ negocio). Al elegir uno se
  // prellena la fecha de inicio del contrato (desde serviceStartDate del
  // negocio) y se agregan sus instalaciones activadas.
  const [deals, setDeals] = useState<
    Array<{
      id: string;
      title: string;
      serviceStartDate: string | null;
      stageName: string | null;
      installations: Array<{ id: string; name: string }>;
    }>
  >([]);
  const [uploadDealIds, setUploadDealIds] = useState<string[]>([]);
  const [uploadAddToCashflow, setUploadAddToCashflow] = useState(false);
  const [uploadMonthlyAmount, setUploadMonthlyAmount] = useState<string>("");
  const [uploadCurrency, setUploadCurrency] = useState<"CLP" | "UF">("CLP");
  const [uploadPaymentDay, setUploadPaymentDay] = useState<string>("5");
  // Modo "ingreso al FC sin contrato firmado": el modal queda sin
  // dropzone, `addToCashflow` queda forzado en true y el doc se crea
  // con pdfUrl=null + status="pending_signature".
  const [uploadPendingSignature, setUploadPendingSignature] = useState(false);
  // Ajuste IPC al crear — sólo aplica a CLP. Espejo del bloque que ya
  // existe en el modal de edición.
  const [uploadHasIpc, setUploadHasIpc] = useState(false);
  const [uploadIpcMonths, setUploadIpcMonths] = useState<string>("12");

  // ── Plantilla de Factura Recurrente (SII) ──
  // Cuando el contrato genera ingreso al flujo de caja, opcionalmente
  // creamos también una `FinanceDteRecurringTemplate` que el cron diario
  // usa para generar borradores DTE mensuales (revisa+emite el usuario).
  // Pre-rellenamos con los datos del CrmAccount; el usuario puede editar
  // todo antes de guardar.
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringName, setRecurringName] = useState<string>("");
  const [recurringDteType, setRecurringDteType] = useState<"33" | "34">("33");
  const [recurringRut, setRecurringRut] = useState<string>("");
  const [recurringReceiverName, setRecurringReceiverName] = useState<string>("");
  const [recurringEmail, setRecurringEmail] = useState<string>("");
  const [recurringGiro, setRecurringGiro] = useState<string>("");
  const [recurringAddress, setRecurringAddress] = useState<string>("");
  const [recurringComuna, setRecurringComuna] = useState<string>("");
  const [recurringCiudad, setRecurringCiudad] = useState<string>("");
  const [recurringFrequency, setRecurringFrequency] = useState<
    "monthly" | "biweekly" | "weekly" | "yearly"
  >("monthly");
  const [recurringDayOfWeek, setRecurringDayOfWeek] = useState<string>("1");
  const [recurringMonthOfYear, setRecurringMonthOfYear] = useState<string>("1");
  const [recurringPeriodPolicy, setRecurringPeriodPolicy] = useState<
    "CURRENT_MONTH" | "PREVIOUS_MONTH" | "NEXT_MONTH"
  >("CURRENT_MONTH");
  const [recurringUfFixingPolicy, setRecurringUfFixingPolicy] = useState<
    "RUN_DAY" | "LAST_DAY_PREV_MONTH" | "FIRST_DAY_MONTH" | "LAST_DAY_MONTH"
  >("LAST_DAY_PREV_MONTH");
  const [recurringAutoSendEmail, setRecurringAutoSendEmail] = useState<boolean>(true);
  // Espejo de los toggles del módulo Facturación → Programación: si los
  // marcamos acá, el cron al generar el borrador dispara también el
  // envío de proforma y/o estado de pago al receptor.
  const [recurringIsActive, setRecurringIsActive] = useState<boolean>(true);
  const [recurringAutoSendProforma, setRecurringAutoSendProforma] =
    useState<boolean>(false);
  const [recurringAutoSendPaymentStatement, setRecurringAutoSendPaymentStatement] =
    useState<boolean>(false);
  // Contactos CRM que reciben proforma / estado de pago. El endpoint exige
  // al menos uno cuando cualquiera de esos dos envíos automáticos está activo.
  const [recurringRecipientContactIds, setRecurringRecipientContactIds] =
    useState<string[]>([]);
  // CC: el receptor principal (TO) sale de `recurringEmail`. Estos van
  // como copia. Texto crudo separado por coma/espacio/`;`.
  const [recurringCcEmailsRaw, setRecurringCcEmailsRaw] = useState<string>("");
  // Referencias adicionales (no-DTE): OC, HES, Contrato, etc.
  // Se persisten en la plantilla y se copian a cada borrador.
  const [recurringAdditionalRefs, setRecurringAdditionalRefs] = useState<
    Array<{ tipoDocRef: string; folioRef: string; fchRef: string }>
  >([]);
  const [recurringLineDescription, setRecurringLineDescription] =
    useState<string>("Servicios mensuales — {{periodo}}");

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
    dealId: string | null;
  }
  const [quoteContracts, setQuoteContracts] = useState<QuoteContract[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);

  // Edit dialog state (only for manually uploaded contracts)
  const [editOpen, setEditOpen] = useState(false);
  const [ipcModal, setIpcModal] = useState<{
    adjustmentId: string | null;
    itemId: string;
    contractTitle: string;
    dueDate: string;
    currentAmount: number;
    currency: string;
  } | null>(null);
  const [ipcHistoryOpen, setIpcHistoryOpen] = useState<string | null>(null);
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
  // Edit ampliado: instalación vinculada (sin FC — FC se gestiona desde la tarjeta)
  const [editInstallationId, setEditInstallationId] = useState<string>("");
  const [editInstallationIds, setEditInstallationIds] = useState<string[]>([]);

  // ─── Diálogo FC por instalación ───────────────────────────────────────────
  // Permite agregar o editar un FinanceCashflowItem por instalación bajo
  // el mismo contrato. Abre con openCfItemDialog(contract, existingItem | null).
  const [cfDialog, setCfDialog] = useState<{
    contractId: string;
    contractTitle: string;
    contractEffective: string | null;
    contractExpiration: string | null;
    itemId?: string;
    installationId?: string | null;
  } | null>(null);
  const [cfInstallId, setCfInstallId] = useState<string>("");
  const [cfAmount, setCfAmount] = useState<string>("");
  const [cfCurrency, setCfCurrency] = useState<"CLP" | "UF">("CLP");
  const [cfStartDate, setCfStartDate] = useState<string>("");
  const [cfEndDate, setCfEndDate] = useState<string>("");
  const [cfHasIpc, setCfHasIpc] = useState<boolean>(false);
  const [cfIpcMonths, setCfIpcMonths] = useState<string>("12");
  const [cfSaving, setCfSaving] = useState(false);
  // ── Bloque 5 Fase 3 — calendario de cobro por contrato ──
  const [cfNickname, setCfNickname] = useState<string>("");
  const [cfEmiteProforma, setCfEmiteProforma] = useState<boolean>(false);
  const [cfDiaEmisionProforma, setCfDiaEmisionProforma] = useState<string>("");
  const [cfDiasFacturaDesdeProforma, setCfDiasFacturaDesdeProforma] =
    useState<string>("");
  const [cfDiaEmisionFactura, setCfDiaEmisionFactura] = useState<string>("");
  const [cfMesFacturaRelativo, setCfMesFacturaRelativo] = useState<
    "MISMO_MES" | "MES_SIGUIENTE"
  >("MISMO_MES");
  const [cfModoCobro, setCfModoCobro] = useState<"DIRECTO" | "FACTORING">(
    "DIRECTO",
  );
  const [cfDiasCobroDesdeFactura, setCfDiasCobroDesdeFactura] =
    useState<string>("0");

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

  // Lazy-load negocios de la cuenta para el selector del upload.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/accounts/${encodeURIComponent(accountId)}/deals`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setDeals(j.data ?? []);
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
    setUploadDealIds([]);
    setUploadAddToCashflow(false);
    setUploadMonthlyAmount("");
    setUploadCurrency("CLP");
    setUploadPaymentDay("5");
    setUploadPendingSignature(false);
    setUploadHasIpc(false);
    setUploadIpcMonths("12");
    // Recurring template: re-hidratamos defaults desde los props del
    // CrmAccount. Si el usuario ya editó algún campo, igual los pisamos
    // — este reset corre al cerrar el modal.
    setRecurringEnabled(false);
    setRecurringName("");
    setRecurringDteType("33");
    setRecurringRut(accountRut ?? "");
    setRecurringReceiverName(accountLegalName ?? accountName);
    setRecurringEmail(accountEmail ?? "");
    setRecurringGiro(accountGiro ?? "");
    setRecurringAddress(accountAddress ?? "");
    setRecurringComuna(accountCommune ?? "");
    setRecurringCiudad(accountCity ?? "");
    setRecurringFrequency("monthly");
    setRecurringDayOfWeek("1");
    setRecurringMonthOfYear("1");
    setRecurringPeriodPolicy("CURRENT_MONTH");
    setRecurringUfFixingPolicy("LAST_DAY_PREV_MONTH");
    setRecurringAutoSendEmail(true);
    setRecurringIsActive(true);
    setRecurringAutoSendProforma(false);
    setRecurringAutoSendPaymentStatement(false);
    setRecurringRecipientContactIds([]);
    setRecurringCcEmailsRaw("");
    setRecurringAdditionalRefs([]);
    setRecurringLineDescription("Servicios mensuales — {{periodo}}");
  }, [
    accountRut,
    accountLegalName,
    accountName,
    accountEmail,
    accountGiro,
    accountAddress,
    accountCommune,
    accountCity,
  ]);

  // ─── Selección de negocios en el upload ───────────────────────
  // Al agregar un negocio: (1) se vincula, (2) sus instalaciones activadas
  // se suman a las instalaciones del contrato, (3) si la fecha de inicio
  // está vacía, se prellena con la serviceStartDate del negocio (la de su
  // ficha). El contrato sigue teniendo UNA sola fecha de inicio: con varios
  // negocios gana la más temprana, y el usuario siempre puede editarla.
  const addDealToUpload = useCallback(
    (dealId: string) => {
      const deal = deals.find((d) => d.id === dealId);
      if (!deal) return;
      setUploadDealIds((prev) =>
        prev.includes(dealId) ? prev : [...prev, dealId],
      );
      // Sumar instalaciones activadas del negocio (sin duplicar).
      if (deal.installations.length > 0) {
        setUploadInstallationIds((prev) => {
          const next = new Set(prev);
          deal.installations.forEach((i) => next.add(i.id));
          return Array.from(next);
        });
      }
      // Prellenar fecha de inicio con la más temprana entre los negocios
      // ya seleccionados (incluido éste). Sólo si el usuario no la fijó.
      if (deal.serviceStartDate) {
        setUploadEffective((prev) => {
          if (!prev) return deal.serviceStartDate as string;
          return deal.serviceStartDate! < prev
            ? (deal.serviceStartDate as string)
            : prev;
        });
      }
    },
    [deals],
  );

  const removeDealFromUpload = useCallback((dealId: string) => {
    setUploadDealIds((prev) => prev.filter((id) => id !== dealId));
    // No removemos instalaciones ni fecha: pudieron editarse a mano y
    // quitar el negocio no debería borrar decisiones del usuario.
  }, []);

  // ─── Abrir modal en modo "sin contrato firmado" ───────────────
  // Permite proyectar el ingreso al flujo de caja antes de tener el PDF.
  const openPendingSignatureDialog = useCallback(() => {
    resetUploadForm();
    setUploadPendingSignature(true);
    setUploadAddToCashflow(true);
    setUploadTitle(`Contrato ${accountName}`);
    setUploadEffective(todayISO());
    setUploadOpen(true);
  }, [accountName, resetUploadForm]);

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
    // En modo "sin contrato firmado" el archivo NO es requerido, pero sí
    // que el ingreso al flujo de caja tenga monto, día y fecha de inicio.
    if (!uploadPendingSignature && !uploadFile) return "Archivo requerido";
    if (!uploadTitle.trim()) return "Título requerido";
    if (uploadEffective && uploadExpiration) {
      if (new Date(uploadExpiration) < new Date(uploadEffective)) {
        return "La fecha de vencimiento debe ser posterior a la fecha de inicio";
      }
    }
    if (uploadSignedExternally && !uploadSignedAt) {
      return "Indica la fecha de firma externa";
    }
    if (uploadPendingSignature) {
      if (!uploadEffective) return "Indica la fecha de inicio del contrato";
      const amt = parseChileanAmount(uploadMonthlyAmount);
      if (!Number.isFinite(amt) || amt <= 0)
        return "Indica el monto mensual del contrato";
      if (!uploadPaymentDay) return "Indica el día de pago";
    }
    // Validaciones extra cuando el usuario quiere crear la plantilla
    // recurrente: el endpoint exige RUT con DV correcto, razón social y
    // los parámetros de frecuencia coherentes.
    if (recurringEnabled && uploadAddToCashflow) {
      if (!recurringName.trim()) return "Plantilla recurrente: indica un nombre";
      if (!recurringRut.trim()) return "Plantilla recurrente: RUT receptor requerido";
      if (!validateRutDVClient(recurringRut))
        return "Plantilla recurrente: RUT inválido (dígito verificador no coincide)";
      if (!recurringReceiverName.trim())
        return "Plantilla recurrente: razón social del receptor requerida";
      if (recurringEmail && !/^\S+@\S+\.\S+$/.test(recurringEmail))
        return "Plantilla recurrente: email receptor inválido";
      if (recurringFrequency === "monthly" || recurringFrequency === "yearly") {
        const d = Number(uploadPaymentDay);
        if (!Number.isFinite(d) || d === 0 || d < -1 || d > 31)
          return "Plantilla recurrente: día del mes inválido (1-31 o -1)";
      }
      if (recurringFrequency === "weekly" || recurringFrequency === "biweekly") {
        const w = Number(recurringDayOfWeek);
        if (!Number.isFinite(w) || w < 0 || w > 6)
          return "Plantilla recurrente: día de la semana inválido (0-6)";
      }
      if (recurringFrequency === "yearly") {
        const m = Number(recurringMonthOfYear);
        if (!Number.isFinite(m) || m < 1 || m > 12)
          return "Plantilla recurrente: mes del año inválido (1-12)";
      }
      // CC: validamos formato y tope de 10 igual que el schema zod.
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const ccCandidates = recurringCcEmailsRaw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const invalidCc = ccCandidates.filter((e) => !EMAIL_RE.test(e));
      if (invalidCc.length > 0)
        return `Plantilla recurrente: emails CC inválidos (${invalidCc.join(", ")})`;
      if (ccCandidates.length > 10)
        return "Plantilla recurrente: máximo 10 emails CC";
      // Referencias: cada una requiere tipo + folio + fecha si fue agregada.
      for (let i = 0; i < recurringAdditionalRefs.length; i++) {
        const r = recurringAdditionalRefs[i];
        if (!r.tipoDocRef.trim() || !r.folioRef.trim() || !r.fchRef)
          return `Plantilla recurrente: referencia #${i + 1} incompleta (tipo, folio y fecha son obligatorios)`;
      }
      // El endpoint exige al menos un contacto destinatario si se activa el
      // envío automático de proforma o de estado de pago (si no, 400).
      if (
        (recurringAutoSendProforma || recurringAutoSendPaymentStatement) &&
        recurringRecipientContactIds.length === 0
      )
        return "Plantilla recurrente: seleccioná al menos un contacto destinatario para el envío automático de proforma / estado de pago";
    }
    return null;
  }, [
    uploadFile,
    uploadTitle,
    uploadEffective,
    uploadExpiration,
    uploadSignedExternally,
    uploadSignedAt,
    uploadPendingSignature,
    uploadMonthlyAmount,
    uploadPaymentDay,
    uploadAddToCashflow,
    recurringEnabled,
    recurringName,
    recurringRut,
    recurringReceiverName,
    recurringEmail,
    recurringFrequency,
    recurringDayOfWeek,
    recurringMonthOfYear,
    recurringCcEmailsRaw,
    recurringAdditionalRefs,
    recurringAutoSendProforma,
    recurringAutoSendPaymentStatement,
    recurringRecipientContactIds,
  ]);

  // ─── Submit upload ─────────────────────────────────────────────
  const handleUpload = async () => {
    if (dialogError) {
      toast.error(dialogError);
      return;
    }
    if (!uploadPendingSignature && !uploadFile) return;
    setUploadSaving(true);
    try {
      // En modo "sin contrato firmado" saltamos la subida a R2: el Document
      // se crea con pdfUrl=null directamente vía JSON.
      let storageKey: string | undefined;
      let fileName: string | undefined;
      let fileSize: number | undefined;
      if (!uploadPendingSignature && uploadFile) {
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
        storageKey = presign.storageKey;
        fileName = uploadFile.name;
        fileSize = uploadFile.size;
      }

      const amt = uploadAddToCashflow
        ? Number(uploadMonthlyAmount.replace(/\./g, "").replace(",", "."))
        : null;
      const payload: Record<string, unknown> = {
        ...(storageKey ? { storageKey, fileName, fileSize } : {}),
        title: uploadTitle.trim(),
        category: uploadCategory,
        effectiveDate: uploadEffective || undefined,
        expirationDate: uploadExpiration || undefined,
        durationMonths: uploadDuration || undefined,
        alertDaysBefore: uploadAlertDays || undefined,
        // En modo pendiente, signedExternally siempre va en false (el doc
        // se está creando justamente porque aún no hay firma).
        signedExternally: uploadPendingSignature ? false : uploadSignedExternally,
        signedAt:
          !uploadPendingSignature && uploadSignedExternally && uploadSignedAt
            ? uploadSignedAt
            : undefined,
        signedBy:
          !uploadPendingSignature && uploadSignedExternally && uploadSignedBy.trim()
            ? uploadSignedBy.trim()
            : undefined,
        notes: uploadNotes.trim() || undefined,
        installationId: uploadInstallationId || undefined,
        installationIds:
          uploadInstallationIds.length > 0 ? uploadInstallationIds : undefined,
        dealIds: uploadDealIds.length > 0 ? uploadDealIds : undefined,
        addToCashflow: uploadAddToCashflow,
        pendingSignature: uploadPendingSignature,
      };
      if (uploadAddToCashflow) {
        if (Number.isFinite(amt) && (amt ?? 0) > 0) {
          payload.monthlyAmountClp = amt;
        }
        payload.currency = uploadCurrency;
        if (uploadPaymentDay) payload.paymentDay = Number(uploadPaymentDay);
        // IPC sólo para CLP. El schema rechaza UF+hasIpc, pero defendemos
        // también en cliente para no enviar payloads inválidos.
        const ipcOn = uploadCurrency === "CLP" && uploadHasIpc;
        payload.hasIpcAdjustment = ipcOn;
        if (ipcOn) {
          payload.ipcAdjustmentMonths = Number(uploadIpcMonths) || 12;
        }
      }

      const res = await fetch(`/api/crm/accounts/${accountId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        // Si el usuario activó la plantilla de factura recurrente, la
        // creamos AHORA (post-contrato OK) para no dejar plantilla
        // huérfana si la creación del contrato falla. Si la plantilla
        // falla, no se anula el contrato — sólo mostramos toast con el
        // error para que el usuario la cree manualmente desde
        // Facturación → Programación.
        let recurringWarning: string | null = null;
        if (recurringEnabled && uploadAddToCashflow && Number.isFinite(amt) && (amt ?? 0) > 0) {
          try {
            const startISO = uploadEffective || todayISO();
            const endISO = uploadExpiration || undefined;
            const dteTypeNum = Number(recurringDteType);
            const dayOfMonthNum =
              recurringFrequency === "monthly" || recurringFrequency === "yearly"
                ? Number(uploadPaymentDay)
                : undefined;
            const dayOfWeekNum =
              recurringFrequency === "weekly" || recurringFrequency === "biweekly"
                ? Number(recurringDayOfWeek)
                : undefined;
            const monthOfYearNum =
              recurringFrequency === "yearly"
                ? Number(recurringMonthOfYear)
                : undefined;
            const isUf = uploadCurrency === "UF";
            // Modelo nuevo: la plantilla emite siempre en CLP y la
            // línea declara su propia moneda (`priceCurrency`). Si el
            // contrato es en UF, la única línea queda marcada UF y el
            // cron la convierte a CLP en cada run usando la política
            // de UF de la plantilla.
            const lineItem = {
              itemName: recurringLineDescription.trim() || `Servicios mensuales — ${accountName}`,
              quantity: 1,
              unit: "mes",
              unitPrice: isUf ? 0 : (amt as number),
              unitPriceUf: isUf ? (amt as number) : undefined,
              priceCurrency: isUf ? "UF" : "CLP",
            };
            // CC: parsing alineado con RecurringTemplateForm (dedupe contra TO).
            const effEmail = recurringEmail.trim();
            const ccEmails = Array.from(
              new Set(
                recurringCcEmailsRaw
                  .split(/[\s,;]+/)
                  .map((s) => s.trim())
                  .filter((e) => e && e !== effEmail),
              ),
            );
            // Referencias: descartar las vacías por seguridad.
            const validRefs = recurringAdditionalRefs
              .filter(
                (r) => r.tipoDocRef.trim() && r.folioRef.trim() && r.fchRef,
              )
              .map((r) => ({
                tipoDocRef: r.tipoDocRef.trim(),
                folioRef: r.folioRef.trim(),
                fchRef: r.fchRef,
                razonRef: "",
              }));
            const recurringPayload: Record<string, unknown> = {
              name: recurringName.trim(),
              isActive: recurringIsActive,
              dteType: dteTypeNum,
              receiverRut: recurringRut.trim(),
              receiverName: recurringReceiverName.trim(),
              receiverEmail: effEmail || null,
              receiverEmailCc: ccEmails,
              receiverGiro: recurringGiro.trim() || null,
              receiverDireccion: recurringAddress.trim() || null,
              receiverComuna: recurringComuna.trim() || null,
              receiverCiudad: recurringCiudad.trim() || null,
              crmAccountId: accountId,
              installationId: uploadInstallationIds[0] || uploadInstallationId || null,
              // Plantilla siempre CLP: la moneda viaja por línea.
              currency: "CLP",
              lines: [lineItem],
              notes: uploadNotes.trim() || null,
              ...(validRefs.length > 0
                ? { additionalReferences: validRefs }
                : {}),
              frequency: recurringFrequency,
              ...(dayOfMonthNum !== undefined ? { dayOfMonth: dayOfMonthNum } : {}),
              ...(dayOfWeekNum !== undefined ? { dayOfWeek: dayOfWeekNum } : {}),
              ...(monthOfYearNum !== undefined ? { monthOfYear: monthOfYearNum } : {}),
              startDate: startISO,
              ...(endISO ? { endDate: endISO } : {}),
              autoSendEmail: recurringAutoSendEmail,
              autoSendProforma: recurringAutoSendProforma,
              autoSendPaymentStatement: recurringAutoSendPaymentStatement,
              ...(recurringAutoSendProforma || recurringAutoSendPaymentStatement
                ? { recipientContactIds: recurringRecipientContactIds }
                : {}),
              ufFixingPolicy: isUf ? recurringUfFixingPolicy : "RUN_DAY",
              periodPolicy: recurringPeriodPolicy,
            };
            const rRes = await fetch("/api/finance/billing/recurring", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(recurringPayload),
            });
            const rJson = await rRes.json();
            if (!rRes.ok || !rJson.success) {
              recurringWarning =
                rJson?.error ||
                "No se pudo crear la plantilla de factura recurrente. Créala manualmente desde Facturación → Programación.";
            }
          } catch {
            recurringWarning =
              "No se pudo crear la plantilla de factura recurrente (error de red). Créala manualmente desde Facturación → Programación.";
          }
        }

        if (recurringWarning) {
          toast.success(
            uploadPendingSignature
              ? "Ingreso agregado al flujo de caja · contrato pendiente"
              : "Contrato subido exitosamente",
          );
          toast.warning(recurringWarning, { duration: 8000 });
        } else if (recurringEnabled && uploadAddToCashflow) {
          toast.success("Contrato + plantilla de factura recurrente creados");
        } else {
          toast.success(
            uploadPendingSignature
              ? "Ingreso agregado al flujo de caja · contrato pendiente"
              : "Contrato subido exitosamente",
          );
        }
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

  // ─── FC por instalación ─────────────────────────────────────────
  const openCfItemDialog = (contract: Contract, item: CfItem | null) => {
    setCfDialog({
      contractId: contract.id,
      contractTitle: contract.title,
      contractEffective: contract.effectiveDate,
      contractExpiration: contract.expirationDate,
      itemId: item?.itemId,
      installationId: item?.installationId,
    });
    setCfInstallId(item?.installationId ?? "");
    if (item) {
      const cur = item.currency === "UF" ? "UF" : "CLP";
      setCfCurrency(cur);
      setCfAmount(formatAmount(item.amountClp, cur));
      setCfHasIpc(!!item.hasIpcAdjustment);
      setCfIpcMonths(String(item.ipcAdjustmentMonths ?? 12));
      // Bloque 5 Fase 3 — campos calendario de cobro
      setCfNickname(item.nickname ?? "");
      setCfEmiteProforma(!!item.emiteProforma);
      setCfDiaEmisionProforma(
        item.diaEmisionProforma != null ? String(item.diaEmisionProforma) : "",
      );
      setCfDiasFacturaDesdeProforma(
        item.diasFacturaDesdeProforma != null
          ? String(item.diasFacturaDesdeProforma)
          : "",
      );
      // Si el item ya tiene proforma activa, ignoramos diaEmisionFactura
      // y mesFacturaRelativo guardados (son derivados — FIX 2 de Fase 3).
      // Esto limpia datos contaminados de versiones previas del form
      // donde el usuario los seteaba manualmente para "compensar" el
      // clampeo a 31. Sin esta limpieza, al recargar un item viejo el
      // state quedaría con valores que nunca se renderizan pero igual
      // se persistirían en el próximo save.
      if (item.emiteProforma) {
        setCfDiaEmisionFactura("");
        setCfMesFacturaRelativo("MISMO_MES");
      } else {
        // Sin proforma: usamos diaEmisionFactura del item, o el
        // dayOfMonth legacy como fallback para items pre-Fase-1.
        setCfDiaEmisionFactura(
          item.diaEmisionFactura != null
            ? String(item.diaEmisionFactura)
            : item.dayOfMonth != null
              ? String(item.dayOfMonth)
              : "5",
        );
        setCfMesFacturaRelativo(
          item.mesFacturaRelativo === "MES_SIGUIENTE"
            ? "MES_SIGUIENTE"
            : "MISMO_MES",
        );
      }
      setCfModoCobro(item.modoCobro === "FACTORING" ? "FACTORING" : "DIRECTO");
      setCfDiasCobroDesdeFactura(
        item.diasCobroDesdeFactura != null
          ? String(item.diasCobroDesdeFactura)
          : "0",
      );
      // Fechas del propio item (puede diferir del contrato).
      setCfStartDate(item.startDate ?? contract.effectiveDate?.slice(0, 10) ?? todayISO());
      setCfEndDate(item.endDate ?? contract.expirationDate?.slice(0, 10) ?? "");
    } else {
      setCfCurrency("CLP");
      setCfAmount("");
      setCfHasIpc(false);
      setCfIpcMonths("12");
      // Defaults Fase 3
      setCfNickname("");
      setCfEmiteProforma(false);
      setCfDiaEmisionProforma("");
      setCfDiasFacturaDesdeProforma("");
      setCfDiaEmisionFactura("5");
      setCfMesFacturaRelativo("MISMO_MES");
      setCfModoCobro("DIRECTO");
      setCfDiasCobroDesdeFactura("0");
      setCfStartDate(contract.effectiveDate?.slice(0, 10) ?? todayISO());
      setCfEndDate(contract.expirationDate?.slice(0, 10) ?? "");
    }
  };

  // Cuando hay proforma, diaEmisionFactura y mesFacturaRelativo son
  // derivados. El backend (proyección) calcula la fecha real usando
  // setUTCDate(diaProf + diasGap), que rola automáticamente al mes
  // siguiente si la suma pasa del último día del mes.
  //
  // Por eso, en este caso NO debemos clampear ni dejar que el usuario
  // elija. Forzamos valores neutros que el backend ignora. (Fase 3 FIX 2.)
  useEffect(() => {
    if (!cfDialog) return;
    if (!cfEmiteProforma) return;
    // Limpieza: cuando hay proforma, no se usa el campo "día emisión
    // factura" ni el "mes factura relativo". Se dejan en valores
    // neutros para no contaminar la persistencia.
    setCfDiaEmisionFactura("");
    setCfMesFacturaRelativo("MISMO_MES");
  }, [
    cfDialog,
    cfEmiteProforma,
    cfDiaEmisionProforma,
    cfDiasFacturaDesdeProforma,
  ]);

  /**
   * Calcula el próximo ciclo de fechas (proforma → factura → cobro) en
   * base a los valores del form. Toma como mes-base el mes actual; el
   * usuario lo lee como "lo que va a pasar la próxima vez".
   *
   * Si los valores son inválidos (ej. usuario aún no escribió día de
   * proforma), devolvemos null y la vista previa se oculta.
   */
  const calcularProximoCiclo = (): {
    proforma: string | null;
    factura: string;
    cobro: string;
  } | null => {
    const hoy = new Date();
    const year = hoy.getUTCFullYear();
    const month = hoy.getUTCMonth();

    let fechaProforma: Date | null = null;
    let fechaFactura: Date;

    if (cfEmiteProforma) {
      const diaPro = Number(cfDiaEmisionProforma);
      const diasGap = Number(cfDiasFacturaDesdeProforma);
      if (!Number.isFinite(diaPro) || diaPro < 1 || diaPro > 31) return null;
      if (!Number.isFinite(diasGap) || diasGap < 0) return null;
      fechaProforma = new Date(Date.UTC(year, month, diaPro));
      fechaFactura = new Date(fechaProforma);
      fechaFactura.setUTCDate(fechaFactura.getUTCDate() + diasGap);
    } else {
      const diaFac = Number(cfDiaEmisionFactura);
      if (!Number.isFinite(diaFac) || diaFac < 1 || diaFac > 31) return null;
      fechaFactura = new Date(Date.UTC(year, month, diaFac));
    }

    // Solo aplicar mesFacturaRelativo cuando NO hay proforma. Con
    // proforma, el rollover ya está implícito en el setUTCDate(diaProf
    // + diasGap) anterior — sumarlo otra vez sería doble salto.
    if (!cfEmiteProforma && cfMesFacturaRelativo === "MES_SIGUIENTE") {
      fechaFactura.setUTCMonth(fechaFactura.getUTCMonth() + 1);
    }

    const diasCobro = Number(cfDiasCobroDesdeFactura);
    if (!Number.isFinite(diasCobro) || diasCobro < 0) return null;
    const fechaCobro = new Date(fechaFactura);
    fechaCobro.setUTCDate(fechaCobro.getUTCDate() + diasCobro);

    const fmt = (d: Date) =>
      d.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });

    return {
      proforma: fechaProforma ? fmt(fechaProforma) : null,
      factura: fmt(fechaFactura),
      cobro: fmt(fechaCobro),
    };
  };

  /**
   * Validación cliente — devuelve string con el primer error encontrado
   * o null si todo OK. Se ejecuta antes del submit para evitar viajes
   * inútiles al backend cuando hay un campo claramente incorrecto.
   */
  const validarCfForm = (): string | null => {
    const amt = parseChileanAmount(cfAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return "El monto mensual debe ser mayor a 0";
    }
    if (cfEmiteProforma) {
      const diaPro = Number(cfDiaEmisionProforma);
      if (!Number.isFinite(diaPro) || diaPro < 1 || diaPro > 31) {
        return "Día de proforma debe estar entre 1 y 31";
      }
      const diasGap = Number(cfDiasFacturaDesdeProforma);
      if (!Number.isFinite(diasGap) || diasGap < 0 || diasGap > 60) {
        return "Días hasta facturar debe estar entre 0 y 60";
      }
    } else {
      const diaFac = Number(cfDiaEmisionFactura);
      if (!Number.isFinite(diaFac) || diaFac < 1 || diaFac > 31) {
        return "Día de emisión factura debe estar entre 1 y 31";
      }
    }
    const diasCobro = Number(cfDiasCobroDesdeFactura);
    if (!Number.isFinite(diasCobro) || diasCobro < 0 || diasCobro > 180) {
      return "Días de cobro debe estar entre 0 y 180";
    }
    if (!cfStartDate) return "Indica la fecha de inicio";
    if (cfEndDate && cfEndDate < cfStartDate) {
      return "La fecha de fin no puede ser anterior al inicio";
    }
    return null;
  };

  const handleCfSave = async () => {
    if (!cfDialog) return;
    const errMsg = validarCfForm();
    if (errMsg) {
      toast.error(errMsg);
      return;
    }
    const amt = parseChileanAmount(cfAmount);
    const diaFac = Number(cfDiaEmisionFactura);
    const diasCobro = Number(cfDiasCobroDesdeFactura);
    setCfSaving(true);
    try {
      const res = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${cfDialog.contractId}/cashflow`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Si el modal se abrió en modo EDITAR (cfDialog.itemId
            // presente), mandamos el id para que el backend haga
            // UPDATE de ese item específico. Sin esto, el backend
            // crea un nuevo item — correcto para "Agregar otra
            // instalación" pero rompía la edición de un item
            // existente cuando había varios items con la misma
            // installationId (Bloque 5 Fase 2).
            ...(cfDialog.itemId && { itemId: cfDialog.itemId }),
            installationId: cfInstallId || null,
            monthlyAmount: amt,
            currency: cfCurrency,
            // Legacy: paymentDay sigue siendo requerido por el schema
            // de upsert. Se deriva del nuevo `diaEmisionFactura`. TODO
            // Fase 5: deprecar paymentDay y leer el dayOfMonth del
            // diaEmisionFactura directamente en la capa de proyección.
            paymentDay: Number.isFinite(diaFac) && diaFac >= -1 && diaFac <= 31
              ? diaFac
              : 5,
            startDate: cfStartDate || todayISO(),
            endDate: cfEndDate || null,
            hasIpcAdjustment: cfCurrency === "CLP" && cfHasIpc,
            ipcAdjustmentMonths:
              cfCurrency === "CLP" && cfHasIpc ? Number(cfIpcMonths) || 12 : null,
            // ── Bloque 5 Fase 3 — calendario de cobro ──
            nickname: cfNickname.trim() ? cfNickname.trim() : null,
            emiteProforma: cfEmiteProforma,
            diaEmisionProforma: cfEmiteProforma
              ? Number(cfDiaEmisionProforma)
              : null,
            diasFacturaDesdeProforma: cfEmiteProforma
              ? Number(cfDiasFacturaDesdeProforma)
              : null,
            // Cuando hay proforma, estos campos son derivados (los
            // calcula el backend a partir de proforma + días). Se
            // guardan como neutros para no contaminar la persistencia.
            diaEmisionFactura: cfEmiteProforma
              ? null
              : Number.isFinite(diaFac)
                ? diaFac
                : null,
            mesFacturaRelativo: cfEmiteProforma
              ? "MISMO_MES"
              : cfMesFacturaRelativo,
            modoCobro: cfModoCobro,
            diasCobroDesdeFactura: Number.isFinite(diasCobro) ? diasCobro : 0,
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        toast.success(cfDialog.itemId ? "FC actualizado" : "Instalación agregada al flujo de caja");
        setCfDialog(null);
        fetchContracts();
        onRefresh?.();
      } else {
        toast.error(data.error || "Error guardando FC");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setCfSaving(false);
    }
  };

  const deleteFcItem = async (contractId: string, itemId: string) => {
    if (!confirm("¿Quitar este ítem del flujo de caja?")) return;
    try {
      const res = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contractId}/cashflow`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        },
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Ítem eliminado del flujo de caja");
        fetchContracts();
        onRefresh?.();
      } else {
        toast.error(data.error || "Error eliminando FC");
      }
    } catch {
      toast.error("Error de conexión");
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
    if (c.status === "expired") return "border-status-danger-border bg-status-danger-soft/40";
    if (c.status === "expiring") return "border-status-warn-border bg-status-warn-soft/40";
    if (c.status === "pending_signature")
      return "border-status-warn-border bg-status-warn-soft/40";
    return "border-border bg-card";
  };

  // Card con accent (warn/danger) NO debe pelear con hover:bg-ds-surface-2.
  // Sin accent → hover gris suave estándar.
  const rowHover = (c: Contract): string => {
    if (
      c.status === "expired" ||
      c.status === "expiring" ||
      c.status === "pending_signature"
    ) {
      return "hover:brightness-105 dark:hover:brightness-110";
    }
    return "hover:bg-ds-surface-2";
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

      {/* Alternativa: agregar el ingreso al flujo de caja sin haber recibido
          aún el PDF firmado. Crea un Document con pdfUrl=null y
          status="pending_signature". */}
      {SHOW_CONTRACT_CASHFLOW && (
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={openPendingSignatureDialog}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <Wallet className="h-3.5 w-3.5" />
            ¿Aún no tienes el contrato firmado? Agregar al flujo de caja como pendiente
          </Button>
        </div>
      )}

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
                  "flex items-start sm:items-center justify-between gap-3 rounded-lg border p-3 transition-colors flex-col sm:flex-row",
                  rowAccent(c),
                  rowHover(c),
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
                    {!c.pdfUrl && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200"
                      >
                        <Paperclip className="h-2.5 w-2.5 mr-0.5" />
                        Sin contrato subido
                      </Badge>
                    )}
                    {SHOW_CONTRACT_CASHFLOW && c.cashflowItems.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-status-ok-soft text-status-ok-fg border-status-ok-fg/30"
                      >
                        <Wallet className="h-2.5 w-2.5 mr-0.5" />
                        {c.cashflowItems.length === 1
                          ? "En FC"
                          : `${c.cashflowItems.length} ítems FC`}
                      </Badge>
                    )}
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
                  {/* ── Flujo de Caja por instalación (Fase 4: oculto — se
                      gestiona desde Programación / Flujo de Caja) ── */}
                  {SHOW_CONTRACT_CASHFLOW && (() => {
                    // Detección de items "huérfanos": si el contrato tiene
                    // items por instalación + items globales (sin installationId),
                    // los globales muy probablemente sean el monto antiguo
                    // (creado al subir el contrato con N instalaciones, donde
                    // se crea un único item con installationId=null). Eso
                    // duplica el monto en el flujo de caja.
                    const hasInstItems = c.cashflowItems.some(
                      (i) => i.installationId,
                    );
                    const hasGlobalItems = c.cashflowItems.some(
                      (i) => !i.installationId,
                    );
                    const hasOrphanGlobals = hasInstItems && hasGlobalItems;
                    return (
                      <div className="mt-2 space-y-1.5">
                        {hasOrphanGlobals && (
                          <div className="flex items-start gap-2 rounded-md bg-status-warn-soft border border-status-warn-border px-2.5 py-2 text-[12px] text-status-warn-fg">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">
                                Posible monto duplicado
                              </p>
                              <p className="text-[12px] opacity-90">
                                Este contrato tiene un ítem global (sin
                                instalación) <strong>más</strong> ítems por
                                instalación. El global probablemente es el monto
                                antiguo y se está sumando dos veces en el flujo
                                de caja. Quítalo o conviértelo a una instalación
                                específica.
                              </p>
                            </div>
                          </div>
                        )}
                        {c.cashflowItems.map((item) => {
                          const instName = item.installationId
                            ? installations.find((i) => i.id === item.installationId)?.name ?? item.installationId.slice(0, 8)
                            : null;
                          const isOrphan = hasOrphanGlobals && !item.installationId;
                          return (
                            <div
                              key={item.itemId}
                              className={cn(
                                "flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 border",
                                isOrphan
                                  ? "bg-status-warn-soft border-status-warn-border"
                                  : "bg-status-ok-soft border-status-ok-border",
                              )}
                            >
                              <Wallet
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  isOrphan ? "text-status-warn-fg" : "text-status-ok-fg",
                                )}
                              />
                              <span
                                className={cn(
                                  "text-[12px] font-mono uppercase tracking-[0.08em]",
                                  isOrphan ? "text-status-warn-fg" : "text-status-ok-fg",
                                )}
                              >
                                {instName ?? (isOrphan ? "Monto antiguo (sin instalación)" : "En flujo de caja")}
                              </span>
                              <span
                                className={cn(
                                  "text-[13px] font-semibold tabular-nums",
                                  isOrphan ? "text-status-warn-fg" : "text-status-ok-fg",
                                )}
                              >
                                {renderAmountWithCurrency(item.amountClp, item.currency)}/mes
                              </span>
                              <span className="text-[12px] text-muted-foreground">
                                · día {item.dayOfMonth === -1 ? "último" : item.dayOfMonth}
                              </span>
                              {item.hasIpcAdjustment && item.currency === "CLP" && (() => {
                                const pending = item.pendingIpcAdjustments?.[0] ?? null;
                                const isPending = !!pending;
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIpcModal({
                                          adjustmentId: pending?.id ?? null,
                                          itemId: item.itemId,
                                          contractTitle: c.title,
                                          dueDate:
                                            pending?.dueDate ?? todayISO(),
                                          currentAmount: item.amountClp,
                                          currency: item.currency,
                                        });
                                      }}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-md text-[12px] font-medium px-2 py-0.5 transition-colors",
                                        isPending
                                          ? "bg-status-warn-soft text-status-warn-fg hover:bg-status-warn-soft/80"
                                          : "border border-ds-border-subtle text-ds-text-2 hover:bg-ds-surface-2",
                                      )}
                                      title={
                                        isPending
                                          ? `Reajuste IPC pendiente · ${pending!.dueDate}`
                                          : "Registrar reajuste IPC manual"
                                      }
                                    >
                                      <TrendingUp className="h-3 w-3" />
                                      {isPending ? "Aplicar IPC" : "Reajuste IPC"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setIpcHistoryOpen(item.itemId)
                                      }
                                      className="inline-flex items-center gap-1 rounded-md text-[11px] text-ds-text-3 hover:text-ds-text-1 px-1 py-0.5 transition-colors"
                                      title="Ver historial de reajustes"
                                    >
                                      <History className="h-3 w-3" />
                                    </button>
                                  </>
                                );
                              })()}
                              <div className="flex gap-1 ml-auto">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[12px]"
                                  onClick={() => openCfItemDialog(c, item)}
                                  title="Editar monto, instalación y día de pago"
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-7 p-0 text-destructive",
                                    isOrphan ? "px-2 text-[12px] w-auto" : "w-7",
                                  )}
                                  onClick={() => deleteFcItem(c.id, item.itemId)}
                                  title="Quitar del flujo de caja"
                                >
                                  <X className="h-3 w-3" />
                                  {isOrphan && <span className="ml-1">Quitar</span>}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        {/* Botón para agregar una instalación más al FC */}
                        <button
                          type="button"
                          onClick={() => openCfItemDialog(c, null)}
                          className="w-full flex items-center gap-2 rounded-md border border-dashed border-status-ok-fg/40 bg-status-ok-soft/10 hover:bg-status-ok-soft/30 hover:border-status-ok-fg/70 px-3 py-1.5 text-left transition-colors"
                        >
                          <PlusCircle className="h-3.5 w-3.5 text-status-ok-fg shrink-0" />
                          <span className="text-[12px] font-medium text-foreground">
                            {c.cashflowItems.length === 0
                              ? "Agregar a flujo de caja"
                              : "Agregar otra instalación al FC"}
                          </span>
                        </button>
                      </div>
                    );
                  })()}
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

          {/* Cotizaciones aceptadas (CpqQuote-derived) que NO tienen un
              Document derivado en `contracts`. Si una cotización ya está
              representada por un Document (matcheo por dealId), su
              cashflow se renderiza dentro del card del Document para no
              duplicar visualmente. */}
          {quoteContracts
            .filter(
              (q) =>
                !q.dealId ||
                !contracts.some((c) => c.deal?.id === q.dealId),
            )
            .map((q) => {
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
                className="flex items-start sm:items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-ds-surface-2 flex-col sm:flex-row"
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
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-status-ok-soft border border-status-ok-border px-2.5 py-1.5">
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
            <DialogTitle>
              {uploadPendingSignature
                ? "Agregar ingreso al flujo de caja"
                : "Subir Contrato PDF"}
            </DialogTitle>
            <DialogDescription>
              {uploadPendingSignature ? (
                <>
                  Proyecta el ingreso mensual antes de tener el PDF firmado. El
                  contrato quedará marcado como{" "}
                  <span className="font-medium">pendiente de firma</span> y podrás
                  adjuntar el documento más adelante.
                </>
              ) : (
                <>
                  Sube un contrato firmado fuera de Opai. Define las fechas para
                  activar las alertas automáticas de vencimiento.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {uploadFile && !uploadPendingSignature && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="break-all flex-1 min-w-0">{uploadFile.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            )}

            {uploadPendingSignature && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs flex items-start gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
                <span className="text-amber-900">
                  Sin archivo adjunto. El contrato quedará como{" "}
                  <span className="font-medium">pendiente de firma</span>; el
                  ingreso al flujo de caja se proyecta desde el día que indiques.
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

            {!uploadPendingSignature && (
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
            )}

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

            {/* ── Vinculación: Negocio + Instalación + Flujo de Caja ──── */}
            <div className="rounded-md border border-border p-3 space-y-3">
              {/* Negocios: el cruce contrato ↔ negocio. Elegir un negocio
                  prellena la fecha de inicio (desde su ficha) y agrega sus
                  instalaciones. El contrato aparecerá en la ficha de cada
                  negocio vinculado. */}
              {deals.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Negocios vinculados
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (puede ser más de uno)
                    </span>
                  </Label>
                  {uploadDealIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {uploadDealIds.map((id) => {
                        const deal = deals.find((d) => d.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded-md bg-status-ok-soft text-status-ok-fg text-xs px-2 py-0.5"
                          >
                            <Briefcase className="h-3 w-3" />
                            {deal?.title ?? id.slice(0, 8)}
                            <button
                              type="button"
                              onClick={() => removeDealFromUpload(id)}
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
                      if (v) addDealToUpload(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="+ Agregar negocio" />
                    </SelectTrigger>
                    <SelectContent>
                      {deals
                        .filter((d) => !uploadDealIds.includes(d.id))
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.title}
                            {d.serviceStartDate
                              ? ` · inicio ${d.serviceStartDate}`
                              : d.stageName
                                ? ` · ${d.stageName}`
                                : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Al elegir un negocio se toma su fecha de inicio y sus
                    instalaciones. El contrato quedará visible desde la ficha de
                    cada negocio.
                  </p>
                </div>
              )}

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

              {uploadPendingSignature ? (
                <div className="pt-1 border-t border-border">
                  <div className="flex items-start gap-2">
                    <Wallet className="h-4 w-4 text-status-ok-fg mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">
                        Ingreso mensual al flujo de caja
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Es el motivo por el que estás creando este contrato sin
                        archivo. Indica monto, moneda y día de pago.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
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
              )}

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

                  {/* Ajuste IPC — sólo aplica a contratos CLP. Los UF se
                      auto-reajustan vía la UF del día de pago, así que
                      activar IPC sobre UF sería doble ajuste. */}
                  {uploadCurrency === "CLP" ? (
                    <div className="space-y-2 pt-3 border-t border-border">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={uploadHasIpc}
                          onCheckedChange={(v) => setUploadHasIpc(v === true)}
                          className="mt-1"
                        />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">
                            Tiene ajuste de IPC
                          </span>
                          <p className="text-xs text-muted-foreground">
                            30 días antes de cada reajuste recibirás un aviso
                            (mail + notificación) para ingresar el % del
                            período. El monto histórico no se toca, el nuevo se
                            proyecta hacia adelante.
                          </p>
                        </div>
                      </label>
                      {uploadHasIpc ? (
                        <div className="space-y-1 pl-6">
                          <Label className="text-xs">
                            Cada cuántos meses se ajusta
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={36}
                            value={uploadIpcMonths}
                            onChange={(e) => setUploadIpcMonths(e.target.value)}
                            className="max-w-[120px]"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Típico: <strong>12</strong> (anual) o{" "}
                            <strong>6</strong> (semestral).
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* ── Plantilla de Factura Recurrente (SII) ───────────────
                Crea una FinanceDteRecurringTemplate vinculada al contrato.
                El cron diario generará un borrador en `nextRunAt`; el
                usuario revisa y emite al SII manualmente. Pre-rellenamos
                con los datos del CrmAccount + el monto/moneda/día del
                bloque de flujo de caja, pero todo es editable. */}
            {uploadAddToCashflow && (
              <div className="rounded-md border border-border p-3 space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={recurringEnabled}
                    onCheckedChange={(v) => {
                      const next = v === true;
                      setRecurringEnabled(next);
                      // Al activarla, completamos el nombre con el título
                      // del contrato si el usuario aún no escribió uno.
                      if (next && !recurringName.trim()) {
                        setRecurringName(
                          uploadTitle.trim() || `Contrato ${accountName}`,
                        );
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-status-info-fg" />
                      Crear plantilla de factura recurrente (SII)
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Cada mes (según frecuencia) se genera un borrador
                      automático en Facturación. Tú lo revisas y emites al
                      SII. La plantilla queda activa hasta el término del
                      contrato.
                    </p>
                  </div>
                </label>

                {recurringEnabled && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    {/* Datos del receptor (pre-fill desde CrmAccount) */}
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Receptor SII
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Tipo de DTE</Label>
                          <Select
                            value={recurringDteType}
                            onValueChange={(v) =>
                              setRecurringDteType(v === "34" ? "34" : "33")
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="33">33 - Factura</SelectItem>
                              <SelectItem value="34">
                                34 - Factura Exenta
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Nombre plantilla</Label>
                          <Input
                            value={recurringName}
                            onChange={(e) => setRecurringName(e.target.value)}
                            placeholder={`Contrato ${accountName}`}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">RUT receptor*</Label>
                          <Input
                            value={recurringRut}
                            onChange={(e) => setRecurringRut(e.target.value)}
                            placeholder="76.123.456-7"
                            className={cn(
                              "font-mono",
                              recurringRut &&
                                !validateRutDVClient(recurringRut) &&
                                "border-destructive",
                            )}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Razón social*</Label>
                          <Input
                            value={recurringReceiverName}
                            onChange={(e) =>
                              setRecurringReceiverName(e.target.value)
                            }
                            placeholder={accountLegalName ?? accountName}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Email receptor</Label>
                          <Input
                            type="email"
                            value={recurringEmail}
                            onChange={(e) => setRecurringEmail(e.target.value)}
                            placeholder="facturas@cliente.cl"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Giro</Label>
                          <Input
                            value={recurringGiro}
                            onChange={(e) => setRecurringGiro(e.target.value)}
                            placeholder="Actividad económica SII"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Dirección</Label>
                        <Input
                          value={recurringAddress}
                          onChange={(e) => setRecurringAddress(e.target.value)}
                          placeholder="Av. Apoquindo 1234"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Comuna</Label>
                          <Input
                            value={recurringComuna}
                            onChange={(e) => setRecurringComuna(e.target.value)}
                            placeholder="Las Condes"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Ciudad</Label>
                          <Input
                            value={recurringCiudad}
                            onChange={(e) => setRecurringCiudad(e.target.value)}
                            placeholder="Santiago"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Emails CC adicionales (opcional)
                        </Label>
                        <Input
                          value={recurringCcEmailsRaw}
                          onChange={(e) =>
                            setRecurringCcEmailsRaw(e.target.value)
                          }
                          placeholder="contador@cliente.cl, finanzas@cliente.cl"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Separá con coma o espacio. Hasta 10 destinatarios.
                          El email receptor (TO) sale del campo de arriba.
                        </p>
                      </div>
                    </div>

                    {/* Referencias (OC, HES, Contrato, etc.) — se copian
                        a cada borrador y aparecen en el bloque
                        <Referencia> del XML SII. */}
                    <div className="space-y-2 pt-3 border-t border-border">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                            Referencias (opcional)
                          </Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            OC, HES, Contrato, etc. Se copian a cada
                            borrador y se imprimen en el PDF.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setRecurringAdditionalRefs((prev) => [
                              ...prev,
                              {
                                tipoDocRef: "801",
                                folioRef: "",
                                fchRef: uploadEffective || todayISO(),
                              },
                            ])
                          }
                          disabled={recurringAdditionalRefs.length >= 30}
                        >
                          <PlusCircle className="h-3.5 w-3.5 mr-1" />
                          Agregar referencia
                        </Button>
                      </div>
                      {recurringAdditionalRefs.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">
                          Sin referencias.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {recurringAdditionalRefs.map((ref, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-12 gap-2 items-start p-2 rounded-md bg-muted/30 border border-border"
                            >
                              <div className="col-span-4">
                                <Label className="text-xs">Tipo</Label>
                                <Select
                                  value={ref.tipoDocRef}
                                  onValueChange={(v) =>
                                    setRecurringAdditionalRefs((prev) =>
                                      prev.map((r, idx) =>
                                        idx === i ? { ...r, tipoDocRef: v } : r,
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger className="text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="801">
                                      801 — Orden de Compra
                                    </SelectItem>
                                    <SelectItem value="802">
                                      802 — Nota de Pedido
                                    </SelectItem>
                                    <SelectItem value="803">
                                      803 — Contrato
                                    </SelectItem>
                                    <SelectItem value="804">
                                      804 — Resolución
                                    </SelectItem>
                                    <SelectItem value="HES">HES</SelectItem>
                                    <SelectItem value="GD">
                                      GD — Guía manual
                                    </SelectItem>
                                    <SelectItem value="52">
                                      52 — Guía electrónica
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-4">
                                <Label className="text-xs">Folio / N°</Label>
                                <Input
                                  value={ref.folioRef}
                                  onChange={(e) =>
                                    setRecurringAdditionalRefs((prev) =>
                                      prev.map((r, idx) =>
                                        idx === i
                                          ? { ...r, folioRef: e.target.value }
                                          : r,
                                      ),
                                    )
                                  }
                                  placeholder="PO-2026-0001"
                                  className="text-xs"
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">Fecha</Label>
                                <Input
                                  type="date"
                                  value={ref.fchRef}
                                  onChange={(e) =>
                                    setRecurringAdditionalRefs((prev) =>
                                      prev.map((r, idx) =>
                                        idx === i
                                          ? { ...r, fchRef: e.target.value }
                                          : r,
                                      ),
                                    )
                                  }
                                  className="text-xs"
                                />
                              </div>
                              <div className="col-span-1 flex items-end justify-end h-full">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setRecurringAdditionalRefs((prev) =>
                                      prev.filter((_, idx) => idx !== i),
                                    )
                                  }
                                  className="h-9 w-9 p-0"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Frecuencia + fechas */}
                    <div className="space-y-2 pt-3 border-t border-border">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Frecuencia
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Cada</Label>
                          <Select
                            value={recurringFrequency}
                            onValueChange={(v) =>
                              setRecurringFrequency(
                                v as
                                  | "monthly"
                                  | "biweekly"
                                  | "weekly"
                                  | "yearly",
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Mes</SelectItem>
                              <SelectItem value="biweekly">
                                2 semanas
                              </SelectItem>
                              <SelectItem value="weekly">Semana</SelectItem>
                              <SelectItem value="yearly">Año</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(recurringFrequency === "monthly" ||
                          recurringFrequency === "yearly") && (
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Día del mes
                            </Label>
                            <Input
                              value={uploadPaymentDay}
                              onChange={(e) =>
                                setUploadPaymentDay(e.target.value)
                              }
                              placeholder="5"
                              className="font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Mismo día que el flujo de caja. <code>-1</code> = último.
                            </p>
                          </div>
                        )}
                        {(recurringFrequency === "weekly" ||
                          recurringFrequency === "biweekly") && (
                          <div className="space-y-1">
                            <Label className="text-xs">Día de la semana</Label>
                            <Select
                              value={recurringDayOfWeek}
                              onValueChange={(v) => setRecurringDayOfWeek(v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">Lunes</SelectItem>
                                <SelectItem value="2">Martes</SelectItem>
                                <SelectItem value="3">Miércoles</SelectItem>
                                <SelectItem value="4">Jueves</SelectItem>
                                <SelectItem value="5">Viernes</SelectItem>
                                <SelectItem value="6">Sábado</SelectItem>
                                <SelectItem value="0">Domingo</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      {recurringFrequency === "yearly" && (
                        <div className="space-y-1">
                          <Label className="text-xs">Mes del año</Label>
                          <Select
                            value={recurringMonthOfYear}
                            onValueChange={(v) => setRecurringMonthOfYear(v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[
                                "Enero",
                                "Febrero",
                                "Marzo",
                                "Abril",
                                "Mayo",
                                "Junio",
                                "Julio",
                                "Agosto",
                                "Septiembre",
                                "Octubre",
                                "Noviembre",
                                "Diciembre",
                              ].map((m, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Las fechas de inicio y término las hereda del contrato
                        ({uploadEffective || "—"}
                        {uploadExpiration ? ` → ${uploadExpiration}` : " (sin término)"}
                        ).
                      </p>
                    </div>

                    {/* Política UF — sólo cuando moneda UF */}
                    {uploadCurrency === "UF" && (
                      <div className="space-y-1 pt-3 border-t border-border">
                        <Label className="text-xs">
                          Política de fijación de UF
                        </Label>
                        <Select
                          value={recurringUfFixingPolicy}
                          onValueChange={(v) =>
                            setRecurringUfFixingPolicy(
                              v as
                                | "RUN_DAY"
                                | "LAST_DAY_PREV_MONTH"
                                | "FIRST_DAY_MONTH"
                                | "LAST_DAY_MONTH",
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LAST_DAY_PREV_MONTH">
                              Último día del mes anterior (convención CL)
                            </SelectItem>
                            <SelectItem value="FIRST_DAY_MONTH">
                              Primer día del mes
                            </SelectItem>
                            <SelectItem value="LAST_DAY_MONTH">
                              Último día del mes
                            </SelectItem>
                            <SelectItem value="RUN_DAY">
                              Día de emisión
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Determina qué UF usa el cron para convertir el
                          monto al emitir el DTE.
                        </p>
                      </div>
                    )}

                    {/* Periodo a facturar (placeholder {{periodo}} en línea) */}
                    <div className="space-y-1 pt-3 border-t border-border">
                      <Label className="text-xs">Período facturado</Label>
                      <Select
                        value={recurringPeriodPolicy}
                        onValueChange={(v) =>
                          setRecurringPeriodPolicy(
                            v as "CURRENT_MONTH" | "PREVIOUS_MONTH" | "NEXT_MONTH",
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CURRENT_MONTH">
                            Mes actual (factura por adelantado)
                          </SelectItem>
                          <SelectItem value="PREVIOUS_MONTH">
                            Mes anterior (factura vencida)
                          </SelectItem>
                          <SelectItem value="NEXT_MONTH">
                            Mes siguiente
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Línea (descripción) */}
                    <div className="space-y-1 pt-3 border-t border-border">
                      <Label className="text-xs">
                        Descripción de la línea
                      </Label>
                      <Input
                        value={recurringLineDescription}
                        onChange={(e) =>
                          setRecurringLineDescription(e.target.value)
                        }
                        placeholder="Servicios mensuales — {{periodo}}"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        <code className="font-mono">{"{{periodo}}"}</code> se
                        reemplaza al emitir (ej.: &quot;Mayo 2026&quot;).
                        El monto sale del flujo de caja:{" "}
                        <strong>
                          {uploadMonthlyAmount || "—"} {uploadCurrency}
                        </strong>
                        .
                      </p>
                    </div>

                    {/* Notificaciones + estado de la plantilla — espejo
                        del módulo Facturación → Programación. */}
                    <div className="space-y-2 pt-3 border-t border-border">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={recurringIsActive}
                          onCheckedChange={(v) =>
                            setRecurringIsActive(v === true)
                          }
                          className="mt-1"
                        />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">
                            Plantilla activa
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Si la pausas, el cron deja de generar
                            borradores pero la plantilla se conserva.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={recurringAutoSendEmail}
                          onCheckedChange={(v) =>
                            setRecurringAutoSendEmail(v === true)
                          }
                          className="mt-1"
                        />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">
                            Auto-enviar el DTE al receptor por email
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Al emitir el DTE al SII desde el borrador
                            recurrente, OPAI envía el PDF/XML al email
                            receptor. Si lo desactivas, el envío queda
                            manual.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={recurringAutoSendProforma}
                          onCheckedChange={(v) =>
                            setRecurringAutoSendProforma(v === true)
                          }
                          className="mt-1"
                        />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">
                            Enviar proforma automáticamente
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Cuando el cron genere el borrador, envía la
                            proforma al receptor antes de emitir al SII.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={recurringAutoSendPaymentStatement}
                          onCheckedChange={(v) =>
                            setRecurringAutoSendPaymentStatement(v === true)
                          }
                          className="mt-1"
                        />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">
                            Enviar estado de pago automáticamente
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Cuando el cron genere el borrador, envía el
                            estado de pago al receptor.
                          </p>
                        </div>
                      </label>

                      {(recurringAutoSendProforma ||
                        recurringAutoSendPaymentStatement) && (
                        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                          <div className="text-[13px] font-medium">
                            Destinatarios de proforma y estado de pago
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Los mismos contactos reciben proforma y estado de
                            pago. Obligatorio si activás cualquiera de los dos
                            envíos automáticos.
                          </p>
                          <ContactsMultiSelect
                            accountId={accountId}
                            value={recurringRecipientContactIds}
                            onChange={setRecurringRecipientContactIds}
                          />
                          {recurringRecipientContactIds.length === 0 && (
                            <div className="text-xs text-destructive">
                              Seleccioná al menos un contacto.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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
              {uploadPendingSignature
                ? "Agregar al flujo de caja"
                : "Subir Contrato"}
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

      {/* ─── Diálogo FC por instalación ──────────────────────────── */}
      <Dialog open={!!cfDialog} onOpenChange={(o) => !o && setCfDialog(null)}>
        <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {cfDialog?.itemId ? "Editar ítem del flujo de caja" : "Agregar al flujo de caja"}
            </DialogTitle>
            <DialogDescription className="break-words">
              {cfDialog?.contractTitle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nickname (opcional, visible en el flujo) */}
            <div className="space-y-2">
              <Label>
                Nombre en el flujo{" "}
                <span className="text-[12px] text-ds-text-3 font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                value={cfNickname}
                onChange={(e) => setCfNickname(e.target.value)}
                placeholder="Ej: Transmat — Ciclo proforma"
                className="h-10 sm:h-9"
                maxLength={100}
              />
              <p className="text-[12px] text-ds-text-3">
                Si lo dejás vacío, se muestra el título del contrato.
              </p>
            </div>

            {/* Instalación */}
            <div className="space-y-2">
              <Label>
                Instalación{" "}
                <span className="text-[12px] text-ds-text-3 font-normal">
                  (opcional — si el contrato es global deja en blanco)
                </span>
              </Label>
              <Select
                value={cfInstallId || "__none__"}
                onValueChange={(v) => setCfInstallId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue placeholder="Sin instalación (global)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin instalación (global)</SelectItem>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Monto + Moneda */}
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2">
                <Label>Monto mensual ({cfCurrency})</Label>
                <Input
                  inputMode="decimal"
                  value={cfAmount}
                  onChange={(e) =>
                    setCfAmount(e.target.value.replace(/[^\d.,]/g, ""))
                  }
                  onBlur={() => {
                    const n = parseChileanAmount(cfAmount);
                    if (Number.isFinite(n) && n > 0) {
                      setCfAmount(formatAmount(n, cfCurrency));
                    }
                  }}
                  placeholder={cfCurrency === "UF" ? "117,50" : "1.500.000"}
                  className="font-mono text-right h-10 sm:h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select
                  value={cfCurrency}
                  onValueChange={(v) => {
                    const next = v === "UF" ? "UF" : "CLP";
                    setCfCurrency(next);
                    const n = parseChileanAmount(cfAmount);
                    if (Number.isFinite(n) && n > 0) {
                      setCfAmount(formatAmount(n, next));
                    }
                  }}
                >
                  <SelectTrigger className="w-24 h-10 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLP">CLP</SelectItem>
                    <SelectItem value="UF">UF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha inicio FC</Label>
                <Input
                  type="date"
                  value={cfStartDate}
                  onChange={(e) => setCfStartDate(e.target.value)}
                  className="h-10 sm:h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Fecha fin FC{" "}
                  <span className="text-[12px] text-ds-text-3 font-normal">(opcional)</span>
                </Label>
                <Input
                  type="date"
                  value={cfEndDate}
                  onChange={(e) => setCfEndDate(e.target.value)}
                  className="h-10 sm:h-9"
                />
              </div>
            </div>

            {/* ── Ciclo de emisión ─────────────────────────────────── */}
            <div className="space-y-3 pt-3 border-t border-ds-border-default">
              <p className="text-[12px] uppercase tracking-wide font-medium text-ds-text-3">
                Ciclo de emisión
              </p>

              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={cfEmiteProforma}
                  onCheckedChange={(v) => setCfEmiteProforma(v === true)}
                  className="mt-1"
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    Emite proforma / estado de pago antes de la factura
                  </span>
                  <p className="text-xs text-ds-text-3">
                    Para contratos que requieren aprobación previa (ej. Transmat,
                    Embajadas). Si está desactivado, se factura directo el día indicado.
                  </p>
                </div>
              </label>

              {cfEmiteProforma && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1">
                    <Label className="text-xs">Día de proforma</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={cfDiaEmisionProforma}
                      onChange={(e) => setCfDiaEmisionProforma(e.target.value)}
                      placeholder="20"
                      className="h-10 sm:h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Días hasta facturar</Label>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={cfDiasFacturaDesdeProforma}
                      onChange={(e) =>
                        setCfDiasFacturaDesdeProforma(e.target.value)
                      }
                      placeholder="4"
                      className="h-10 sm:h-9"
                    />
                  </div>
                </div>
              )}

              {/* Con proforma, el día de emisión factura y el mes
                  relativo son derivados (los calcula el backend desde
                  proforma + días). Los inputs se ocultan y mostramos
                  un bloque informativo. */}
              {!cfEmiteProforma && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Día de emisión factura</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={cfDiaEmisionFactura}
                      onChange={(e) => setCfDiaEmisionFactura(e.target.value)}
                      className="h-10 sm:h-9 max-w-[120px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">La factura se emite en</Label>
                    <Select
                      value={cfMesFacturaRelativo}
                      onValueChange={(v) =>
                        setCfMesFacturaRelativo(
                          v === "MES_SIGUIENTE" ? "MES_SIGUIENTE" : "MISMO_MES",
                        )
                      }
                    >
                      <SelectTrigger className="h-10 sm:h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MISMO_MES">
                          Mismo mes del servicio
                        </SelectItem>
                        <SelectItem value="MES_SIGUIENTE">
                          Mes siguiente
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {cfEmiteProforma && (
                <div className="rounded-md border border-ds-border-default bg-ds-surface-2 px-3 py-2 text-xs text-ds-text-2 space-y-0.5">
                  <p className="font-medium text-ds-text-1">
                    Fecha de factura derivada
                  </p>
                  <p>
                    La factura se emite{" "}
                    <span className="font-mono font-medium">
                      {cfDiasFacturaDesdeProforma || "—"} días
                    </span>{" "}
                    después de la proforma (día{" "}
                    <span className="font-mono">
                      {cfDiaEmisionProforma || "—"}
                    </span>
                    ). Si la suma supera el fin de mes, cae automáticamente
                    en el mes siguiente.
                  </p>
                </div>
              )}
            </div>

            {/* ── Ciclo de cobro ───────────────────────────────────── */}
            <div className="space-y-3 pt-3 border-t border-ds-border-default">
              <p className="text-[12px] uppercase tracking-wide font-medium text-ds-text-3">
                Ciclo de cobro
              </p>

              <div className="space-y-1">
                <Label className="text-xs">Modo de cobro</Label>
                <Select
                  value={cfModoCobro}
                  onValueChange={(v) =>
                    setCfModoCobro(v === "FACTORING" ? "FACTORING" : "DIRECTO")
                  }
                >
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECTO">
                      Directo — cliente paga a mi cuenta
                    </SelectItem>
                    <SelectItem value="FACTORING">
                      Factoring — vendido al factor
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Días entre factura y cobro</Label>
                <Input
                  type="number"
                  min={0}
                  max={180}
                  value={cfDiasCobroDesdeFactura}
                  onChange={(e) => setCfDiasCobroDesdeFactura(e.target.value)}
                  placeholder={cfModoCobro === "FACTORING" ? "3" : "45"}
                  className="h-10 sm:h-9 max-w-[120px]"
                />
                <p className="text-[12px] text-ds-text-3">
                  {cfModoCobro === "FACTORING"
                    ? "Factoring: vendido al factor, el cobro entra acelerado (típicamente 2–5 días). El costo real del factoring se carga al momento de emitir cada factura."
                    : "Directo: el cliente paga a la cuenta. Típicamente 30 / 45 / 60 días."}
                </p>
              </div>
            </div>

            {/* ── Ajuste IPC — sólo CLP ──────────────────────────── */}
            {cfCurrency === "CLP" && (
              <div className="space-y-2 pt-3 border-t border-ds-border-default">
                <p className="text-[12px] uppercase tracking-wide font-medium text-ds-text-3">
                  Reajuste IPC
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={cfHasIpc}
                    onCheckedChange={(v) => setCfHasIpc(v === true)}
                    className="mt-1"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium">Tiene ajuste de IPC</span>
                    <p className="text-xs text-ds-text-3">
                      Te avisamos cuando se acerque la fecha para que ingreses el % real.
                    </p>
                  </div>
                </label>
                {cfHasIpc && (
                  <div className="space-y-3 pl-6">
                    <div className="space-y-1">
                      <Label className="text-xs">Cada cuántos meses se ajusta</Label>
                      <Input
                        type="number"
                        min={1}
                        max={36}
                        value={cfIpcMonths}
                        onChange={(e) => setCfIpcMonths(e.target.value)}
                        className="max-w-[120px] h-10 sm:h-9"
                      />
                      <p className="text-[12px] text-ds-text-3">
                        Típico: <strong>12</strong> (anual), <strong>6</strong> (semestral)
                        o <strong>2</strong> (bimensual). Solo se usa para la
                        alerta de reajuste pendiente — la fecha exacta de cada
                        reajuste la elegís al aplicarlo.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Vista previa del próximo ciclo ─────────────────── */}
            {(() => {
              const preview = calcularProximoCiclo();
              if (!preview) return null;
              return (
                <div className="rounded-lg border border-ds-border-default bg-ds-surface-2 p-3 space-y-1">
                  <p className="text-[12px] uppercase tracking-wide font-medium text-ds-text-3">
                    Vista previa — próximo ciclo
                  </p>
                  {preview.proforma && (
                    <p className="text-sm text-ds-text-2">
                      <span className="font-mono">{preview.proforma}</span>{" "}
                      <span className="text-ds-text-3">→ emite proforma</span>
                    </p>
                  )}
                  <p className="text-sm text-ds-text-2">
                    <span className="font-mono">{preview.factura}</span>{" "}
                    <span className="text-ds-text-3">→ emite factura</span>
                  </p>
                  <p className="text-sm text-ds-text-1 font-medium">
                    <span className="font-mono">{preview.cobro}</span>{" "}
                    <span className="text-ds-text-3">→ cobro en flujo</span>
                    <span className="text-[12px] text-ds-text-3 ml-2">
                      (
                      {cfModoCobro === "FACTORING" ? "factoring" : "directo"},{" "}
                      {Number(cfDiasCobroDesdeFactura) || 0}d)
                    </span>
                  </p>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCfDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={handleCfSave} disabled={cfSaving}>
              {cfSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {cfDialog?.itemId ? "Guardar cambios" : "Agregar al FC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ipcModal ? (
        <ApplyIpcDialog
          open={true}
          onOpenChange={(o) => !o && setIpcModal(null)}
          adjustmentId={ipcModal.adjustmentId}
          itemId={ipcModal.itemId}
          contractTitle={ipcModal.contractTitle}
          dueDate={ipcModal.dueDate}
          currentAmount={ipcModal.currentAmount}
          currency={ipcModal.currency}
          onApplied={() => {
            setIpcModal(null);
            fetchContracts();
            onRefresh?.();
          }}
        />
      ) : null}
      {ipcHistoryOpen ? (
        <IpcHistoryDialog
          itemId={ipcHistoryOpen}
          open={true}
          onOpenChange={(o) => !o && setIpcHistoryOpen(null)}
          onReverted={() => {
            fetchContracts();
            onRefresh?.();
          }}
        />
      ) : null}
    </div>
  );
}
