"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  Users,
  PieChart as PieIcon,
  UserX,
  ShieldAlert,
  Wrench,
  Shield,
  X,
} from "lucide-react";
import { TePeriodSelector } from "./TePeriodSelector";
import { formatPersonName } from "@/lib/personas";
import { LoadingSpinner } from "@/components/opai";

/* ── types ── */

type TeStats = {
  count: number;
  totalAmount: number;
  avgAmount: number;
  totalGuards: number;
  uniqueGuards: number;
  tePercentage: number;
  byOrigin: { ausencia: number; ppc: number; manual: number; refuerzo: number };
};

type EvolutionPoint = {
  date: string;
  label: string;
  totalAmount: number;
  count: number;
  avgAmount: number;
};

type InstRanking = {
  installationId: string;
  name: string;
  teCount: number;
  totalAmount: number;
  avgAmount: number;
  percentOfTotal: number;
  byOrigin: { ausencia: number; ppc: number; manual: number; refuerzo: number };
};

type TeDetailRow = {
  id: string;
  date: string;
  amountClp: number | string;
  status: string;
  tipo: string;
  isManual: boolean;
  installation: { name: string } | null;
  puesto: { name: string } | null;
  guardia: { persona: { firstName: string; lastName: string; rut: string | null } };
};

/* ── helpers ── */

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt$(n: number): string {
  return `$${n.toLocaleString("es-CL")}`;
}

const ORIGIN_META = [
  { key: "ausencia", label: "Ausencia", color: "bg-red-500", textColor: "text-red-400", icon: UserX },
  { key: "ppc", label: "PPC", color: "bg-amber-500", textColor: "text-amber-400", icon: ShieldAlert },
  { key: "manual", label: "Manual", color: "bg-blue-500", textColor: "text-blue-400", icon: Wrench },
  { key: "refuerzo", label: "Refuerzo", color: "bg-purple-500", textColor: "text-purple-400", icon: Shield },
] as const;

/* ── chart tooltips ── */

function EvoTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: EvolutionPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm text-xs">
      <p className="text-muted-foreground font-medium">{d?.label}</p>
      <p className="font-semibold text-foreground">{fmt$(d?.totalAmount ?? 0)}</p>
      <p className="text-muted-foreground">{d?.count} turnos · prom. {fmt$(d?.avgAmount ?? 0)}</p>
    </div>
  );
}

/* ── main ── */

