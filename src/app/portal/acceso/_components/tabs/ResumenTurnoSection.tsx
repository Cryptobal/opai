"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ClipboardList,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Car,
  UserPlus,
  Truck,
  BadgeCheck,
  Package,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MetricCard from "../ui/MetricCard";
import SkeletonCard from "../ui/SkeletonCard";
import {
  RECORD_TYPE_CONFIG,
  type AccessRecordType,
  type AccessControlStats,
} from "@/lib/access-control/types";
import { formatDuration } from "@/lib/access-control/utils";
import { authFetch } from "../../_lib/authFetch";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-4 w-4" />,
  provider: <Truck className="h-4 w-4" />,
  vehicle: <Car className="h-4 w-4" />,
  staff: <BadgeCheck className="h-4 w-4" />,
  delivery: <Package className="h-4 w-4" />,
};

const TYPE_COLORS: Record<AccessRecordType, string> = {
  visit: "border-status-info-border bg-status-info-soft text-status-info-fg",
  provider: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
  vehicle: "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg",
  staff: "border-status-ok-border bg-status-ok-soft text-status-ok-fg",
  delivery: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface ResumenTurnoSectionProps {
  installationId: string;
  guardId: string;
  guardName: string;
  deviceToken?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ResumenTurnoSection({
  installationId,
  guardId,
  guardName,
  deviceToken,
}: ResumenTurnoSectionProps) {
  const [stats, setStats] = useState<AccessControlStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [shiftStart] = useState(() => new Date());

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(
        `/api/access-control/records/${installationId}/stats`,
        undefined,
        deviceToken,
      );
      const json = await res.json();
      if (json.success) {
        setStats(json.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [installationId, deviceToken]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-48 rounded bg-[#1F2937] animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  const shiftTimeStr = shiftStart.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#F9FAFB]">
          <ClipboardList className="h-5 w-5 text-[#06B6D4]" />
          Resumen del Turno
        </h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Guardia: {guardName} — Inicio: {shiftTimeStr}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          value={stats?.totalEntriesToday ?? 0}
          label="Entradas Hoy"
          icon={<ArrowUpRight className="h-5 w-5" />}
          color="#10B981"
        />
        <MetricCard
          value={stats?.totalExitsToday ?? 0}
          label="Salidas Hoy"
          icon={<ArrowDownLeft className="h-5 w-5" />}
          color="#F59E0B"
        />
        <MetricCard
          value={stats?.currentlyInSite ?? 0}
          label="En Sitio"
          icon={<Users className="h-5 w-5" />}
          color="#06B6D4"
        />
        <MetricCard
          value={
            stats?.averageStayMinutes
              ? formatDuration(stats.averageStayMinutes)
              : "--"
          }
          label="Prom. Estadía"
          icon={<Timer className="h-5 w-5" />}
          color="#A855F7"
        />
      </div>

      {/* Breakdown by type */}
      {stats?.byType && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-[#F9FAFB]">
            Desglose por Tipo
          </h3>
          <div className="space-y-2">
            {(Object.keys(stats.byType) as AccessRecordType[])
              .filter((type) => stats.byType[type] > 0)
              .map((type) => {
                const tc = RECORD_TYPE_CONFIG[type] ?? { label: type, icon: "UserPlus", color: "blue" };
                const count = stats.byType[type];
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between rounded-lg border border-[#374151] bg-[#111827] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`flex items-center gap-1 ${TYPE_COLORS[type]}`}
                      >
                        {TYPE_ICONS[type]}
                        {tc.label}
                      </Badge>
                    </div>
                    <span className="text-lg font-bold text-[#F9FAFB]">
                      {count}
                    </span>
                  </div>
                );
              })}

            {Object.values(stats.byType).every((v) => v === 0) && (
              <p className="text-center text-sm text-[#9CA3AF] py-4">
                Sin registros por tipo
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
