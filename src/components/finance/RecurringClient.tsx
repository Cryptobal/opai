"use client";

/**
 * RecurringClient — gestión de plantillas recurrentes que generan
 * borradores de DTE. Vive embebido en la pestaña "Programación" del
 * módulo Facturación.
 *
 * Diseño alineado con DTE Emitidos / Recibidos:
 *   - Toolbar: buscador amplio + filtro de estado en chips + sort.
 *   - Listado mobile-first (cards Surface) hasta `lg`; tabla DS en desktop.
 *   - Acciones por fila concentradas en un MobileActionSheet en mobile;
 *     en desktop, icon-buttons compactos + dropdown de acciones.
 *
 * Fechas: usamos `formatCalendarDateDisplay` con TZ=UTC para que un
 * `nextRunAt` almacenado como medianoche UTC se renderice como el día
 * correcto en cualquier TZ del cliente (antes el render local en Chile
 * desplazaba un día hacia atrás: ej. día 15 → "14 abr").
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { es } from "date-fns/locale";
import {
  Loader2,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Plus,
  Pencil,
  Search,
  X,
  Building2,
  MapPin,
  FileText,
  ArrowUpDown,
  MoreHorizontal,
  Link2,
  Mail,
  Receipt,
  ClipboardList,
  Copy,
  AlertTriangle,
  SendHorizonal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  DataTable,
  EmptyState,
  Surface,
  Tag,
  type DataTableColumn,
} from "@/components/opai-ds";
import { DocumentTag } from "@/components/finance/dtes";
import { cn } from "@/lib/utils";
import { formatCalendarDateDisplay } from "@/lib/fx-date";
import {
  MobileActionSheet,
  MobileFAB,
  type MobileActionSheetItem,
} from "@/components/finance/mobile";
import { RecurringTemplateForm } from "./RecurringTemplateForm";
import {
  BillingDocSendModal,
  type BillingDocVariant as BillingDocVariantModal,
} from "@/components/finance/billing-doc-send/BillingDocSendModal";

const FREQ_LABELS: Record<string, string> = {
  monthly: "Mensual",
  biweekly: "Quincenal",
  weekly: "Semanal",
  yearly: "Anual",
};

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export type RecurringTemplateRow = {
  id: string;
  name: string;
  isActive: boolean;
  dteType: number;
  receiverName: string;
  receiverRut: string;
  currency: string;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  ufFixingPolicy?: string;
  ufFixingDay?: number | null;
  /**
   * Referencias adicionales que el cron embebe en el DTE generado (mismo
   * shape que `FinanceDte.additionalReferences`). En la vista lista nos
   * basta con saber si hay y cuántas; el detalle se edita en el form.
   */
  additionalReferences?: Array<{
    tipoDocRef?: string;
    folioRef?: string;
    fchRef?: string;
    razonRef?: string;
  }> | null;
  /** Envío automático del PDF/XML al cliente al emitir. */
  autoSendEmail?: boolean;
  /** Envío automático de Proforma (recurrentes que actúan como cobranza). */
  autoSendProforma?: boolean;
  /** Envío automático del Estado de Pago. */
  autoSendPaymentStatement?: boolean;
  /**
   * Errores del último run recurrente, si al menos un auto-envío falló
   * (autoSendIssues del FinanceDteRecurringRun). Null si todo fue OK.
   * Shape: Array<{ variant: string; error: string; threw: boolean }>
   */
  lastRunIssues?: Array<{ variant: string; error: string; threw: boolean }> | null;
  /** ID del DTE generado en el último run (para abrir BillingDocSendModal). */
  lastRunDteId?: string | null;
  /** Cliente CRM asociado (enriquecido en GET, null si es manual). */
  crmAccount?: {
    id: string;
    name: string;
    legalName: string | null;
    rut: string | null;
  } | null;
  /** Instalación asociada (enriquecida en GET). */
  installation?: {
    id: string;
    name: string;
    commune: string | null;
  } | null;
};

const UF_POLICY_LABEL: Record<string, string> = {
  RUN_DAY: "UF: día de ejecución",
  LAST_DAY_PREV_MONTH: "UF: fin del mes anterior",
  FIRST_DAY_MONTH: "UF: 1° del mes",
  LAST_DAY_MONTH: "UF: fin del mes",
  CUSTOM_DAY: "UF: día específico",
};

