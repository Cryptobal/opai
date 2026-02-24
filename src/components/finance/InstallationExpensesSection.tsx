"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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

      {/* Rendiciones table */}
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Código</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Monto</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.rendiciones.slice(0, 20).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 last:border-0 hover:bg-accent/30"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/finanzas/rendiciones/${r.id}`}
                        className="text-primary hover:underline text-xs"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.date
                        ? format(new Date(r.date), "dd/MM/yy", { locale: es })
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-mono">
                      {fmtCLP(r.amount || 0)}
                    </td>
                    <td className="px-3 py-2">
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
