"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  UserX,
  Users,
  Award,
  AlertTriangle,
} from "lucide-react";
import { TePeriodSelector } from "./TePeriodSelector";
import { Spinner } from "@/components/opai-ds";
import { currentYearMonthInChile, todayInChile } from "@/lib/dates-cl";

/* ── types ── */

type RankItem = {
  guardiaId: string;
  name: string;
  rut: string;
  code: string | null;
  installation: string;
  absenceCount: number;
  totalShifts: number;
  rate: number;
  prevCount: number;
  trendDiff: number;
};

type AbsenceDetail = {
  id: string;
  date: string;
  installation: string;
  puesto: string;
  shift: string;
};

type AusentismoData = {
  totalAbsences: number;
  totalPlannedShifts: number;
  absenteeismRate: number;
  guardsWithZeroAbsences: number;
  totalGuardsWithShifts: number;
  rankings: RankItem[];
};

/* ── helpers ── */

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rateColor(rate: number): string {
  if (rate >= 25) return "text-status-danger-fg";
  if (rate >= 10) return "text-status-warn-fg";
  return "text-status-ok-fg";
}

function rateBadge(rate: number): { label: string; variant: "destructive" | "outline" | "secondary" } {
  if (rate >= 25) return { label: "Crítico", variant: "destructive" };
  if (rate >= 10) return { label: "Alerta", variant: "outline" };
  return { label: "OK", variant: "secondary" };
}

/* ── detail row ── */

function RankingRow({ item, from, to }: { item: RankItem; from: string; to: string }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<AbsenceDetail[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadDetail = async () => {
    if (details.length > 0) return;
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/ops/ausentismo/detalle/${item.guardiaId}?from=${from}&to=${to}`, { cache: "no-store" });
      const payload = await res.json();
      if (payload.success) setDetails(payload.data.items);
    } catch { /* silent */ } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadDetail();
  };

  const badge = rateBadge(item.rate);

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors group"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

        <span className="text-sm font-medium truncate min-w-0 flex-1 group-hover:text-primary transition-colors">
          {item.name}
        </span>

        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block w-24 truncate">
          {item.rut}
        </span>

        <span className="text-[10px] text-muted-foreground shrink-0 hidden md:block w-28 truncate">
          {item.installation}
        </span>

        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-right">
          {item.absenceCount}/{item.totalShifts}
        </span>

        <span className={`text-sm font-semibold tabular-nums shrink-0 w-14 text-right ${rateColor(item.rate)}`}>
          {item.rate}%
        </span>

        <span className={`flex items-center gap-0.5 shrink-0 w-12 justify-end text-[11px] font-medium ${
          item.trendDiff > 0 ? "text-status-danger-fg" : item.trendDiff < 0 ? "text-status-ok-fg" : "text-muted-foreground"
        }`}>
          {item.trendDiff > 0 ? <TrendingUp className="h-3 w-3" /> : item.trendDiff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {item.trendDiff !== 0 ? Math.abs(item.trendDiff) : ""}
        </span>

        <Badge variant={badge.variant} className="text-[9px] px-1.5 py-0 shrink-0 hidden lg:inline-flex">
          {badge.label}
        </Badge>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-2">
                  <Spinner size="sm" />
                </div>
              ) : details.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Sin registros de detalle</p>
              ) : (
                <div className="space-y-1">
                  {details.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 rounded-md border border-border/40 px-2.5 py-1.5 text-xs">
                      <span className="text-muted-foreground w-20 shrink-0">
                        {new Date(d.date).toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      </span>
                      <span className="truncate flex-1">{d.installation}</span>
                      <span className="text-muted-foreground truncate max-w-32">{d.puesto}</span>
                      <span className="text-muted-foreground shrink-0">{d.shift}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── main ── */

export function TeAusentismoRanking() {
  const { year: yCL, month: mCL } = currentYearMonthInChile();
  const [from, setFrom] = useState(
    `${yCL}-${String(mCL).padStart(2, "0")}-01`,
  );
  const [to, setTo] = useState(todayInChile());
  const [data, setData] = useState<AusentismoData | null>(null);
  const [loading, setLoading] = useState(true);
  const rankingRef = useRef<HTMLDivElement>(null);

  const scrollToRanking = () => {
    rankingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/ausentismo/ranking?from=${from}&to=${to}`, { cache: "no-store" });
      const payload = await res.json();
      if (payload.success) setData(payload.data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return (
    <div className="space-y-5">
      <TePeriodSelector from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* KPI cards — all clickable, scroll to ranking */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={scrollToRanking}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total faltas</p>
                <p className={`text-2xl font-bold tabular-nums ${data && data.totalAbsences > 0 ? "text-status-danger-fg" : "text-foreground"}`}>
                  {data?.totalAbsences ?? "–"}
                </p>
                <p className="text-[11px] text-muted-foreground">de {data?.totalPlannedShifts ?? 0} turnos · click ver ranking</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2"><UserX className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={scrollToRanking}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">% Ausentismo</p>
                <p className={`text-2xl font-bold tabular-nums ${
                  data && data.absenteeismRate >= 10 ? "text-status-danger-fg" : data && data.absenteeismRate >= 5 ? "text-status-warn-fg" : "text-status-ok-fg"
                }`}>
                  {data ? `${data.absenteeismRate}%` : "–"}
                </p>
                <p className="text-[11px] text-muted-foreground">tasa del período · click ver ranking</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2"><AlertTriangle className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={scrollToRanking}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Sin faltas</p>
                <p className="text-2xl font-bold tabular-nums text-status-ok-fg">
                  {data?.guardsWithZeroAbsences ?? "–"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {data ? `de ${data.totalGuardsWithShifts} guardias con turnos` : ""}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2"><Award className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={scrollToRanking}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Guardias con faltas</p>
                <p className="text-2xl font-bold tabular-nums">
                  {data?.rankings.length ?? "–"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {data && data.totalGuardsWithShifts > 0
                    ? `${Math.round((data.rankings.length / data.totalGuardsWithShifts) * 100)}% del total · click ver ranking`
                    : ""}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2"><Users className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking table */}
      <Card ref={rankingRef}>
        <CardHeader className="pb-1 px-4 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Ranking de Ausentismo</CardTitle>
            <span className="text-[11px] text-muted-foreground">
              {data?.rankings.length ?? 0} guardias con faltas
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : !data || data.rankings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground gap-1">
              <Award className="h-6 w-6 opacity-40" />
              <p>Sin faltas en el período seleccionado</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium border-b border-border/40">
                <span className="w-3.5" />
                <span className="flex-1">Guardia</span>
                <span className="w-24 hidden sm:block">RUT</span>
                <span className="w-28 hidden md:block">Instalación</span>
                <span className="w-10 text-right">Faltas</span>
                <span className="w-14 text-right">% Aus.</span>
                <span className="w-12 text-right">Tend.</span>
                <span className="w-12 hidden lg:block" />
              </div>
              {data.rankings.map((item) => (
                <RankingRow key={item.guardiaId} item={item} from={from} to={to} />
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
