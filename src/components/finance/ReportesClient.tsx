"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { KpiCard, KpiGrid } from "@/components/opai";
import {
  Download,
  Loader2,
  BarChart3,
  Receipt,
  Car,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface StatusSummary {
  status: string;
  count: number;
  amount: number;
}

interface TypeSummary {
  type: string;
  count: number;
  amount: number;
}

interface MonthlySummary {
  month: string;
  total: number;
  count: number;
}

interface ReportesClientProps {
  statusSummary: StatusSummary[];
  typeSummary: TypeSummary[];
  monthlySummary: MonthlySummary[];
  canExport: boolean;
}

/* ── Constants ── */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviada",
  IN_APPROVAL: "En aprobación",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  PAID: "Pagada",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-500/15 text-zinc-400",
  SUBMITTED: "bg-blue-500/15 text-blue-400",
  IN_APPROVAL: "bg-amber-500/15 text-amber-400",
  APPROVED: "bg-emerald-500/15 text-emerald-400",
  REJECTED: "bg-red-500/15 text-red-400",
  PAID: "bg-purple-500/15 text-purple-400",
};

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  MILEAGE: "Kilometraje",
};

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene",
  "02": "Feb",
  "03": "Mar",
  "04": "Abr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Ago",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dic",
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const fmtCompact = new Intl.NumberFormat("es-CL", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

/* ── Component ── */

export function ReportesClient({
  statusSummary,
  typeSummary,
  monthlySummary,
  canExport,
}: ReportesClientProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  /* ── Totals ── */

  const totalCount = useMemo(
    () => statusSummary.reduce((s, g) => s + g.count, 0),
    [statusSummary]
  );
  const totalAmount = useMemo(
    () => statusSummary.reduce((s, g) => s + g.amount, 0),
    [statusSummary]
  );

  /* ── Chart data ── */

  const maxMonthlyTotal = useMemo(
    () => Math.max(...monthlySummary.map((m) => m.total), 1),
    [monthlySummary]
  );

  /* ── Export ── */

  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      setExporting(true);
      try {
        const params = new URLSearchParams({ format });
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);

        const res = await fetch(
          `/api/finance/reportes/export?${params.toString()}`
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Error al exportar");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rendiciones_${new Date().toISOString().slice(0, 10)}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Reporte descargado");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error al exportar"
        );
      } finally {
        setExporting(false);
      }
    },
    [dateFrom, dateTo]
  );

  return (
    <div className="space-y-6">
      {/* Grand total cards */}
      <KpiGrid columns={4}>
        <KpiCard title="Total rendiciones" value={totalCount} />
        <KpiCard title="Monto total" value={fmtCLP.format(totalAmount)} />
        {typeSummary.map((ts) => (
          <KpiCard
            key={ts.type}
            title={TYPE_LABELS[ts.type] ?? ts.type}
            value={fmtCLP.format(ts.amount)}
            icon={ts.type === "MILEAGE" ? <Car className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
            description={`${ts.count} rendición(es)`}
          />
        ))}
      </KpiGrid>

      {/* Status breakdown */}
      <Card>
        <CardContent>
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Resumen por estado
          </h3>
          <div className="space-y-3">
            {statusSummary.map((s) => {
              const pct = totalAmount > 0 ? (s.amount / totalAmount) * 100 : 0;
              return (
                <div key={s.status}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          STATUS_COLORS[s.status] ?? "bg-muted"
                        )}
                      >
                        {STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {s.count} rendición(es)
                      </span>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {fmtCLP.format(s.amount)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        s.status === "PAID"
                          ? "bg-purple-500"
                          : s.status === "APPROVED"
                          ? "bg-emerald-500"
                          : s.status === "REJECTED"
                          ? "bg-red-500"
                          : s.status === "IN_APPROVAL"
                          ? "bg-amber-500"
                          : s.status === "SUBMITTED"
                          ? "bg-blue-500"
                          : "bg-zinc-500"
                      )}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Monthly chart (simple bar chart with divs) */}
      {monthlySummary.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Gasto mensual (últimos 12 meses)
            </h3>
            <div className="flex items-end gap-1.5 h-40">
              {monthlySummary.map((m) => {
                const heightPct = (m.total / maxMonthlyTotal) * 100;
                const [, monthNum] = m.month.split("-");
                return (
                  <div
                    key={m.month}
                    className="flex-1 flex flex-col items-center gap-1 min-w-0"
                  >
                    <div className="w-full flex flex-col items-center justify-end h-[120px]">
                      <p className="text-[10px] text-muted-foreground mb-1 tabular-nums">
                        {fmtCompact.format(m.total)}
                      </p>
                      <div
                        className="w-full max-w-[32px] rounded-t bg-primary/60 hover:bg-primary/80 transition-colors cursor-default"
                        style={{ height: `${Math.max(heightPct, 3)}%` }}
                        title={`${m.month}: ${fmtCLP.format(m.total)} (${m.count})`}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {MONTH_LABELS[monthNum] ?? monthNum}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export section */}
      {canExport && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-3">Exportar datos</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Desde</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 h-9 w-full sm:w-40"
                />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 h-9 w-full sm:w-40"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("csv")}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("xlsx")}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                Excel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
