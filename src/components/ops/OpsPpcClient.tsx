"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { PpcInstallationRanking } from "./PpcInstallationRanking";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/opai";
import { Spinner } from "@/components/opai-ds";
import { formatPersonName } from "@/lib/personas";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Users,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Palmtree,
  Stethoscope,
  Clock3,
  UserX,
} from "lucide-react";

/* ── types ─────────────────────────────────────── */

type ClientOption = {
  id: string;
  name: string;
  installations: { id: string; name: string }[];
};

type PpcItem = {
  id: string;
  date: string;
  slotNumber: number;
  shiftCode?: string | null;
  reason: string;
  installation: { id: string; name: string };
  puesto: { id: string; name: string; shiftStart: string; shiftEnd: string };
  plannedGuardia?: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string };
  } | null;
};

type PpcData = {
  total: number;
  totalGuards: number;
  ppcPercentage: number;
  byReason: Record<string, number>;
  items: PpcItem[];
};

type HistoryPoint = {
  date: string;
  label: string;
  ppcPercentage: number;
  totalPpc: number;
  totalGuards: number;
};

interface OpsPpcClientProps {
  initialClients: ClientOption[];
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const REASON_META: Record<string, { label: string; color: string; bgColor: string; icon: typeof UserX }> = {
  sin_guardia: { label: "Sin guardia", color: "text-amber-400", bgColor: "bg-amber-400/10", icon: UserX },
  vacaciones: { label: "Vacaciones", color: "text-emerald-400", bgColor: "bg-emerald-400/10", icon: Palmtree },
  licencia: { label: "Licencia", color: "text-yellow-400", bgColor: "bg-yellow-400/10", icon: Stethoscope },
  permiso: { label: "Permiso", color: "text-orange-400", bgColor: "bg-orange-400/10", icon: Clock3 },
};

/* ── Chart tooltip ─────────────────────────────── */

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: HistoryPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm text-xs">
      <p className="text-muted-foreground font-medium">{d?.label}</p>
      <p className="font-semibold text-foreground">{d?.ppcPercentage ?? 0}% PPC</p>
      <p className="text-muted-foreground">
        {d?.totalPpc} puestos / {d?.totalGuards} guardias
      </p>
    </div>
  );
}

/* ── KPI Card ──────────────────────────────────── */

function KpiCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  color = "text-foreground",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string } | null;
  icon: typeof ShieldAlert;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{title}</p>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="shrink-0 rounded-lg bg-muted/50 p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-[11px] font-medium ${trend.value <= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {trend.value <= 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            {Math.abs(trend.value)}% {trend.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Installation Card ─────────────────────────── */

