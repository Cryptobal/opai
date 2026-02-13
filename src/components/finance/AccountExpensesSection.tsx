"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface AccountExpensesSectionProps {
  accountId: string;
  installationIds: string[];
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
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Total rendiciones</p>
            <p className="text-lg font-semibold">{data.totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Gasto total</p>
            <p className="text-lg font-semibold">{fmtCLP(data.totals.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Pagado</p>
            <p className="text-lg font-semibold text-purple-400">
              {fmtCLP(data.totals.paid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Pendiente</p>
            <p className="text-lg font-semibold text-amber-400">
              {fmtCLP(data.totals.pending)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent rendiciones table */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Últimas rendiciones
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 font-medium">Código</th>
                  <th className="text-left py-2 font-medium">Fecha</th>
                  <th className="text-right py-2 font-medium">Monto</th>
                  <th className="text-left py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.rendiciones.slice(0, 20).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 hover:bg-accent/30"
                  >
                    <td className="py-2">
                      <Link
                        href={`/finanzas/rendiciones/${r.id}`}
                        className="text-primary hover:underline text-xs"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="py-2 text-xs">
                      {r.date
                        ? format(new Date(r.date), "dd/MM/yy", { locale: es })
                        : "-"}
                    </td>
                    <td className="py-2 text-right text-xs font-mono">
                      {fmtCLP(r.amount || 0)}
                    </td>
                    <td className="py-2">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${STATUS_COLORS[r.status] || ""}`}
                      >
                        {STATUS_LABELS[r.status] || r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rendiciones.length > 20 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Mostrando 20 de {data.rendiciones.length} rendiciones
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
