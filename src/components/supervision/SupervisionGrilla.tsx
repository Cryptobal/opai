"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { SupervisionFindingsPanel } from "./SupervisionFindingsPanel";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Installation = { id: string; name: string; openFindings: number; totalVisits: number };

type DayVisit = {
  count: number;
  supervisors: string[];
  initials: string;
};

type GrillaData = {
  year: number;
  month: number;
  daysInMonth: number;
  installations: Installation[];
  visitsByInstallationDay: Record<string, Record<number, DayVisit>>;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_NAMES = ["D", "L", "M", "X", "J", "V", "S"];

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getDay();
}

/* ------------------------------------------------------------------ */
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

function CellTooltip({
  visit,
  anchorRect,
}: {
  visit: DayVisit;
  anchorRect: DOMRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const tt = ref.current.getBoundingClientRect();
    let top = anchorRect.top - tt.height - 6;
    let left = anchorRect.left + anchorRect.width / 2 - tt.width / 2;

    // Keep within viewport
    if (top < 4) top = anchorRect.bottom + 6;
    if (left < 4) left = 4;
    if (left + tt.width > window.innerWidth - 4)
      left = window.innerWidth - tt.width - 4;

    setPos({ top, left });
  }, [anchorRect]);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      style={{ top: pos.top, left: pos.left }}
    >
      <p className="font-medium">
        {visit.count} visita{visit.count > 1 ? "s" : ""}
      </p>
      {visit.supervisors.map((s, i) => (
        <p key={i} className="text-muted-foreground">
          {s}
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function SupervisionGrilla({
  year: initialYear,
  month: initialMonth,
}: {
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [data, setData] = useState<GrillaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  // Sort state
  const [sortMode, setSortMode] = useState<"az" | "most" | "least">("az");

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    visit: DayVisit;
    rect: DOMRect;
  } | null>(null);

  // Findings side panel state
  const [findingsPanel, setFindingsPanel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/supervision/grilla?year=${y}&month=${m}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json.data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(year, month);
  }, [year, month, fetchData]);

  function goPrev() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goNext() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const today = useMemo(() => new Date(), []);
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth() + 1;
  const todayDate = today.getDate();

  const days = data ? Array.from({ length: data.daysInMonth }, (_, i) => i + 1) : [];

  const sortedInstallations = useMemo(() => {
    if (!data) return [];
    const list = [...data.installations];
    switch (sortMode) {
      case "most": return list.sort((a, b) => b.totalVisits - a.totalVisits);
      case "least": return list.sort((a, b) => a.totalVisits - b.totalVisits);
      default: return list;
    }
  }, [data, sortMode]);

  return (
    <div className="space-y-3">
      {/* Month selector */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[160px] text-center text-sm font-medium">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          <Button variant={sortMode === "az" ? "default" : "outline"} size="sm" className="h-7 px-2 text-xs" onClick={() => setSortMode("az")}>A-Z</Button>
          <Button variant={sortMode === "most" ? "default" : "outline"} size="sm" className="h-7 px-2 text-xs" onClick={() => setSortMode("most")}>{"\u2191"} Vis</Button>
          <Button variant={sortMode === "least" ? "default" : "outline"} size="sm" className="h-7 px-2 text-xs" onClick={() => setSortMode("least")}>{"\u2193"} Vis</Button>
        </div>
      </div>

      {/* Grid */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.installations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay instalaciones asignadas.
          </CardContent>
        </Card>
      ) : data ? (
        <div className="relative overflow-x-auto rounded-md border">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="sticky left-0 z-20 min-w-[150px] bg-muted/50 px-3 py-2 text-left font-medium">
                  Instalación
                </th>
                {days.map((d) => {
                  const dow = getDayOfWeek(year, month, d);
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = isCurrentMonth && d === todayDate;
                  return (
                    <th
                      key={d}
                      className={`min-w-[32px] px-0.5 py-1 text-center font-normal ${
                        isWeekend ? "text-muted-foreground/60" : ""
                      }`}
                    >
                      <div
                        className={`mx-auto flex h-7 w-7 flex-col items-center justify-center rounded-full text-[10px] leading-tight ${
                          isToday
                            ? "bg-primary text-primary-foreground font-semibold"
                            : ""
                        }`}
                      >
                        <span>{DAY_NAMES[dow]}</span>
                        <span className="font-medium">{d}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="min-w-[40px] px-2 py-2 text-center font-medium">
                  Hall.
                </th>
                <th className="min-w-[40px] px-2 py-2 text-center font-medium">
                  Vis.
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedInstallations.map((inst, idx) => {
                const instVisits = data.visitsByInstallationDay[inst.id] ?? {};
                return (
                  <tr
                    key={inst.id}
                    className={`border-b transition-colors hover:bg-muted/30 ${
                      idx % 2 === 0 ? "" : "bg-muted/10"
                    }`}
                  >
                    <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium">
                      <span className="line-clamp-1" title={inst.name}>
                        {inst.name}
                      </span>
                    </td>
                    {days.map((d) => {
                      const visit = instVisits[d];
                      const dow = getDayOfWeek(year, month, d);
                      const isWeekend = dow === 0 || dow === 6;

                      if (!visit) {
                        return (
                          <td
                            key={d}
                            className={`px-0.5 py-1 text-center ${
                              isWeekend ? "bg-muted/20" : ""
                            }`}
                          >
                            <span className="text-muted-foreground/30">·</span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={d}
                          className={`px-0.5 py-1 text-center ${
                            isWeekend ? "bg-muted/20" : ""
                          }`}
                          onMouseEnter={(e) => {
                            const rect = (
                              e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            setTooltip({ visit, rect });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <span
                            className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-md text-[10px] font-semibold ${
                              visit.count === 1
                                ? "bg-status-ok-soft text-status-ok-fg"
                                : "bg-status-info-soft text-status-info-fg"
                            }`}
                          >
                            {visit.count === 1 ? visit.initials : visit.count}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center">
                      {inst.openFindings > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setFindingsPanel({ id: inst.id, name: inst.name })
                          }
                          className="inline-flex items-center justify-center rounded-md p-1 -m-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={`Ver ${inst.openFindings} hallazgo${inst.openFindings > 1 ? "s" : ""} de ${inst.name}`}
                        >
                          <Badge
                            variant="destructive"
                            className="h-5 min-w-[20px] cursor-pointer justify-center px-1.5 text-[10px]"
                          >
                            {inst.openFindings}
                          </Badge>
                        </button>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                      {inst.totalVisits}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Tooltip portal */}
      {tooltip && (
        <CellTooltip visit={tooltip.visit} anchorRect={tooltip.rect} />
      )}

      {/* Findings side panel */}
      <SupervisionFindingsPanel
        installation={findingsPanel}
        onClose={() => setFindingsPanel(null)}
        onChanged={() => void fetchData(year, month)}
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-6 rounded bg-status-ok-soft text-center text-[10px] font-semibold text-status-ok-fg">
            AB
          </span>
          1 visita (iniciales)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-6 rounded bg-status-info-soft text-center text-[10px] font-semibold text-status-info-fg">
            3
          </span>
          Múltiples visitas
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="destructive" className="h-4 px-1 text-[10px]">
            2
          </Badge>
          Hallazgos abiertos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground/30">·</span>
          Sin visita
        </span>
      </div>
    </div>
  );
}