function InstallationCard({
  installationId,
  name,
  items,
}: {
  installationId: string;
  name: string;
  items: PpcItem[];
}) {
  const [expanded, setExpanded] = useState(false);

  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
    }
    return counts;
  }, [items]);

  const severityColor = items.length >= 5
    ? "border-red-500/30 bg-red-500/[0.03]"
    : items.length >= 3
      ? "border-amber-500/30 bg-amber-500/[0.03]"
      : "border-border";

  return (
    <Card className={`transition-colors ${severityColor}`}>
      <CardHeader className="p-4 pb-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between gap-2 text-left group"
        >
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <CardTitle className="text-sm truncate group-hover:text-primary transition-colors">
              {name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {Object.entries(reasonCounts).map(([reason, count]) => {
              const meta = REASON_META[reason] ?? REASON_META.sin_guardia;
              return (
                <span key={reason} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.color} ${meta.bgColor}`}>
                  {count}
                </span>
              );
            })}
            <Badge variant={items.length >= 5 ? "destructive" : "outline"} className="text-[10px] ml-1">
              {items.length}
            </Badge>
          </div>
        </button>
      </CardHeader>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <CardContent className="px-4 pt-0 pb-3">
              <div className="space-y-1.5">
                {items.map((item) => {
                  const meta = REASON_META[item.reason] ?? REASON_META.sin_guardia;
                  const ReasonIcon = meta.icon;
                  const dateStr = new Date(item.date).toLocaleDateString("es-CL", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  });
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/60 p-2.5 flex items-center justify-between gap-3 min-w-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`shrink-0 rounded-md p-1.5 ${meta.bgColor}`}>
                          <ReasonIcon className={`h-3.5 w-3.5 ${meta.color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.puesto.name}
                            <span className="text-muted-foreground text-xs ml-1">(Slot {item.slotNumber})</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {dateStr} · {item.puesto.shiftStart}–{item.puesto.shiftEnd}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-medium ${meta.color}`}>
                          {meta.label}
                        </span>
                        {item.plannedGuardia && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatPersonName(item.plannedGuardia.persona.firstName, item.plannedGuardia.persona.lastName)}
                          </span>
                        )}
                        {item.reason === "sin_guardia" && (
                          <Link
                            href={`/ops/pauta-mensual?installationId=${installationId}&date=${typeof item.date === "string" ? item.date.slice(0, 10) : new Date(item.date).toISOString().slice(0, 10)}`}
                            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-medium"
                          >
                            Asignar <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ── Main Component ────────────────────────────── */

export function OpsPpcClient({ initialClients }: OpsPpcClientProps) {
  const [clients] = useState<ClientOption[]>(initialClients);
  const [clientId, setClientId] = useState<string>("all");
  const [installationId, setInstallationId] = useState<string>("all");
  const [date, setDate] = useState<string>(toDateInput(new Date()));
  const [rangeMode, setRangeMode] = useState<string>("day");
  const [data, setData] = useState<PpcData | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyPeriod, setHistoryPeriod] = useState<string>("weekly");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [prevPercentage, setPrevPercentage] = useState<number | null>(null);

  const filteredInstallations = useMemo(() => {
    if (clientId === "all") return clients.flatMap((c) => c.installations);
    const client = clients.find((c) => c.id === clientId);
    return client?.installations ?? [];
  }, [clients, clientId]);

  // Reset installation when client changes
  useEffect(() => {
    setInstallationId("all");
  }, [clientId]);

  const fetchPpc = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date, range: rangeMode });
      if (installationId !== "all") params.set("installationId", installationId);
      const res = await fetch(`/api/ops/ppc?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Error cargando PPC");
      setData(payload.data as PpcData);
    } catch {
      toast.error("No se pudo cargar PPC");
    } finally {
      setLoading(false);
    }
  }, [installationId, date, rangeMode]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/ops/ppc/history?period=${historyPeriod}&count=12`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error);
      const points = payload.data.points as HistoryPoint[];
      setHistory(points);
      if (points.length >= 2) {
        setPrevPercentage(points[points.length - 2].ppcPercentage);
      }
    } catch {
      // History might not have data yet
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPeriod]);

  const takeSnapshot = useCallback(async () => {
    try {
      await fetch("/api/ops/ppc/snapshot", { method: "POST" });
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void fetchPpc();
  }, [fetchPpc]);

  useEffect(() => {
    void takeSnapshot().then(() => fetchHistory());
  }, [takeSnapshot, fetchHistory]);

  // Group items by installation
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; items: PpcItem[] }>();
    for (const item of data.items) {
      const key = item.installation.id;
      if (!map.has(key)) map.set(key, { name: item.installation.name, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.items.length - a.items.length);
  }, [data]);

  const trend = useMemo(() => {
    if (prevPercentage === null || !data) return null;
    const diff = Math.round((data.ppcPercentage - prevPercentage) * 100) / 100;
    return { value: diff, label: `vs semana anterior` };
  }, [data, prevPercentage]);

  return (
    <div className="space-y-5">
      {/* ── KPI Cards ── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="% PPC"
          value={data ? `${data.ppcPercentage}%` : "–"}
          subtitle="del total de guardias activos"
          trend={trend}
          icon={ShieldAlert}
          color={data && data.ppcPercentage > 5 ? "text-red-400" : data && data.ppcPercentage > 2 ? "text-amber-400" : "text-emerald-400"}
        />
        <KpiCard
          title="Puestos por cubrir"
          value={data?.total ?? "–"}
          subtitle="hoy en total"
          icon={AlertTriangle}
          color="text-foreground"
        />
        <KpiCard
          title="Guardias activos"
          value={data?.totalGuards ?? "–"}
          subtitle="dotación activa"
          icon={Users}
        />
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Desglose por motivo</p>
            <div className="space-y-1.5">
              {Object.entries(REASON_META).map(([key, meta]) => {
                const count = data?.byReason?.[key] ?? 0;
                const ReasonIcon = meta.icon;
                return (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <ReasonIcon className={`h-3.5 w-3.5 ${meta.color}`} />
                      <span className="text-xs text-muted-foreground">{meta.label}</span>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${count > 0 ? meta.color : "text-muted-foreground/40"}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Evolution Chart ── */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Evolución % PPC</CardTitle>
            <div className="flex items-center gap-1">
              {(["weekly", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setHistoryPeriod(p)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    historyPeriod === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p === "weekly" ? "Semanal" : "Mensual"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {historyLoading ? (
            <div className="flex items-center justify-center h-[200px]">
              <Spinner size="md" />
            </div>
          ) : history.length < 2 ? (
            <div className="flex flex-col items-center justify-center text-sm text-muted-foreground h-[200px] gap-1">
              <ShieldAlert className="h-6 w-6 opacity-40" />
              <p>Sin datos históricos aún</p>
              <p className="text-[11px]">El historial se construirá automáticamente cada día</p>
            </div>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="ppcPercentage"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#f59e0b" }}
                    activeDot={{ r: 5, fill: "#f59e0b" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Installation Ranking ── */}
      <PpcInstallationRanking />

      {/* ── Filters ── */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-[11px]">Cliente</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="all">Todos</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Instalación</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
              >
                <option value="all">Todas</option>
                {filteredInstallations.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Fecha</Label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Rango</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                value={rangeMode}
                onChange={(e) => setRangeMode(e.target.value)}
              >
                <option value="day">Solo este día</option>
                <option value="month">Todo el mes</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              {loading ? (
                <Spinner size="sm" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {data?.total ?? 0} puesto(s) por cubrir
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Installation Cards ── */}
      {!data || data.items.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<AlertTriangle className="h-8 w-8" />}
              title="Sin PPC"
              description="No hay puestos por cubrir para los filtros actuales."
              compact
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {grouped.map(([instId, group]) => (
            <InstallationCard
              key={instId}
              installationId={instId}
              name={group.name}
              items={group.items}
            />
          ))}
        </div>
      )}
    </div>
  );
}