export function TeDashboard() {
  const now = new Date();
  const [from, setFrom] = useState(toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))));
  const [to, setTo] = useState(toDateStr(now));
  const [stats, setStats] = useState<TeStats | null>(null);
  const [evolution, setEvolution] = useState<EvolutionPoint[]>([]);
  const [evoPeriod, setEvoPeriod] = useState<"weekly" | "monthly">("weekly");
  const [instRankings, setInstRankings] = useState<InstRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRows, setDetailRows] = useState<TeDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, evoRes, instRes] = await Promise.all([
        fetch(`/api/te/stats?from=${from}&to=${to}`, { cache: "no-store" }),
        fetch(`/api/te/stats/evolution?period=${evoPeriod}&count=12`, { cache: "no-store" }),
        fetch(`/api/te/stats/by-installation?from=${from}&to=${to}`, { cache: "no-store" }),
      ]);
      const [statsData, evoData, instData] = await Promise.all([statsRes.json(), evoRes.json(), instRes.json()]);
      if (statsData.success) setStats(statsData.data);
      if (evoData.success) setEvolution(evoData.data.points);
      if (instData.success) setInstRankings(instData.data.rankings);
    } catch {
      toast.error("Error cargando dashboard TE");
    } finally {
      setLoading(false);
    }
  }, [from, to, evoPeriod]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/te/export?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Error");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `turnos-extra-${from}-a-${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Excel descargado");
    } catch {
      toast.error("No se pudo descargar el Excel");
    } finally {
      setExporting(false);
    }
  };

  const fetchDetail = useCallback(async () => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/te?from=${from}&to=${to}&status=pending,approved,paid`, { cache: "no-store" });
      const payload = await res.json();
      if (payload.success && Array.isArray(payload.data)) {
        setDetailRows(payload.data);
      }
    } catch { /* silent */ } finally {
      setDetailLoading(false);
    }
  }, [from, to]);

  const handleKpiClick = () => {
    setDetailOpen((prev) => {
      const next = !prev;
      if (next && detailRows.length === 0) void fetchDetail();
      return next;
    });
  };

  const maxInstAmount = instRankings.length > 0 ? instRankings[0].totalAmount : 1;
  const originTotal = stats ? stats.byOrigin.ausencia + stats.byOrigin.ppc + stats.byOrigin.manual + stats.byOrigin.refuerzo : 0;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <TePeriodSelector
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onExport={handleExport}
        exporting={exporting}
      />

      {/* KPI cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className={`cursor-pointer transition-colors hover:border-primary/40 ${detailOpen ? "border-primary/60" : ""}`} onClick={handleKpiClick}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Monto total TE</p>
                <p className="text-2xl font-bold tabular-nums">{stats ? fmt$(stats.totalAmount) : "–"}</p>
                <p className="text-[11px] text-muted-foreground">{stats?.count ?? 0} turnos · click ver detalle</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2"><DollarSign className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-colors hover:border-primary/40 ${detailOpen ? "border-primary/60" : ""}`} onClick={handleKpiClick}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">TE promedio</p>
                <p className="text-2xl font-bold tabular-nums">{stats ? fmt$(stats.avgAmount) : "–"}</p>
                <p className="text-[11px] text-muted-foreground">valor por turno · click ver detalle</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2"><TrendingUp className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Guardias con TE</p>
                <p className="text-2xl font-bold tabular-nums">{stats ? `${stats.uniqueGuards}` : "–"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {stats ? `${stats.tePercentage}% de ${stats.totalGuards} activos` : ""}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2"><Users className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Origen</p>
            <div className="space-y-1.5">
              {ORIGIN_META.map((o) => {
                const count = stats?.byOrigin?.[o.key as keyof TeStats["byOrigin"]] ?? 0;
                const pct = originTotal > 0 ? Math.round((count / originTotal) * 100) : 0;
                const Icon = o.icon;
                return (
                  <div key={o.key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-3.5 w-3.5 ${o.textColor}`} />
                      <span className="text-xs text-muted-foreground">{o.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold tabular-nums ${count > 0 ? o.textColor : "text-muted-foreground/40"}`}>
                        {count}
                      </span>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI detail panel */}
      <AnimatePresence initial={false}>
        {detailOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <Card>
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Detalle de turnos extra del período</CardTitle>
                  <button
                    onClick={() => setDetailOpen(false)}
                    className="rounded-md p-1 hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : detailRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sin registros en este período</p>
                ) : (
                  <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border/50 text-[10px] text-muted-foreground uppercase tracking-wider">
                          <th className="text-left py-1.5 font-medium">Fecha</th>
                          <th className="text-left py-1.5 font-medium">Guardia</th>
                          <th className="text-left py-1.5 font-medium hidden sm:table-cell">RUT</th>
                          <th className="text-left py-1.5 font-medium">Instalación</th>
                          <th className="text-right py-1.5 font-medium">Monto</th>
                          <th className="text-center py-1.5 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailRows.map((row) => (
                          <tr key={row.id} className="border-b border-border/20 hover:bg-muted/20">
                            <td className="py-1.5 text-muted-foreground">
                              {new Date(row.date).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}
                            </td>
                            <td className="py-1.5 font-medium">
                              {formatPersonName(row.guardia.persona.firstName, row.guardia.persona.lastName)}
                            </td>
                            <td className="py-1.5 text-muted-foreground hidden sm:table-cell">{row.guardia.persona.rut ?? "—"}</td>
                            <td className="py-1.5 text-muted-foreground truncate max-w-32">{row.installation?.name ?? "—"}</td>
                            <td className="py-1.5 text-right tabular-nums font-medium">{fmt$(Number(row.amountClp))}</td>
                            <td className="py-1.5 text-center">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                row.status === "paid"
                                  ? "bg-emerald-900/30 text-emerald-300"
                                  : row.status === "approved"
                                    ? "bg-blue-900/30 text-blue-300"
                                    : "bg-amber-900/30 text-amber-300"
                              }`}>
                                {row.status === "paid" ? "Pagado" : row.status === "approved" ? "Aprobado" : "Pendiente"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top instalaciones */}
      {instRankings.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Top Instalaciones por TE</CardTitle>
              <span className="text-[11px] text-muted-foreground">{instRankings.length} instalaciones</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {instRankings.slice(0, 8).map((inst, idx) => (
              <div key={inst.installationId} className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground font-mono w-5 text-right shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-medium truncate">{inst.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold tabular-nums">{fmt$(inst.totalAmount)}</span>
                      <span className="text-[10px] text-muted-foreground">({inst.teCount} TE)</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        inst.percentOfTotal >= 25 ? "bg-red-500" : inst.percentOfTotal >= 15 ? "bg-amber-500" : "bg-teal-500"
                      }`}
                      style={{ width: `${Math.max((inst.totalAmount / maxInstAmount) * 100, 4)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {instRankings.length > 0 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Promedio: {fmt$(Math.round(instRankings.reduce((s, i) => s + i.totalAmount, 0) / instRankings.length))} / instalación · {Math.round(instRankings.reduce((s, i) => s + i.teCount, 0) / instRankings.length)} TE
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Evolution chart */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Evolución Turnos Extra</CardTitle>
            <div className="flex items-center gap-1">
              {(["weekly", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setEvoPeriod(p)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    evoPeriod === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p === "weekly" ? "Semanal" : "Mensual"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center h-[200px]">
              <LoadingSpinner size="md" />
            </div>
          ) : evolution.length < 2 ? (
            <div className="flex flex-col items-center justify-center text-sm text-muted-foreground h-[200px] gap-1">
              <PieIcon className="h-6 w-6 opacity-40" />
              <p>Sin datos suficientes para el gráfico</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">Monto total</p>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={evolution} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<EvoTooltip />} />
                      <Bar dataKey="totalAmount" fill="#1db990" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">Cantidad de TE</p>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolution} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<EvoTooltip />} />
                      <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5, fill: "#f59e0b" }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
