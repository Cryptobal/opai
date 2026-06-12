"use client";

/**
 * EmailHistoryClient — histórico global de correos de facturación
 * (proformas, estados de pago, facturas) navegable por mes.
 *
 * Lee /api/finance/billing/email-history, que devuelve TODOS los logs del
 * mes — incluidos los de borradores ya eliminados (antes invisibles).
 * La navegación mensual evita el listado infinito: siempre se ve un mes
 * calendario acotado.
 */

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Mail,
  MailCheck,
  MailOpen,
  MailWarning,
  MailX,
  Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Surface,
  Tag,
  type DataTableColumn,
} from "@/components/opai-ds";
import { cn } from "@/lib/utils";

type EmailLogRow = {
  id: string;
  dteId: string;
  kind: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  openCount: number;
  bouncedAt: string | null;
  complainedAt: string | null;
  dte: {
    id: string;
    folio: number;
    dteType: number;
    siiStatus: string;
    receiverName: string;
  } | null;
};

type DocCategory = "PROFORMA" | "ESTADO_PAGO" | "DTE" | "OTRO";

const KIND_META: Record<
  string,
  { category: DocCategory; label: string; auto: boolean }
> = {
  AUTO_PROFORMA: { category: "PROFORMA", label: "Proforma", auto: true },
  MANUAL_PROFORMA: { category: "PROFORMA", label: "Proforma", auto: false },
  AUTO_ESTADO_PAGO: { category: "ESTADO_PAGO", label: "Estado de pago", auto: true },
  MANUAL_ESTADO_PAGO: { category: "ESTADO_PAGO", label: "Estado de pago", auto: false },
  AUTO_RECEIVER: { category: "DTE", label: "DTE al receptor", auto: true },
  MANUAL_RESEND: { category: "DTE", label: "Reenvío DTE", auto: false },
  MANUAL_OVERRIDE_RECIPIENT: { category: "DTE", label: "Reenvío DTE", auto: false },
  AUTO_BACKOFFICE: { category: "OTRO", label: "XML backoffice", auto: true },
  MANUAL_BACKOFFICE: { category: "OTRO", label: "XML backoffice", auto: false },
};

/**
 * Algunos logs antiguos quedaron con kind=MANUAL_RESEND aunque eran
 * proformas (código previo a los kinds MANUAL_PROFORMA/...). El asunto
 * es la señal confiable para clasificarlos bien en la vista.
 */
function resolveMeta(log: EmailLogRow): { category: DocCategory; label: string; auto: boolean } {
  const base = KIND_META[log.kind] ?? { category: "OTRO" as const, label: log.kind, auto: false };
  if (base.category === "DTE") {
    const s = log.subject.toLowerCase();
    if (s.startsWith("proforma")) return { ...base, category: "PROFORMA", label: "Proforma" };
    if (s.startsWith("estado de pago")) return { ...base, category: "ESTADO_PAGO", label: "Estado de pago" };
  }
  return base;
}

type DeliveryState = "FAILED" | "BOUNCED" | "COMPLAINED" | "OPENED" | "DELIVERED" | "SENT";

function deliveryState(log: EmailLogRow): DeliveryState {
  if (log.status === "FAILED") return "FAILED";
  if (log.bouncedAt || log.status === "BOUNCED") return "BOUNCED";
  if (log.complainedAt || log.status === "COMPLAINED") return "COMPLAINED";
  if (log.openedAt || log.status === "OPENED") return "OPENED";
  if (log.deliveredAt || log.status === "DELIVERED") return "DELIVERED";
  return "SENT";
}

const DELIVERY_META: Record<
  DeliveryState,
  {
    label: string;
    variant: "ok" | "warn" | "danger" | "info" | "neutral";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  FAILED: { label: "Falló", variant: "danger", icon: MailX },
  BOUNCED: { label: "Rebotó", variant: "danger", icon: MailWarning },
  COMPLAINED: { label: "Spam", variant: "danger", icon: MailWarning },
  OPENED: { label: "Abierto", variant: "ok", icon: MailOpen },
  DELIVERED: { label: "Entregado", variant: "ok", icon: MailCheck },
  SENT: { label: "Enviado", variant: "info", icon: Mail },
};

