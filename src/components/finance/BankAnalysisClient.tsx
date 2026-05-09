"use client";

/**
 * Pestaña "Análisis" — vista tipo tabla dinámica sobre los movimientos.
 *
 * Permite agrupar por:
 *   - Contraparte (RUT detectado en glosa, o huella de descripción)
 *   - Categoría (cuenta contable de los links de conciliación)
 *   - Mes (YYYY-MM)
 *   - Día (YYYY-MM-DD)
 *
 * Y filtrar por rango de fechas, cuenta(s) bancaria(s) y dirección
 * (ingresos / egresos / ambos). Muestra totales con barra horizontal
 * proporcional para ver visualmente dónde se concentra la plata.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  BarChart3,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";

interface BankAccountOption {
  id: string;
  bankName: string;
  accountNumber: string;
}

interface AnalysisGroup {
  key: string;
  label: string;
  count: number;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
}

interface AnalysisResult {
  groups: AnalysisGroup[];
  totalCount: number;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  scannedCount: number;
  scanCap: number;
  capHit: boolean;
}

interface BankAnalysisClientProps {
  accounts: BankAccountOption[];
}

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

type GroupBy = "counterparty" | "category" | "month" | "day";
type Direction = "income" | "expense" | "both";

const GROUPBY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "counterparty", label: "Contraparte" },
  { value: "category", label: "Cuenta contable" },
  { value: "month", label: "Mes" },
  { value: "day", label: "Día" },
];

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "both", label: "Ingresos y egresos" },
  { value: "income", label: "Solo ingresos" },
  { value: "expense", label: "Solo egresos" },
];

const PRESETS = [
  { label: "Este mes", days: -1, type: "thisMonth" },
  { label: "Mes pasado", days: -1, type: "lastMonth" },
  { label: "Últimos 30 días", days: 30, type: "rolling" },
  { label: "Últimos 90 días", days: 90, type: "rolling" },
  { label: "Año actual", days: -1, type: "ytd" },
] as const;

export function BankAnalysisClient({ accounts }: BankAnalysisClientProps) {
  const [bankAccountId, setBankAccountId] = useState<string>("__all__");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [direction, setDirection] = useState<Direction>("both");
  const [groupBy, setGroupBy] = useState<GroupBy>("counterparty");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobileViewport();
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const selectedAccountLabel = useMemo(() => {
    if (bankAccountId === "__all__") return "Todas las cuentas";
    const a = accounts.find((x) => x.id === bankAccountId);
    return a ? `${a.bankName} · ${a.accountNumber}` : "Cuenta";
  }, [accounts, bankAccountId]);
  const groupByLabel = useMemo(
    () => GROUPBY_OPTIONS.find((o) => o.value === groupBy)?.label ?? "",
    [groupBy],
  );

  // Default: este mes
  useEffect(() => {
    if (!dateFrom && !dateTo) {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(format(first, "yyyy-MM-dd"));
      setDateTo(format(now, "yyyy-MM-dd"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const now = new Date();
    if (preset.type === "thisMonth") {
      setDateFrom(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"));
      setDateTo(format(now, "yyyy-MM-dd"));
    } else if (preset.type === "lastMonth") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(format(first, "yyyy-MM-dd"));
      setDateTo(format(last, "yyyy-MM-dd"));
    } else if (preset.type === "ytd") {
      setDateFrom(format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd"));
      setDateTo(format(now, "yyyy-MM-dd"));
    } else if (preset.type === "rolling") {
      const start = new Date(now);
      start.setDate(start.getDate() - preset.days);
      setDateFrom(format(start, "yyyy-MM-dd"));
      setDateTo(format(now, "yyyy-MM-dd"));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (bankAccountId !== "__all__") params.set("bankAccountId", bankAccountId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("direction", direction);
      params.set("groupBy", groupBy);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/finance/banking/analysis?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setResult(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [bankAccountId, dateFrom, dateTo, direction, groupBy, search]);

  // Cargar al montar y cuando cambian filtros (dateFrom/To recién definidos)
  useEffect(() => {
    if (dateFrom && dateTo) {
      load();
    }
  }, [load, dateFrom, dateTo]);

  // Para la barra horizontal: máximo absoluto entre los grupos
  const maxAbs = useMemo(() => {
    if (!result || result.groups.length === 0) return 1;
    return Math.max(
      1,
      ...result.groups.map((g) => Math.max(g.totalIncome, g.totalExpense))
    );
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Barra de filtros — colapsable en mobile */}
      {isMobile && (
        <div className="rounded-lg border border-border bg-card/50 px-3 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpenMobile((v) => !v)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
            aria-expanded={filtersOpenMobile}
          >
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium truncate">{selectedAccountLabel}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {dateFrom || dateTo ? `${dateFrom || "…"} → ${dateTo || "…"}` : "Sin rango"}
                {` · ${groupByLabel}`}
              </p>
            </div>
            {filtersOpenMobile ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </div>
      )}
      <Card className={cn(isMobile && !filtersOpenMobile && "hidden")}>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Cuenta</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las cuentas</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.bankName} - {a.accountNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input
                type="date"
                className="h-9"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input
                type="date"
                className="h-9"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as Direction)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Agrupar por</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPBY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-3 space-y-1.5">
              <Label>Buscar</Label>
              <Input
                type="text"
                className="h-9"
                placeholder="Filtrar movimientos por descripción o referencia"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p)}
                className="h-7 text-xs"
              >
                {p.label}
              </Button>
            ))}
            <Button size="sm" onClick={load} disabled={loading} className="h-7 text-xs ml-auto">
              {loading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Actualizar
            </Button>
            {isMobile && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFiltersOpenMobile(false)}
                className="h-7 text-xs"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cerrar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {result && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Movimientos" value={result.totalCount.toLocaleString("es-CL")} />
          <KpiCard label="Ingresos" value={fmtCLP.format(result.totalIncome)} tone="ok" />
          <KpiCard label="Egresos" value={fmtCLP.format(result.totalExpense)} tone="danger" />
          <KpiCard
            label="Neto"
            value={fmtCLP.format(result.totalNet)}
            tone={result.totalNet >= 0 ? "ok" : "danger"}
          />
        </div>
      )}

      {result?.capHit && (
        <Card className="border-status-warn-border bg-status-warn-soft">
          <CardContent className="p-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-status-warn-fg shrink-0 mt-0.5" />
            <p className="text-status-warn-fg">
              Se alcanzó el límite de {result.scanCap.toLocaleString("es-CL")} movimientos.
              Acotá el rango de fechas para asegurar resultados completos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !result || result.groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Sin movimientos para los filtros seleccionados.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                    Grupo
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground w-20">
                    #
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground hidden md:table-cell">
                    Ingresos
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground hidden md:table-cell">
                    Egresos
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                    Neto
                  </th>
                  <th className="px-3 py-2 hidden sm:table-cell w-[140px]" />
                </tr>
              </thead>
              <tbody>
                {result.groups.map((g) => {
                  const incPct = (g.totalIncome / maxAbs) * 100;
                  const expPct = (g.totalExpense / maxAbs) * 100;
                  return (
                    <tr key={g.key} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2.5">
                        <span className="text-sm">{g.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {g.count.toLocaleString("es-CL")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-status-ok-fg hidden md:table-cell">
                        {g.totalIncome > 0 ? fmtCLP.format(g.totalIncome) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-status-danger-fg hidden md:table-cell">
                        {g.totalExpense > 0 ? fmtCLP.format(g.totalExpense) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono text-sm font-medium",
                          g.totalNet >= 0 ? "text-status-ok-fg" : "text-status-danger-fg"
                        )}
                      >
                        {fmtCLP.format(g.totalNet)}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="space-y-1">
                          {incPct > 0 && (
                            <div className="h-1.5 rounded-full bg-status-ok-fg/80" style={{ width: `${incPct}%` }} />
                          )}
                          {expPct > 0 && (
                            <div className="h-1.5 rounded-full bg-status-danger-fg/80" style={{ width: `${expPct}%` }} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "ok" | "danger";
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "text-base sm:text-lg font-semibold font-mono mt-1 truncate",
            tone === "ok" && "text-status-ok-fg",
            tone === "danger" && "text-status-danger-fg"
          )}
          title={value}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
