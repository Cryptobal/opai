"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { KpiCard, DataTable } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";

interface InstallationExpensesSectionProps {
  installationId: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-500/15 text-zinc-400",
  SUBMITTED: "bg-blue-500/15 text-blue-400",
  IN_APPROVAL: "bg-amber-500/15 text-amber-400",
  APPROVED: "bg-emerald-500/15 text-emerald-400",
  REJECTED: "bg-red-500/15 text-red-400",
  PAID: "bg-purple-500/15 text-purple-400",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviada",
  IN_APPROVAL: "En aprobación",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  PAID: "Pagada",
};

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(n);

interface RendicionRow {
  id: string;
  code: string;
  date: string | null;
  amount: number;
  status: string;
  description?: string | null;
  item?: { name: string } | null;
}

interface Totals {
  total: number;
  paid: number;
  pending: number;
  count: number;
}

const columns: DataTableColumn[] = [
  {
    key: "code",
    label: "Código",
    render: (value, row) => (
      <Link
        href={`/finanzas/rendiciones/${row.id}`}
        className="text-primary hover:underline text-xs"
      >
        {value}
      </Link>
    ),
  },
  {
    key: "date",
    label: "Fecha",
    render: (value) =>
      value ? format(new Date(value), "dd/MM/yy", { locale: es }) : "-",
  },
  {
    key: "amount",
    label: "Monto",
    className: "text-right",
    render: (value) => (
      <span className="font-mono">{fmtCLP(value || 0)}</span>
    ),
  },
  {
    key: "status",
    label: "Estado",
    render: (value) => (
      <Badge
        variant="secondary"
        className={`text-[10px] ${STATUS_COLORS[value] || ""}`}
      >
        {STATUS_LABELS[value] || value}
      </Badge>
    ),
  },
];

export function InstallationExpensesSection({
  installationId,
}: InstallationExpensesSectionProps) {
  const [data, setData] = useState<{
    rendiciones: RendicionRow[];
    totals: Totals;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/finance/rendiciones/by-installation?installationId=${installationId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setData({
            rendiciones: result.data || [],
            totals: result.totals || { total: 0, paid: 0, pending: 0, count: 0 },
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [installationId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-16 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-lg" />
      </div>
    );
  }

  if (!data || data.rendiciones.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No hay rendiciones asociadas a esta instalación.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Total rendiciones" value={data.totals.count} size="sm" />
        <KpiCard title="Gasto total" value={fmtCLP(data.totals.total)} size="sm" />
        <KpiCard
          title="Pagado"
          value={fmtCLP(data.totals.paid)}
          size="sm"
          variant="purple"
        />
        <KpiCard
          title="Pendiente"
          value={fmtCLP(data.totals.pending)}
          size="sm"
          variant="amber"
        />
      </div>

      {/* Rendiciones table */}
      <DataTable
        columns={columns}
        data={data.rendiciones.slice(0, 20)}
        compact
      />
      {data.rendiciones.length > 20 && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Mostrando 20 de {data.rendiciones.length} rendiciones
        </p>
      )}
    </div>
  );
}
