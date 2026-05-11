"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Surface } from "@/components/opai-ds";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ExternalLink,
  Loader2,
} from "lucide-react";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

interface BreakdownItem {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  source: string;
  amountClp: number;
  currency: string;
  dayOfMonth: number | null;
  categoryName: string | null;
}

interface Summary {
  installationId: string;
  monthlyIncomeClp: number;
  monthlyExpenseClp: number;
  monthlyNetClp: number;
  breakdown: BreakdownItem[];
}

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  CONTRACT: "Contrato",
  PAYROLL: "Sueldos",
  RECURRING_DTE: "DTE",
  SUPPLIER: "Proveedor",
  IVA: "IVA F29",
  TURNOS_EXTRA: "Turnos extra",
  OTHER: "Otro",
};

export function InstallationCashflowCard({ installationId }: { installationId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/crm/installations/${installationId}/cashflow-summary`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success) setSummary(j.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  if (loading) {
    return (
      <Surface elevation={1} padding="md">
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando flujo de caja…
        </div>
      </Surface>
    );
  }

  if (!summary || summary.breakdown.length === 0) {
    return (
      <Surface elevation={1} padding="md">
        <div className="flex items-start gap-3">
          <Wallet className="h-5 w-5 text-ds-text-3 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-ds-text-1">Sin flujo de caja</p>
            <p className="text-[12px] text-ds-text-3 mt-1">
              Esta instalación todavía no tiene contratos ni sueldos
              proyectados. Se crearán automáticamente cuando vincules un
              contrato o asignes dotación.
            </p>
          </div>
        </div>
      </Surface>
    );
  }

  const incomeItems = summary.breakdown.filter((b) => b.kind === "INCOME");
  const expenseItems = summary.breakdown.filter((b) => b.kind === "EXPENSE");

  return (
    <Surface elevation={1} padding="md" className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiBlock
          label="Ingreso mensual"
          value={summary.monthlyIncomeClp}
          tone="ok"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiBlock
          label="Egreso mensual"
          value={summary.monthlyExpenseClp}
          tone="warn"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <KpiBlock
          label="Neto mensual"
          value={summary.monthlyNetClp}
          tone={summary.monthlyNetClp >= 0 ? "ok" : "warn"}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      {/* Desglose */}
      <div className="space-y-2">
        {incomeItems.length > 0 && (
          <BreakdownGroup title="Ingresos" items={incomeItems} tone="ok" />
        )}
        {expenseItems.length > 0 && (
          <BreakdownGroup title="Egresos" items={expenseItems} tone="warn" />
        )}
      </div>

      <Link
        href={`/finanzas/flujo-caja`}
        className="inline-flex items-center gap-1 text-[12px] text-ds-text-2 hover:underline"
      >
        Ver en flujo de caja <ExternalLink className="h-3 w-3" />
      </Link>
    </Surface>
  );
}

function KpiBlock({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn";
  icon: React.ReactNode;
}) {
  const color =
    tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";
  return (
    <div className="rounded-ds-md border border-border bg-card p-3">
      <div className={`flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3`}>
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-[18px] font-semibold tabular-nums ${color}`}>
        ${fmt.format(value)}
      </p>
    </div>
  );
}

function BreakdownGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: BreakdownItem[];
  tone: "ok" | "warn";
}) {
  const color = tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";
  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 mb-1.5">
        {title}
      </p>
      <ul className="divide-y divide-border/50 rounded-ds-md border border-border">
        {items.map((b) => (
          <li
            key={b.id}
            className="flex items-center gap-2 px-3 py-2 hover:bg-muted/20"
          >
            <span className="text-[11px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-ds-sm bg-muted/40 text-ds-text-3 shrink-0">
              {SOURCE_LABEL[b.source] ?? b.source}
            </span>
            <span className="text-[13px] text-ds-text-1 truncate min-w-0 flex-1">
              {b.name}
            </span>
            <span
              className={`text-[13px] font-mono tabular-nums shrink-0 ${color}`}
            >
              {b.currency} {fmt.format(b.amountClp)}
            </span>
            {b.dayOfMonth !== null && (
              <span className="text-[11px] text-ds-text-3 shrink-0">
                · día {b.dayOfMonth === -1 ? "último" : b.dayOfMonth}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