const CATEGORY_FILTERS: Array<{ key: DocCategory | "ALL" | "PROBLEM"; label: string }> = [
  { key: "ALL", label: "Todos" },
  { key: "PROFORMA", label: "Proformas" },
  { key: "ESTADO_PAGO", label: "Estados de pago" },
  { key: "DTE", label: "Facturas" },
  { key: "PROBLEM", label: "Con problemas" },
];

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function currentMonthStr(): string {
  // Mes actual en Chile (suficiente con el clock local del usuario,
  // que para este tenant ES Chile; el backend valida igual).
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Cliente mostrado: receiverName del DTE, o derivado del asunto si el
 *  borrador fue eliminado (el asunto siempre trae el nombre). */
function clientLabel(log: EmailLogRow): string {
  if (log.dte) return log.dte.receiverName;
  // Asuntos típicos: "Proforma mayo 2026 - CLIENTE" / "Proforma - CLIENTE - ..."
  const parts = log.subject.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : log.subject;
}

export function EmailHistoryClient() {
  const [month, setMonth] = React.useState(currentMonthStr);
  const [logs, setLogs] = React.useState<EmailLogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<DocCategory | "ALL" | "PROBLEM">("ALL");

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/finance/billing/email-history?month=${month}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setLogs(j.data?.logs ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [month]);

  const isCurrentMonth = month === currentMonthStr();

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      const meta = resolveMeta(log);
      if (category === "PROBLEM") {
        const st = deliveryState(log);
        if (st !== "FAILED" && st !== "BOUNCED" && st !== "COMPLAINED") return false;
      } else if (category !== "ALL" && meta.category !== category) {
        return false;
      }
      if (!q) return true;
      return (
        log.subject.toLowerCase().includes(q) ||
        clientLabel(log).toLowerCase().includes(q) ||
        log.to.some((e) => e.toLowerCase().includes(q)) ||
        log.cc.some((e) => e.toLowerCase().includes(q)) ||
        (log.dte && String(log.dte.folio).includes(q))
      );
    });
  }, [logs, search, category]);

  const columns: DataTableColumn<EmailLogRow>[] = [
    {
      id: "fecha",
      header: "Fecha",
      width: "w-28",
      cell: (log) => (
        <span className="text-[12px] font-mono text-ds-text-2 whitespace-nowrap">
          {fmtDateTime(log.sentAt)}
        </span>
      ),
    },
    {
      id: "tipo",
      header: "Tipo",
      width: "w-36",
      cell: (log) => {
        const meta = resolveMeta(log);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-ds-text-1">
              {meta.label}
            </span>
            <span className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
              {meta.auto ? "automático" : "manual"}
            </span>
          </div>
        );
      },
    },
    {
      id: "documento",
      header: "Cliente / Documento",
      cell: (log) => (
        <div className="min-w-0 max-w-56">
          <p className="text-[13px] text-ds-text-1 truncate" title={clientLabel(log)}>
            {clientLabel(log)}
          </p>
          <p className="text-[12px] text-ds-text-3">
            {log.dte
              ? log.dte.folio > 0
                ? `Folio ${log.dte.folio}`
                : "Borrador"
              : "Borrador eliminado"}
          </p>
        </div>
      ),
    },
    {
      id: "asunto",
      header: "Asunto",
      cell: (log) => (
        <span
          className="text-[13px] text-ds-text-2 line-clamp-2 max-w-72"
          title={log.subject}
        >
          {log.subject}
        </span>
      ),
    },
    {
      id: "destinatarios",
      header: "Destinatarios",
      cell: (log) => (
        <div className="min-w-0 max-w-72 text-[12px]">
          <p className="text-ds-text-2 truncate" title={log.to.join(", ")}>
            {log.to.join(", ") || "—"}
          </p>
          {log.cc.length > 0 && (
            <p className="text-ds-text-4 truncate" title={log.cc.join(", ")}>
              CC: {log.cc.join(", ")}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "estado",
      header: "Estado",
      width: "w-32",
      cell: (log) => <DeliveryTag log={log} />,
    },
  ];

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Toolbar: mes + búsqueda + filtros ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 sm:h-9 sm:w-9"
            aria-label="Mes anterior"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-[14px] font-medium font-display text-ds-text-1">
            {monthLabel(month)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 sm:h-9 sm:w-9"
            aria-label="Mes siguiente"
            disabled={isCurrentMonth}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cliente, correo, asunto o folio…"
            className="h-10 sm:h-9 pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-text-4 hover:text-ds-text-2"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setCategory(f.key)}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0",
              category === f.key
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 border border-transparent",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Desktop ── */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(log) => log.id}
          loading={loading}
          rowVariant={(log) => {
            const st = deliveryState(log);
            return st === "FAILED" || st === "BOUNCED" || st === "COMPLAINED"
              ? "danger"
              : "default";
          }}
          empty={
            <EmptyState
              icon={Send}
              title="Sin envíos este mes"
              description="No se registraron correos de facturación en este período. Navegá a otro mes con las flechas."
            />
          }
        />
      </div>

      {/* ── Mobile ── */}
      <div className="sm:hidden space-y-2">
        {!loading && filtered.length === 0 && (
          <Surface elevation={1} padding="md">
            <EmptyState
              icon={Send}
              title="Sin envíos este mes"
              description="No se registraron correos en este período."
            />
          </Surface>
        )}
        <ul className="space-y-2 ds-list-cascade">
          {filtered.map((log) => {
            const meta = resolveMeta(log);
            return (
              <li key={log.id}>
                <Surface elevation={1} padding="sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ds-text-1 truncate">
                        {clientLabel(log)}
                      </p>
                      <p className="text-[12px] text-ds-text-3">
                        {meta.label} · {meta.auto ? "auto" : "manual"} ·{" "}
                        {fmtDateTime(log.sentAt)}
                      </p>
                    </div>
                    <DeliveryTag log={log} />
                  </div>
                  <p className="mt-1.5 text-[12px] text-ds-text-2 line-clamp-2">
                    {log.subject}
                  </p>
                  <p className="mt-1 text-[12px] text-ds-text-4 break-all">
                    {log.to.join(", ")}
                    {log.cc.length > 0 && ` · CC: ${log.cc.join(", ")}`}
                  </p>
                  {log.errorMessage && (
                    <p className="mt-1 text-[12px] text-status-danger-fg">
                      {log.errorMessage}
                    </p>
                  )}
                </Surface>
              </li>
            );
          })}
        </ul>
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-[12px] text-ds-text-4">
          {filtered.length} envío{filtered.length === 1 ? "" : "s"} en{" "}
          {monthLabel(month).toLowerCase()}
          {logs.length !== filtered.length && ` (de ${logs.length} totales)`}
        </p>
      )}
    </div>
  );
}

function DeliveryTag({ log }: { log: EmailLogRow }) {
  const st = deliveryState(log);
  const meta = DELIVERY_META[st];
  const Icon = meta.icon;
  const detail =
    st === "OPENED" && log.openCount > 1
      ? `${meta.label} ×${log.openCount}`
      : meta.label;
  return (
    <span title={log.errorMessage ?? undefined} className="inline-flex shrink-0">
      <Tag variant={meta.variant} size="sm" icon={Icon}>
        {detail}
      </Tag>
    </span>
  );
}
