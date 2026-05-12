"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DataTable, EmptyState, Stat, type DataTableColumn } from "@/components/opai-ds";
import { Receipt } from "lucide-react";
import { getRendicionStatusConfig } from "@/lib/finance/rendicion-status";

interface AccountExpensesSectionProps {
  accountId: string;
  installationIds: string[];
}

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
  costCenterId?: string | null;
  item?: { name: string } | null;
}

interface Totals {
  total: number;
  paid: number;
  pending: number;
  count: number;
}

interface ByInstallation {
  [key: string]: { total: number; count: number };
}

const columns: DataTableColumn<RendicionRow>[] = [
  {
    id: "code",
    header: "Código",
    cell: (row) => (
      <Link
        href={`/finanzas/rendiciones/${row.id}`}
        className="text-primary hover:underline text-xs"
      >
        {row.code}
      </Link>
    ),
  },
  {
    id: "date",
    header: "Fecha",
    cell: (row) =>
      row.date ? format(new Date(row.date), "dd/MM/yy", { locale: es }) : "-",
  },
  {
    id: "amount",
    header: "Monto",
    align: "right",
    cell: (row) => fmtCLP(row.amount || 0),
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => (
      <Badge
        variant="secondary"
        className={`text-[10px] ${getRendicionStatusConfig(row.status).className}`}
      >
        {getRendicionStatusConfig(row.status).label}
      </Badge>
    ),
  },
];

export function AccountExpensesSection({
  accountId,
  installationIds,
}: AccountExpensesSectionProps) {
  const [data, setData] = useState<{
    rendiciones: RendicionRow[];
    totals: Totals;
    byInstallation: ByInstallation;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip fetching if there are no installations
    if (installationIds.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }

    fetch(`/api/finance/rendiciones/by-installation?accountId=${accountId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setData({
            rendiciones: result.data || [],
            totals: result.totals || { total: 0, paid: 0, pending: 0, count: 0 },
            byInstallation: result.byInstallation || {},
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accountId, installationIds]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-16 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-lg" />
      </div>
    );
  }

  if (!data || data.totals.count === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No hay rendiciones asociadas a las instalaciones de esta cuenta.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total rendiciones" value={data.totals.count} />
        <Stat label="Gasto total" value={fmtCLP(data.totals.total)} />
        <Stat label="Pagado" value={fmtCLP(data.totals.paid)} variant="brand" />
        <Stat label="Pendiente" value={fmtCLP(data.totals.pending)} variant="warn" />
      </div>

      {/* Rendiciones table */}
      <DataTable
        columns={columns}
        rows={data.rendiciones.slice(0, 20)}
        rowKey={(row) => row.id}
        empty={<EmptyState icon={Receipt} title="Sin rendiciones" compact />}
      />
      {data.rendiciones.length > 20 && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Mostrando 20 de {data.rendiciones.length} rendiciones
        </p>
      )}
    </div>
  );
}
