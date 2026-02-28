"use client";

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
import { HubCompactStat } from "./HubCompactStat";
import { HubCollapsibleSection } from "./HubCollapsibleSection";
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

export function HubSupervisionSection({
  metrics,
}: HubSupervisionSectionProps) {
  const {
    visitasMonth,
    visitasCompleted,
    openFindings,
    avgRating,
    coveragePct,
    recentVisits,
  } = metrics;

  const coverageBarColor =
    coveragePct >= 80
      ? "bg-emerald-500"
      : coveragePct >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <HubCollapsibleSection
      icon={<Shield className="h-4 w-4" />}
      title="Supervisión"
      badge={
        <Badge variant="outline" className="text-[10px]">
          {visitasMonth} visitas
        </Badge>
      }
    >
      {/* KPI Cards 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        <HubKpiLinkCard
          href="/ops/supervision?period=month"
          title="Visitas del mes"
          value={visitasMonth}
          icon={<MapPin className="h-4 w-4" />}
          variant="blue"
        />
        <HubKpiLinkCard
          href="/ops/supervision?period=month"
          title="Completadas"
          value={visitasCompleted}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant="emerald"
        />
        <HubKpiLinkCard
          href="/ops/supervision"
          title="Hallazgos abiertos"
          value={openFindings}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant="amber"
          alert={openFindings > 0}
        />
        <HubKpiLinkCard
          href="/ops/supervision"
          title="Calificación promedio"
          value={avgRating?.toFixed(1) ?? "—"}
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
            <span>{coveragePct}% cobertura</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${coverageBarColor}`}
              style={{ width: `${Math.min(coveragePct, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Recent visits */}
      {recentVisits.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2">Visitas recientes</p>
          <div className="space-y-2">
            {recentVisits.slice(0, 3).map((visit) => (
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
