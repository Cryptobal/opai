"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  AlertTriangle,
  Star,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { HubKpiLinkCard } from "./HubKpiLinkCard";
import { HubCollapsibleSection } from "./HubCollapsibleSection";
import { HubVisitHeatmap } from "./charts/HubVisitHeatmap";
import type { SupervisionMetrics } from "../_lib/hub-types";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const dateFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
});

interface HubSupervisionSectionProps {
  metrics: SupervisionMetrics;
}

type Period = "week" | "month";

export function HubSupervisionSection({
  metrics,
}: HubSupervisionSectionProps) {
  const [period, setPeriod] = useState<Period>("week");
  const data = period === "week" ? metrics.week : metrics.month;

  const coverageBarColor =
    data.coveragePct >= 80
      ? "bg-emerald-500"
      : data.coveragePct >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <HubCollapsibleSection
      icon={<Shield className="h-4 w-4" />}
      title="Supervisión"
      badge={
        <Badge variant="outline" className="text-[10px]">
          {data.visitas} visitas
        </Badge>
      }
    >
      {/* Period toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setPeriod("week")}
          className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
            period === "week"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Semana
        </button>
        <button
          type="button"
          onClick={() => setPeriod("month")}
          className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
            period === "month"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Mes
        </button>
      </div>

      {/* KPI Cards 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        <HubKpiLinkCard
          href="/ops/supervision?period=month"
          title={period === "week" ? "Visitas (7d)" : "Visitas del mes"}
          value={data.visitas}
          icon={<MapPin className="h-4 w-4" />}
          variant="blue"
        />
        <HubKpiLinkCard
          href="/ops/supervision?period=month"
          title="Completadas"
          value={data.completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant="emerald"
        />
        <HubKpiLinkCard
          href="/ops/supervision"
          title="Hallazgos abiertos"
          value={metrics.openFindings}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant="amber"
          alert={metrics.openFindings > 0}
        />
        <HubKpiLinkCard
          href="/ops/supervision"
          title="Calificación promedio"
          value={data.avgRating?.toFixed(1) ?? "—"}
          icon={<Star className="h-4 w-4" />}
          variant="teal"
        />
      </div>

      {/* Coverage progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">Cobertura</p>
          <Link
            href="/ops/supervision"
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Ver supervisión
          </Link>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{data.coveragePct}% cobertura</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${coverageBarColor}`}
              style={{ width: `${Math.min(data.coveragePct, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Visit heatmap */}
      <HubVisitHeatmap />

      {/* Recent visits */}
      {data.recentVisits.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2">Visitas recientes</p>
          <div className="space-y-2">
            {data.recentVisits.slice(0, 3).map((visit) => (
              <Link
                key={visit.id}
                href={`/ops/supervision/${visit.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-accent/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    {visit.installationName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {dateFmt.format(new Date(visit.checkInAt))}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`ml-2 shrink-0 text-[10px] ${
                    visit.status === "completed"
                      ? "text-emerald-500 border-emerald-500/30"
                      : visit.status === "cancelled"
                        ? "text-red-500 border-red-500/30"
                        : "text-amber-500 border-amber-500/30"
                  }`}
                >
                  {STATUS_LABELS[visit.status] ?? visit.status}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </HubCollapsibleSection>
  );
}