function formatFrequency(t: RecurringTemplateRow): string {
  const base = FREQ_LABELS[t.frequency] ?? t.frequency;
  if (t.frequency === "monthly") {
    if (t.dayOfMonth === -1) return `${base} · último día`;
    return `${base} · día ${t.dayOfMonth ?? 1}`;
  }
  if (t.frequency === "weekly" || t.frequency === "biweekly") {
    return `${base} · ${DOW_LABELS[t.dayOfWeek ?? 1]}`;
  }
  if (t.frequency === "yearly") {
    return `${base} · ${t.monthOfYear ?? 1}/${t.dayOfMonth ?? 1}`;
  }
  return base;
}

function ufPolicyText(t: RecurringTemplateRow): string | null {
  if (t.currency !== "UF" || !t.ufFixingPolicy) return null;
  if (t.ufFixingPolicy === "CUSTOM_DAY") return `UF: día ${t.ufFixingDay ?? "?"}`;
  return UF_POLICY_LABEL[t.ufFixingPolicy] ?? t.ufFixingPolicy;
}

/**
 * Render UTC-aware de `nextRunAt` / `lastRunAt`. Las fechas vienen
 * persistidas como medianoche UTC; renderizarlas con la TZ del cliente
 * (Chile = UTC-3/-4) desplazaría el día hacia atrás. `formatCalendarDateDisplay`
 * fuerza UTC.
 */
function formatRunDate(iso: string | null): string {
  if (!iso) return "—";
  return formatCalendarDateDisplay(iso, "dd MMM yyyy", es);
}

interface Props {
  initialTemplates?: RecurringTemplateRow[];
  canManage: boolean;
  /** Callback opcional cuando la lista cambia (para sincronizar parents). */
  onChange?: (next: RecurringTemplateRow[]) => void;
}

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED";
type SortKey = "next_asc" | "next_desc" | "name_asc" | "last_desc";

type AutoSendIssue = { variant: string; error: string; threw: boolean };

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "next_asc", label: "Próxima ejecución ↑" },
  { value: "next_desc", label: "Próxima ejecución ↓" },
  { value: "name_asc", label: "Nombre A-Z" },
  { value: "last_desc", label: "Última ejecución" },
];

function sortTemplates(
  rows: RecurringTemplateRow[],
  sort: SortKey,
): RecurringTemplateRow[] {
  const sorted = [...rows];
  const cmpDateAsc = (a: string | null, b: string | null) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : 1;
  };
  switch (sort) {
    case "next_asc":
      return sorted.sort((a, b) => cmpDateAsc(a.nextRunAt, b.nextRunAt));
    case "next_desc":
      return sorted.sort((a, b) => -cmpDateAsc(a.nextRunAt, b.nextRunAt));
    case "name_asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name, "es"));
    case "last_desc":
      return sorted.sort((a, b) => -cmpDateAsc(a.lastRunAt, b.lastRunAt));
    default:
      return sorted;
  }
}

