"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/opai";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  ShieldAlert,
} from "lucide-react";

/* ── types ── */

type WeeklyPoint = {
  date: string;
  label: string;
  ppcCount: number;
  ppcPercentage: number;
};

type InstallationRank = {
  installationId: string;
  name: string;
  currentPpcCount: number;
  currentTotalPuestos: number;
  currentPpcPercentage: number;
  avgPercentage: number;
  trendDiff: number | null;
  weeklyPoints: WeeklyPoint[];
};

/* ── sparkline tooltip ── */

function SparkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: WeeklyPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm text-xs">
      <p className="text-muted-foreground font-medium">{d?.label}</p>
      <p className="font-semibold text-foreground">{d?.ppcPercentage ?? 0}% PPC</p>
      <p className="text-muted-foreground">{d?.ppcCount} puestos</p>
    </div>
  );
}

/* ── severity helpers ── */

function pctColor(pct: number): string {
  if (pct >= 30) return "text-red-400";
  if (pct >= 15) return "text-amber-400";
  return "text-emerald-400";
}

function pctBgColor(pct: number): string {
  if (pct >= 30) return "bg-red-400/10";
  if (pct >= 15) return "bg-amber-400/10";
  return "bg-emerald-400/10";
}

function trendIcon(diff: number | null) {
  if (diff === null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  if (diff <= -0.5) return <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />;
  if (diff >= 0.5) return <TrendingUp className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function trendLabel(diff: number | null): string {
  if (diff === null) return "—";
  if (Math.abs(diff) < 0.5) return "estable";
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
}

function trendColor(diff: number | null): string {
  if (diff === null || Math.abs(diff) < 0.5) return "text-muted-foreground";
  return diff > 0 ? "text-red-400" : "text-emerald-400";
}

/* ── row with expandable chart ── */

function RankingRow({ rank, item }: { rank: number; item: InstallationRank }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors group"
      >
        {/* rank */}
        <span className="text-[11px] text-muted-foreground font-mono w-5 text-right shrink-0">
          {rank}
        </span>

        {/* chevron */}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}

        {/* name */}
        <span className="text-sm font-medium truncate min-w-0 flex-1 group-hover:text-primary transition-colors">
          {item.name}
        </span>

        {/* current PPC / total puestos */}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-12 text-right">
          {item.currentPpcCount}/{item.currentTotalPuestos}
        </span>

        {/* current % */}
        <span className={`text-sm font-semibold tabular-nums shrink-0 w-14 text-right ${pctColor(item.currentPpcPercentage)}`}>
          {item.currentPpcPercentage}%
        </span>

        {/* avg 30d */}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-14 text-right hidden md:block">
          {item.avgPercentage}%
        </span>

        {/* trend */}
        <span className={`flex items-center gap-0.5 shrink-0 w-16 justify-end text-[11px] font-medium ${trendColor(item.trendDiff)}`}>
          {trendIcon(item.trendDiff)}
          <span className="hidden sm:inline">{trendLabel(item.trendDiff)}</span>
        </span>

        {/* mini severity badge */}
        <Badge
          variant={item.currentPpcPercentage >= 30 ? "destructive" : "outline"}
          className="text-[9px] px-1.5 py-0 shrink-0 hidden lg:inline-flex"
        >
          {item.currentPpcPercentage >= 30 ? "Crítico" : item.currentPpcPercentage >= 15 ? "Alerta" : "OK"}
        </Badge>
      </button>

      <AnimatePresence initial={false}>
        {expanded && item.weeklyPoints.length >= 2 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              <div className="grid gap-3 md:grid-cols-2">
                {/* % PPC evolution */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">% PPC semanal</p>
                  <div style={{ height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={item.weeklyPoints} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => `${v}%`}
                        />
                        <Tooltip content={<SparkTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="ppcPercentage"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: "#f59e0b" }}
                          activeDot={{ r: 4, fill: "#f59e0b" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* absolute PPC count */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">PPC absoluto semanal</p>
                  <div style={{ height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={item.weeklyPoints} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip content={<SparkTooltip />} />
                        <Bar dataKey="ppcCount" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── main component ── */

export function PpcInstallationRanking() {
  const [rankings, setRankings] = useState<InstallationRank[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRankings = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/ppc/history/installations?days=90", { cache: "no-store" });
      const payload = await res.json();
      if (payload.success && Array.isArray(payload.data?.rankings)) {
        setRankings(payload.data.rankings);
      }
    } catch {
      // silent — ranking is supplementary
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRankings();
  }, [fetchRankings]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <LoadingSpinner size="md" />
        </CardContent>
      </Card>
    );
  }

  if (rankings.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm">Ranking PPC por Instalación</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-6 gap-1">
            <ShieldAlert className="h-6 w-6 opacity-40" />
            <p>Sin datos de ranking aún</p>
            <p className="text-[11px]">Se construirá automáticamente con los snapshots diarios</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-1 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Ranking PPC por Instalación</CardTitle>
          <span className="text-[11px] text-muted-foreground">{rankings.length} instalaciones · últimos 90 días</span>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-1">
        {/* header row */}
        <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium border-b border-border/40">
          <span className="w-5 text-right">#</span>
          <span className="w-3.5" />
          <span className="flex-1">Instalación</span>
          <span className="w-12 text-right">PPC</span>
          <span className="w-14 text-right">% hoy</span>
          <span className="w-14 text-right hidden md:block">Prom.</span>
          <span className="w-16 text-right">Tend.</span>
          <span className="w-12 hidden lg:block" />
        </div>
        {rankings.map((item, idx) => (
          <RankingRow key={item.installationId} rank={idx + 1} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}
