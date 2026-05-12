"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  UserPlus,
  Truck,
  Car,
  BadgeCheck,
  Package,
  Clock,
  AlertTriangle,
  Activity,
  Timer,
  ChevronRight,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MetricCard from "../ui/MetricCard";
import SkeletonCard from "../ui/SkeletonCard";
import PullToRefresh from "../ui/PullToRefresh";
import {
  RECORD_TYPE_CONFIG,
  type AccessRecordType,
  type AccessControlStats,
  type AccessControlRecordData,
} from "@/lib/access-control/types";
import {
  formatDuration,
  elapsedMinutes,
  formatRut,
} from "@/lib/access-control/utils";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-4 w-4" />,
  provider: <Truck className="h-4 w-4" />,
  vehicle: <Car className="h-4 w-4" />,
  staff: <BadgeCheck className="h-4 w-4" />,
  delivery: <Package className="h-4 w-4" />,
};

const TYPE_ICON_COLORS: Record<AccessRecordType, string> = {
  visit: "#3B82F6",
  provider: "#F97316",
  vehicle: "#A855F7",
  staff: "#10B981",
  delivery: "#F59E0B",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface InicioTabProps {
  installationId: string;
  installationName: string;
  guardName: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InicioTab({
  installationId,
  installationName,
  guardName,
}: InicioTabProps) {
  const [stats, setStats] = useState<AccessControlStats | null>(null);
  const [recentRecords, setRecentRecords] = useState<AccessControlRecordData[]>([]);
  const [alerts, setAlerts] = useState<AccessControlRecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<AccessControlRecordData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, recordsRes] = await Promise.all([
        fetch(`/api/access-control/records/${installationId}/stats`),
        fetch(`/api/access-control/records/${installationId}?limit=10`),
      ]);

      const statsJson = statsRes.ok ? await statsRes.json() : { success: false };
      const recordsJson = recordsRes.ok ? await recordsRes.json() : { success: false };

      if (statsJson.success) {
        setStats(statsJson.data);
      }

      if (recordsJson.success) {
        const records: AccessControlRecordData[] = recordsJson.data.records ?? recordsJson.data;
        setRecentRecords(records);

        // Filter alerts: people still in site who exceed max stay hours
        const inSiteAlerts = records.filter((r) => {
          if (r.exitAt) return false;
          const elapsed = elapsedMinutes(r.entryAt);
          return elapsed > 480; // 8 hours default threshold
        });
        setAlerts(inSiteAlerts);
      }
    } catch {
      // Silently fail - could be offline
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Greeting based on time
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Buenos dias" : hour < 18 ? "Buenas tardes" : "Buenas noches";

  // ── Skeleton Loading ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Greeting skeleton */}
        <div className="rounded-xl border border-[#374151] bg-[#111827] p-5 animate-pulse">
          <div className="h-5 bg-[#1F2937] rounded w-2/3 mb-2" />
          <div className="h-4 bg-[#1F2937] rounded w-1/2" />
        </div>

        {/* Metric cards skeleton */}
        <div className="grid grid-cols-3 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        {/* Activity skeleton */}
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-5">
        {/* ── Greeting Banner ──────────────────────────────────────── */}
        <div className="rounded-xl bg-status-info-soft border border-status-info-border p-5">
          <p className="text-lg font-semibold text-status-info-fg">
            {greeting}, {guardName.split(" ")[0]}
          </p>
          <p className="mt-1 text-sm text-[#9CA3AF]">{installationName}</p>
        </div>

        {/* ── Metric Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            value={stats?.currentlyInSite ?? 0}
            label="En Sitio ahora"
            icon={<Users className="h-5 w-5" />}
            color="#06B6D4"
          />
          <MetricCard
            value={stats?.totalEntriesToday ?? 0}
            label="Entradas Hoy"
            icon={<ArrowUpRight className="h-5 w-5" />}
            color="#10B981"
          />
          <MetricCard
            value={
              stats?.averageStayMinutes
                ? formatDuration(stats.averageStayMinutes)
                : "--"
            }
            label="Promedio registro"
            icon={<Timer className="h-5 w-5" />}
            color="#F59E0B"
          />
        </div>

        {/* ── Alerts ───────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-[#F59E0B]">
              <AlertTriangle className="h-4 w-4" />
              Alertas de permanencia
            </h3>
            {alerts.map((record) => {
              const elapsed = elapsedMinutes(record.entryAt);
              return (
                <div
                  key={record.id}
                  className="flex items-center gap-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B] mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#F9FAFB] break-words">
                      {record.fullName || record.vehiclePlate || "Sin identificar"}
                    </p>
                    <p className="text-sm text-[#9CA3AF]">
                      Lleva {formatDuration(elapsed)} en sitio
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B] text-xs"
                  >
                    {formatDuration(elapsed)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Recent Activity Timeline ─────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#F9FAFB]">
            <Activity className="h-4 w-4 text-[#06B6D4]" />
            Actividad reciente
          </h3>

          {recentRecords.length === 0 ? (
            <div className="rounded-xl border border-[#374151] bg-[#111827] p-8 text-center">
              <Clock className="mx-auto h-8 w-8 text-[#374151]" />
              <p className="mt-2 text-sm text-[#9CA3AF]">
                No hay actividad reciente
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentRecords.map((record) => {
                const isEntry = !record.exitAt;
                const tc = RECORD_TYPE_CONFIG[record.recordType] ?? { label: record.recordType, icon: "UserPlus", color: "blue" };
                const timeStr = new Date(
                  record.exitAt || record.entryAt
                ).toLocaleTimeString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedRecord(record)}
                    className="flex w-full items-center gap-3 rounded-lg border border-[#374151] bg-[#111827] p-3 text-left transition-colors active:bg-[#1F2937]"
                  >
                    {/* Type icon */}
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: `${TYPE_ICON_COLORS[record.recordType]}15`,
                        color: TYPE_ICON_COLORS[record.recordType],
                      }}
                    >
                      {TYPE_ICONS[record.recordType]}
                    </div>

                    {/* Entry/Exit arrow */}
                    <div className="shrink-0">
                      {isEntry ? (
                        <ArrowUpRight className="h-4 w-4 text-[#10B981]" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4 text-[#F59E0B]" />
                      )}
                    </div>

                    {/* Name and details */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#F9FAFB] break-words">
                        {record.fullName || record.vehiclePlate || "Sin identificar"}
                      </p>
                      <p className="text-sm text-[#9CA3AF] break-words">
                        {record.company || tc.label}
                      </p>
                    </div>

                    {/* Time */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-[#9CA3AF]">
                        {timeStr}
                      </p>
                      <Badge
                        variant="outline"
                        className={`mt-0.5 text-xs px-1.5 py-0 ${
                          isEntry
                            ? "border-[#10B981]/30 text-[#10B981]"
                            : "border-[#F59E0B]/30 text-[#F59E0B]"
                        }`}
                      >
                        {isEntry ? "Entrada" : "Salida"}
                      </Badge>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-[#374151]" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Record Detail Modal ────────────────────────────────────── */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-t-2xl border-t border-[#374151] bg-[#111827] p-5 pb-8 animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#F9FAFB]">
                Detalle del Registro
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="rounded-full p-1 text-[#9CA3AF] hover:bg-[#1F2937] hover:text-[#F9FAFB]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Detail content */}
            <div className="space-y-3">
              {/* Type badge */}
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: `${TYPE_ICON_COLORS[selectedRecord.recordType]}15`,
                    color: TYPE_ICON_COLORS[selectedRecord.recordType],
                  }}
                >
                  {TYPE_ICONS[selectedRecord.recordType]}
                </div>
                <Badge
                  variant="outline"
                  className="border-[#374151] text-[#9CA3AF]"
                >
                  {RECORD_TYPE_CONFIG[selectedRecord.recordType]?.label ?? selectedRecord.recordType}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    selectedRecord.exitAt
                      ? "border-[#F59E0B]/30 text-[#F59E0B]"
                      : "border-[#10B981]/30 text-[#10B981]"
                  }
                >
                  {selectedRecord.exitAt ? "Salida registrada" : "En sitio"}
                </Badge>
              </div>

              {/* Fields */}
              <div className="grid gap-2 rounded-lg border border-[#374151] bg-[#0A0F1C] p-4">
                {selectedRecord.fullName && (
                  <DetailRow label="Nombre" value={selectedRecord.fullName} />
                )}
                {selectedRecord.rut && (
                  <DetailRow label="RUT" value={formatRut(selectedRecord.rut)} />
                )}
                {selectedRecord.company && (
                  <DetailRow label="Empresa" value={selectedRecord.company} />
                )}
                {selectedRecord.vehiclePlate && (
                  <DetailRow label="Patente" value={selectedRecord.vehiclePlate} />
                )}
                <DetailRow
                  label="Entrada"
                  value={new Date(selectedRecord.entryAt).toLocaleString("es-CL", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                />
                {selectedRecord.exitAt && (
                  <DetailRow
                    label="Salida"
                    value={new Date(selectedRecord.exitAt).toLocaleString("es-CL", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  />
                )}
                {selectedRecord.exitAt && (
                  <DetailRow
                    label="Duracion"
                    value={formatDuration(
                      elapsedMinutes(selectedRecord.entryAt, selectedRecord.exitAt)
                    )}
                  />
                )}
                {!selectedRecord.exitAt && (
                  <DetailRow
                    label="Tiempo en sitio"
                    value={formatDuration(elapsedMinutes(selectedRecord.entryAt))}
                  />
                )}
                {selectedRecord.entryObservations && (
                  <DetailRow
                    label="Observaciones"
                    value={selectedRecord.entryObservations}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}

// ── Detail Row Helper ───────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-[#9CA3AF] shrink-0">{label}</span>
      <span className="text-sm text-[#F9FAFB] text-right">{value}</span>
    </div>
  );
}