export function RecurringClient({
  initialTemplates = [],
  canManage,
  onChange,
}: Props) {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<RecurringTemplateRow[]>(initialTemplates);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [reloading, setReloading] = React.useState(false);
  // Modal: null = cerrado, "" = crear nueva, "<id>" = editar existente.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  // Bottom-sheet de acciones por fila (mobile).
  const [actionFor, setActionFor] = React.useState<string | null>(null);

  // ── Filtros + buscador ──
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [sort, setSort] = React.useState<SortKey>("next_asc");
  const [autoSendErrorsOnly, setAutoSendErrorsOnly] = React.useState(false);

  // ── Modal de detalle de errores de auto-send ──
  const [issueDetailFor, setIssueDetailFor] = React.useState<{
    templateName: string;
    receiverName: string;
    issues: AutoSendIssue[];
    dteId: string | null;
  } | null>(null);

  // ── Modal de reenvío manual (BillingDocSendModal) ──
  const [resendModal, setResendModal] = React.useState<{
    dteId: string;
    variant: BillingDocVariantModal;
    receiverName: string;
  } | null>(null);

  const reload = React.useCallback(async () => {
    setReloading(true);
    try {
      const res = await fetch("/api/finance/billing/recurring");
      const j = await res.json();
      if (j?.success) {
        const next = (j.data?.templates ?? []) as RecurringTemplateRow[];
        setTemplates(next);
        onChange?.(next);
      }
    } finally {
      setReloading(false);
    }
  }, [onChange]);

  React.useEffect(() => {
    // Refetch on mount para mantener la lista al día (initialTemplates
    // puede venir staleada del SSR del padre).
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRunNow = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/billing/recurring/${id}/run-now`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al generar borrador");
      const status = j.data?.status;
      if (status === "success") {
        const issues = j.data?.autoSendIssues as AutoSendIssue[] | undefined;
        if (issues && issues.length > 0) {
          toast.warning(
            `Borrador generado, pero ${issues.length} auto-envío${issues.length === 1 ? "" : "s"} fallaron. Reenviá manualmente desde el badge ⚠️ de la plantilla.`,
          );
        } else {
          toast.success(
            "Borrador generado desde la plantilla. Lo encontrás en \"DTEs Emitidos\" con el badge \"Borrador\".",
          );
        }
      } else if (status === "failed") {
        toast.error(j.data?.error || "Falla al generar borrador");
      } else {
        toast.info(`Saltado (${status})`);
      }
      await reload();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (t: RecurringTemplateRow) => {
    setBusyId(t.id);
    try {
      // Necesitamos el shape full para PATCH (validación strict en backend).
      const fullRes = await fetch(`/api/finance/billing/recurring/${t.id}`);
      const fullJson = await fullRes.json();
      if (!fullRes.ok) throw new Error(fullJson.error || "Error");
      const full = fullJson.data;
      const res = await fetch(`/api/finance/billing/recurring/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...full,
          isActive: !t.isActive,
          startDate: full.startDate.split("T")[0],
          endDate: full.endDate ? full.endDate.split("T")[0] : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Error al actualizar");
      }
      toast.success(t.isActive ? "Plantilla pausada" : "Plantilla activada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicateTemplate = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/billing/recurring/${id}/duplicate`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al duplicar plantilla");
      const newId = j.data?.id as string | undefined;
      if (!newId) throw new Error("Respuesta inválida");
      toast.success(
        "Plantilla duplicada en pausa. Revisá datos y activala si corresponde.",
      );
      await reload();
      setEditingId(newId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla? Las corridas históricas se mantienen.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/billing/recurring/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Error al eliminar");
      }
      toast.success("Plantilla eliminada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const totalActive = templates.filter((t) => t.isActive).length;

  // ── Filtrado + ordenamiento en cliente ──
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = templates.filter((t) => {
      if (statusFilter === "ACTIVE" && !t.isActive) return false;
      if (statusFilter === "PAUSED" && t.isActive) return false;
      if (autoSendErrorsOnly) {
        const hasIssues =
          Array.isArray(t.lastRunIssues) && t.lastRunIssues.length > 0;
        if (!hasIssues) return false;
      }
      if (!q) return true;
      const hay =
        t.name.toLowerCase().includes(q) ||
        t.receiverName.toLowerCase().includes(q) ||
        (t.receiverRut ?? "").toLowerCase().includes(q) ||
        (t.crmAccount?.name ?? "").toLowerCase().includes(q) ||
        (t.crmAccount?.legalName ?? "").toLowerCase().includes(q) ||
        (t.crmAccount?.rut ?? "").toLowerCase().includes(q) ||
        (t.installation?.name ?? "").toLowerCase().includes(q) ||
        (t.installation?.commune ?? "").toLowerCase().includes(q);
      return hay;
    });
    return sortTemplates(rows, sort);
  }, [templates, search, statusFilter, sort, autoSendErrorsOnly]);

  const hasActiveFilters =
    !!search.trim() || statusFilter !== "ALL" || autoSendErrorsOnly;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setAutoSendErrorsOnly(false);
  };

  const actionRow = actionFor ? templates.find((r) => r.id === actionFor) : null;

  const buildActionItems = (t: RecurringTemplateRow): MobileActionSheetItem[] => {
    if (!canManage) return [];
    const isBusy = busyId === t.id;
    return [
      {
        key: "run-now",
        label: "Generar borrador",
        description: t.isActive
          ? "Crea un borrador a partir de la plantilla"
          : "Activá la plantilla primero",
        icon: <FileText className="h-4 w-4" />,
        disabled: !t.isActive || isBusy,
        onSelect: () => handleRunNow(t.id),
      },
      {
        key: "duplicate",
        label: "Duplicar plantilla",
        description: "Copia la configuración; queda pausada",
        icon: <Copy className="h-4 w-4" />,
        disabled: isBusy,
        onSelect: () => handleDuplicateTemplate(t.id),
      },
      {
        key: "edit",
        label: "Editar plantilla",
        icon: <Pencil className="h-4 w-4" />,
        disabled: isBusy,
        onSelect: () => setEditingId(t.id),
      },
      {
        key: "toggle",
        label: t.isActive ? "Pausar" : "Activar",
        icon: t.isActive ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        ),
        disabled: isBusy,
        onSelect: () => handleToggleActive(t),
      },
      {
        key: "delete",
        label: "Eliminar plantilla",
        tone: "danger",
        icon: <Trash2 className="h-4 w-4" />,
        disabled: isBusy,
        onSelect: () => handleDelete(t.id),
      },
    ];
  };

  const columns: DataTableColumn<RecurringTemplateRow>[] = [
    {
      id: "name",
      header: "Plantilla",
      width: "w-[224px]",
      cell: (t) => (
        <div className="min-w-0">
          <div className="text-sm font-medium text-ds-text-1 truncate">
            {t.name}
          </div>
          {t.receiverName && (
            <div className="text-xs text-ds-text-3 truncate">
              {t.receiverName}
            </div>
          )}
          {t.receiverRut && (
            <div className="text-xs text-ds-text-4 font-mono tabular-nums truncate">
              {t.receiverRut}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "client",
      header: "Cliente / Instalación",
      width: "w-[200px]",
      cell: (t) => (
        <div className="min-w-0 text-xs space-y-0.5">
          {t.crmAccount ? (
            <div
              className="flex items-center gap-1 min-w-0"
              title={t.crmAccount.legalName ?? t.crmAccount.name}
            >
              <Building2 className="h-3 w-3 shrink-0 text-ds-text-4" />
              <span className="truncate font-medium">
                {t.crmAccount.legalName ?? t.crmAccount.name}
              </span>
            </div>
          ) : (
            <span className="text-ds-text-4 italic">Manual</span>
          )}
          {t.installation && (
            <div
              className="flex items-center gap-1 min-w-0 text-ds-text-3"
              title={t.installation.name}
            >
              <MapPin className="h-3 w-3 shrink-0 text-ds-text-4" />
              <span className="truncate">
                {t.installation.name}
                {t.installation.commune ? ` · ${t.installation.commune}` : ""}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "type",
      header: "Tipo",
      width: "w-[136px]",
      cell: (t) => {
        const ufText = ufPolicyText(t);
        return (
          <div className="min-w-0 space-y-0.5">
            <DocumentTag dteType={t.dteType} />
            <div
              className="text-xs text-ds-text-4 truncate"
              title={ufText ?? undefined}
            >
              {t.currency}
              {ufText ? ` · ${ufText.replace(/^UF: /, "")}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      id: "frequency",
      header: "Frecuencia",
      width: "w-[144px]",
      cell: (t) => (
        <span className="text-xs">{formatFrequency(t)}</span>
      ),
    },
    {
      id: "nextRun",
      header: "Próxima",
      width: "w-[112px]",
      cell: (t) => (
        <span
          className={cn(
            "text-xs font-mono tabular-nums",
            !t.nextRunAt && "text-ds-text-4",
          )}
        >
          {formatRunDate(t.nextRunAt)}
        </span>
      ),
    },
    {
      id: "lastRun",
      header: "Última",
      width: "w-[112px]",
      cell: (t) => (
        <span
          className={cn(
            "text-xs font-mono tabular-nums",
            !t.lastRunAt && "text-ds-text-4",
          )}
        >
          {formatRunDate(t.lastRunAt)}
        </span>
      ),
    },
    {
      // Indica si la plantilla tiene referencias DTE adicionales — útil
      // cuando el contrato exige citar OC, HES o folios previos.
      id: "refs",
      header: "Refs.",
      align: "center",
      width: "w-[72px]",
      cell: (t) => {
        const refs = Array.isArray(t.additionalReferences)
          ? t.additionalReferences
          : [];
        const count = refs.length;
        if (count === 0) {
          return <span className="text-xs text-ds-text-4">—</span>;
        }
        const summary = refs
          .slice(0, 3)
          .map((r) => {
            const folio = r.folioRef?.trim();
            const tipo = r.tipoDocRef?.trim();
            return [tipo, folio ? `#${folio}` : null]
              .filter(Boolean)
              .join(" ");
          })
          .filter((s) => s.length > 0)
          .join(" · ");
        return (
          <span
            className="inline-flex items-center gap-1 text-xs text-ds-text-2"
            title={summary || `${count} referencia${count === 1 ? "" : "s"}`}
          >
            <Link2 className="h-3 w-3 text-ds-text-4" />
            <span className="font-mono tabular-nums">{count}</span>
          </span>
        );
      },
    },
    {
      // Envíos automáticos al emitir el borrador / proforma / estado de
      // pago. Iconos en colores ds para que se escanee a primera vista
      // qué plantillas tienen cada flag activo.
      id: "sends",
      header: "Envíos",
      align: "center",
      width: "w-[104px]",
      cell: (t) => {
        const flags: { key: string; icon: React.ReactNode; label: string; on: boolean }[] = [
          {
            key: "email",
            icon: <Mail className="h-3.5 w-3.5" />,
            label: "Email automático del DTE",
            on: !!t.autoSendEmail,
          },
          {
            key: "proforma",
            icon: <Receipt className="h-3.5 w-3.5" />,
            label: "Envío automático de Proforma",
            on: !!t.autoSendProforma,
          },
          {
            key: "epago",
            icon: <ClipboardList className="h-3.5 w-3.5" />,
            label: "Envío automático de Estado de Pago",
            on: !!t.autoSendPaymentStatement,
          },
        ];
        const hasAny = flags.some((f) => f.on);
        if (!hasAny) {
          return <span className="text-xs text-ds-text-4">—</span>;
        }
        return (
          <div className="flex items-center justify-center gap-1">
            {flags.map((f) =>
              f.on ? (
                <span
                  key={f.key}
                  title={f.label}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-tint-violet-fg bg-tint-violet-fg/10"
                >
                  {f.icon}
                </span>
              ) : null,
            )}
          </div>
        );
      },
    },
    {
      id: "autoSendStatus",
      header: "Auto-envío",
      align: "center",
      width: "w-[96px]",
      cell: (t) => {
        const issues = Array.isArray(t.lastRunIssues) && t.lastRunIssues.length > 0
          ? t.lastRunIssues
          : null;
        if (!issues) {
          return <span className="text-xs text-ds-text-4">—</span>;
        }
        return (
          <button
            type="button"
            title={`${issues.length} error${issues.length === 1 ? "" : "es"} de auto-envío. Click para ver detalle.`}
            onClick={(e) => {
              e.stopPropagation();
              setIssueDetailFor({
                templateName: t.name,
                receiverName: t.receiverName,
                issues,
                dteId: t.lastRunDteId ?? null,
              });
            }}
            className="inline-flex items-center gap-1 px-1.5 h-6 rounded-md text-xs font-medium bg-status-warn-soft text-status-warn-fg border border-status-warn-border hover:bg-status-warn-soft/80 transition-colors"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{issues.length} error{issues.length === 1 ? "" : "es"}</span>
          </button>
        );
      },
    },
    {
      id: "runCount",
      header: "Corridas",
      align: "right",
      width: "w-[80px]",
      cell: (t) => (
        <span className="text-xs font-mono tabular-nums">{t.runCount}</span>
      ),
    },
    {
      id: "status",
      header: "Estado",
      width: "w-[88px]",
      cell: (t) =>
        t.isActive ? (
          <Tag variant="ok" size="sm" dot>
            Activa
          </Tag>
        ) : (
          <Tag variant="neutral" size="sm" dot>
            Pausada
          </Tag>
        ),
    },
    {
      id: "_actions",
      header: "",
      align: "right",
      width: "w-[152px]",
      cell: (t) => {
        if (!canManage) return null;
        return (
          <div className="flex justify-end items-center gap-0.5">
            <button
              type="button"
              aria-label="Generar borrador ahora"
              title={
                t.isActive
                  ? "Genera un borrador con los datos de la plantilla"
                  : "Activá la plantilla para generar borradores"
              }
              onClick={(e) => {
                e.stopPropagation();
                handleRunNow(t.id);
              }}
              disabled={busyId === t.id || !t.isActive}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              {busyId === t.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              aria-label="Duplicar plantilla"
              title="Duplicar plantilla (queda pausada)"
              onClick={(e) => {
                e.stopPropagation();
                handleDuplicateTemplate(t.id);
              }}
              disabled={busyId === t.id}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40 transition-colors"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Editar plantilla"
              title="Editar plantilla"
              onClick={(e) => {
                e.stopPropagation();
                setEditingId(t.id);
              }}
              disabled={busyId === t.id}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40 transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t.isActive ? "Pausar plantilla" : "Activar plantilla"}
              title={t.isActive ? "Pausar" : "Activar"}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleActive(t);
              }}
              disabled={busyId === t.id}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40 transition-colors"
            >
              {t.isActive ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              aria-label="Eliminar plantilla"
              title="Eliminar"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(t.id);
              }}
              disabled={busyId === t.id}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-status-danger-fg/80 hover:bg-status-danger-soft hover:text-status-danger-fg disabled:opacity-40 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 pb-24 lg:pb-4">
      {/* Toolbar: search (flex-1), filtros como chips, sort y refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cliente, RUT o instalación…"
            className="pl-10 pr-9 h-10"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-ds-text-3 hover:bg-ds-surface-2 transition-colors"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Sort (desktop). En mobile el orden por "Próxima" es el default
            y rara vez se cambia, así que ocultamos para reducir clutter. */}
        <div className="hidden md:block">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-48 h-10">
              <span className="inline-flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5 text-ds-text-4" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={reload}
          disabled={reloading}
          className="h-10"
        >
          {reloading ? (
            <Loader2 className="size-4 animate-spin md:mr-1.5" />
          ) : (
            <RefreshCw className="size-4 md:mr-1.5" />
          )}
          <span className="hidden md:inline">Actualizar</span>
        </Button>

        {canManage && (
          <Button
            size="sm"
            onClick={() => setEditingId("")}
            className="h-10 hidden lg:inline-flex"
          >
            <Plus className="size-4 mr-1.5" />
            Nueva plantilla
          </Button>
        )}
      </div>

      {/* Filtro de estado en chips — patrón equivalente al "Pago:" de DTEs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-mono uppercase tracking-wide text-ds-text-4 mr-1">
          Estado:
        </span>
        {(
          [
            { value: "ALL", label: "Todas", tone: "neutral" },
            { value: "ACTIVE", label: "Activas", tone: "ok" },
            { value: "PAUSED", label: "Pausadas", tone: "neutral" },
          ] as const
        ).map((opt) => {
          const active = statusFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value as StatusFilter)}
              className={cn(
                "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
                active
                  ? opt.tone === "ok"
                    ? "bg-status-ok-soft border-status-ok-border text-status-ok-fg"
                    : "bg-ds-surface-3 border-ds-border-default text-ds-text-1"
                  : "bg-ds-surface-2 border-ds-border-default text-ds-text-3 hover:bg-ds-surface-3",
              )}
            >
              {opt.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAutoSendErrorsOnly((v) => !v)}
          className={cn(
            "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors inline-flex items-center gap-1",
            autoSendErrorsOnly
              ? "bg-status-warn-soft border-status-warn-border text-status-warn-fg"
              : "bg-ds-surface-2 border-ds-border-default text-ds-text-3 hover:bg-ds-surface-3",
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          Con errores de auto-envío
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-7 px-2.5 rounded-full border border-ds-border-subtle text-xs text-ds-text-4 hover:bg-ds-surface-2 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-ds-text-3">
        <span>
          {templates.length === 0
            ? "Aún no hay plantillas"
            : `${totalActive} activa${totalActive === 1 ? "" : "s"} · ${templates.length} total${templates.length === 1 ? "" : "es"}${
                hasActiveFilters
                  ? ` · ${filtered.length} mostrad${filtered.length === 1 ? "a" : "as"}`
                  : ""
              }`}
        </span>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay plantillas recurrentes"
          description="Creá una para que el cron diario genere borradores automáticamente."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setEditingId("")}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nueva plantilla
              </Button>
            ) : undefined
          }
          tone="neutral"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin coincidencias"
          description="Ninguna plantilla coincide con los filtros actuales."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          }
          tone="neutral"
        />
      ) : (
        <>
          {/* Mobile + iPad: cards (hasta lg). Tabla aplastada en iPad
              era el problema principal — mismo breakpoint que DTEs. */}
          <ul className="lg:hidden space-y-2 ds-list-cascade">
            {filtered.map((t) => {
              const ufText = ufPolicyText(t);
              const isBusy = busyId === t.id;
              return (
                <li key={t.id}>
                  <Surface
                    elevation={1}
                    padding="sm"
                    tappable
                    onClick={() => canManage && setEditingId(t.id)}
                    className="space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ds-text-1 truncate">
                          {t.name}
                        </div>
                        <div className="text-xs text-ds-text-3 truncate">
                          {t.receiverName}
                          {t.receiverRut ? ` · ${t.receiverRut}` : ""}
                        </div>
                        {(t.crmAccount || t.installation) && (
                          <div className="mt-1 flex flex-col gap-0.5 text-xs text-ds-text-3">
                            {t.crmAccount && (
                              <span className="inline-flex items-center gap-1 min-w-0">
                                <Building2 className="h-3 w-3 shrink-0 text-ds-text-4" />
                                <span className="truncate">
                                  {t.crmAccount.legalName ?? t.crmAccount.name}
                                </span>
                              </span>
                            )}
                            {t.installation && (
                              <span className="inline-flex items-center gap-1 min-w-0">
                                <MapPin className="h-3 w-3 shrink-0 text-ds-text-4" />
                                <span className="truncate">
                                  {t.installation.name}
                                  {t.installation.commune
                                    ? ` · ${t.installation.commune}`
                                    : ""}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <DocumentTag dteType={t.dteType} />
                          <span className="text-xs text-ds-text-4">
                            {t.currency}
                            {ufText ? ` · ${ufText}` : ""}
                          </span>
                        </div>
                      </div>
                      {t.isActive ? (
                        <Tag variant="ok" size="sm" dot>
                          Activa
                        </Tag>
                      ) : (
                        <Tag variant="neutral" size="sm" dot>
                          Pausada
                        </Tag>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="block text-xs font-mono uppercase tracking-[0.08em] text-ds-text-4">
                          Frecuencia
                        </span>
                        <span className="text-ds-text-1">{formatFrequency(t)}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-mono uppercase tracking-[0.08em] text-ds-text-4">
                          Próxima
                        </span>
                        <span className="font-mono tabular-nums text-ds-text-1">
                          {formatRunDate(t.nextRunAt)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs font-mono uppercase tracking-[0.08em] text-ds-text-4">
                          Última
                        </span>
                        <span className="font-mono tabular-nums text-ds-text-1">
                          {formatRunDate(t.lastRunAt)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs font-mono uppercase tracking-[0.08em] text-ds-text-4">
                          Corridas
                        </span>
                        <span className="font-mono tabular-nums text-ds-text-1">
                          {t.runCount}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const refs = Array.isArray(t.additionalReferences)
                        ? t.additionalReferences
                        : [];
                      const sends = [
                        t.autoSendEmail && { icon: <Mail className="h-3 w-3" />, label: "Email" },
                        t.autoSendProforma && {
                          icon: <Receipt className="h-3 w-3" />,
                          label: "Proforma",
                        },
                        t.autoSendPaymentStatement && {
                          icon: <ClipboardList className="h-3 w-3" />,
                          label: "Estado de pago",
                        },
                      ].filter(Boolean) as { icon: React.ReactNode; label: string }[];
                      const issues =
                        Array.isArray(t.lastRunIssues) && t.lastRunIssues.length > 0
                          ? t.lastRunIssues
                          : null;
                      if (refs.length === 0 && sends.length === 0 && !issues) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {refs.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded bg-ds-surface-3 text-ds-text-2">
                              <Link2 className="h-3 w-3 text-ds-text-4" />
                              <span className="font-mono tabular-nums">
                                {refs.length}
                              </span>
                              <span className="text-ds-text-3">
                                referencia{refs.length === 1 ? "" : "s"}
                              </span>
                            </span>
                          )}
                          {sends.map((s) => (
                            <span
                              key={s.label}
                              className="inline-flex items-center gap-1 px-1.5 h-5 rounded bg-tint-violet-fg/10 text-tint-violet-fg"
                            >
                              {s.icon}
                              {s.label}
                            </span>
                          ))}
                          {issues && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIssueDetailFor({
                                  templateName: t.name,
                                  receiverName: t.receiverName,
                                  issues,
                                  dteId: t.lastRunDteId ?? null,
                                });
                              }}
                              className="inline-flex items-center gap-1 px-1.5 h-5 rounded bg-status-warn-soft text-status-warn-fg border border-status-warn-border text-xs font-medium"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              ⚠️ {issues.length} error{issues.length === 1 ? "" : "es"} auto-envío
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {canManage && (
                      <div
                        className="flex gap-1 pt-2 border-t border-ds-border-subtle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRunNow(t.id)}
                          disabled={isBusy || !t.isActive}
                          className="flex-1 justify-center h-11"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Generar borrador
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Más acciones"
                          onClick={() => setActionFor(t.id)}
                          className="h-11 w-11 justify-center"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </Surface>
                </li>
              );
            })}
          </ul>

          {/* Desktop: tabla DS */}
          <div className="hidden lg:block">
            <DataTable<RecurringTemplateRow>
              columns={columns}
              rows={filtered}
              layout="fixed"
              rowKey={(t) => t.id}
              onRowClick={
                canManage ? (t) => setEditingId(t.id) : undefined
              }
              empty={
                <EmptyState
                  icon={FileText}
                  title="Sin plantillas"
                  compact
                />
              }
            />
          </div>
        </>
      )}

      {/* FAB mobile para crear plantilla. Solo bajo lg para que en desktop
          quede el botón inline; en mobile reemplaza al CTA del header. */}
      {canManage && (
        <MobileFAB
          icon={<Plus className="h-5 w-5" />}
          label="Nueva plantilla"
          extended
          onClick={() => setEditingId("")}
        />
      )}

      <MobileActionSheet
        open={actionFor !== null}
        onOpenChange={(o) => {
          if (!o) setActionFor(null);
        }}
        title={actionRow ? actionRow.name : ""}
        description={actionRow?.receiverName ?? undefined}
        items={actionRow ? buildActionItems(actionRow) : []}
      />

      {/* key fuerza remount cuando cambiamos de plantilla — sin esto, el
          state local (en particular `customer`) se filtra entre ediciones
          y queda contaminando el receptor de la plantilla siguiente. */}
      <RecurringTemplateForm
        key={editingId ?? "new"}
        open={editingId !== null}
        templateId={editingId || null}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          reload();
          router.refresh();
        }}
      />

      {/* ── Modal de detalle de errores de auto-envío ── */}
      {issueDetailFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Errores de auto-envío"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setIssueDetailFor(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-xl bg-ds-surface-1 border border-ds-border-default shadow-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-warn-soft text-status-warn-fg">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ds-text-1 leading-snug">
                  Errores de auto-envío
                </p>
                <p className="text-xs text-ds-text-3 mt-0.5 truncate">
                  {issueDetailFor.templateName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIssueDetailFor(null)}
                className="mt-0.5 h-7 w-7 inline-flex items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-2 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {issueDetailFor.issues.map((issue, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-status-warn-border bg-status-warn-soft p-3 space-y-1"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-status-warn-fg">
                      {issue.variant === "PROFORMA" ? "Proforma" : "Estado de Pago"}
                    </span>
                    {issue.threw && (
                      <span className="text-[12px] px-1.5 py-0.5 rounded bg-status-danger-soft text-status-danger-fg border border-status-danger-border">
                        excepción
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ds-text-2 break-words">
                    {issue.error}
                  </p>
                </li>
              ))}
            </ul>
            {issueDetailFor.dteId && (
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-ds-border-subtle">
                <p className="text-xs text-ds-text-3 flex-1">
                  El borrador fue generado correctamente. Podés reenviar manualmente:
                </p>
                <div className="flex gap-2 shrink-0">
                  {issueDetailFor.issues.some((i) => i.variant === "PROFORMA") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResendModal({
                          dteId: issueDetailFor.dteId!,
                          variant: "PROFORMA",
                          receiverName: issueDetailFor.receiverName,
                        });
                        setIssueDetailFor(null);
                      }}
                      className="h-9 gap-1.5"
                    >
                      <SendHorizonal className="h-3.5 w-3.5" />
                      Proforma
                    </Button>
                  )}
                  {issueDetailFor.issues.some((i) => i.variant === "ESTADO_DE_PAGO") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResendModal({
                          dteId: issueDetailFor.dteId!,
                          variant: "ESTADO_DE_PAGO",
                          receiverName: issueDetailFor.receiverName,
                        });
                        setIssueDetailFor(null);
                      }}
                      className="h-9 gap-1.5"
                    >
                      <SendHorizonal className="h-3.5 w-3.5" />
                      Estado de Pago
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal de reenvío manual ── */}
      {resendModal && (
        <BillingDocSendModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setResendModal(null);
              reload();
            }
          }}
          dteId={resendModal.dteId}
          target="draft"
          defaultVariant={resendModal.variant}
          defaultRecipientEmail={null}
          receiverName={resendModal.receiverName}
          onSent={() => {
            setResendModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
