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
  ChevronRight,
  X,
  QrCode,
  ScanLine,
  Keyboard,
} from "lucide-react";
import EsperadosHoySection from "./EsperadosHoySection";
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
import { authFetch } from "../../_lib/authFetch";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-4 w-4" />,
  provider: <Truck className="h-4 w-4" />,
  vehicle: <Car className="h-4 w-4" />,
  staff: <BadgeCheck className="h-4 w-4" />,
  delivery: <Package className="h-4 w-4" />,
};

const TYPE_ICON_TONE: Record<AccessRecordType, string> = {
  visit: "bg-status-info-soft text-status-info-fg",
  provider: "bg-status-warn-soft text-status-warn-fg",
  vehicle: "bg-tint-violet text-tint-violet-fg",
  staff: "bg-status-ok-soft text-status-ok-fg",
  delivery: "bg-status-warn-soft text-status-warn-fg",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface InicioTabProps {
  installationId: string;
  installationName: string;
  guardName: string;
  deviceToken?: string;
  onQuickEntry?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InicioTab({
  installationId,
  installationName,
  guardName,
  deviceToken,
  onQuickEntry,
}: InicioTabProps) {
  const [stats, setStats] = useState<AccessControlStats | null>(null);
  const [recentRecords, setRecentRecords] = useState<AccessControlRecordData[]>([]);
  const [alerts, setAlerts] = useState<AccessControlRecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<AccessControlRecordData | null>(null);
  const [search, setSearch] = useState("");
  const [esperados, setEsperados] = useState({ pending: 0, total: 0 });

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, recordsRes] = await Promise.all([
        authFetch(
          `/api/access-control/records/${installationId}/stats`,
          undefined,
          deviceToken,
        ),
        authFetch(
          `/api/access-control/records/${installationId}?limit=10`,
          undefined,
          deviceToken,
        ),
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

      const preRes = await authFetch(
        `/api/access-control/preregistrations/${installationId}/today`,
        undefined,
        deviceToken,
      );
      const preJson = preRes.ok ? await preRes.json() : { success: false };
      if (preJson.success) {
        const list = (preJson.data ?? []) as { status?: string }[];
        setEsperados({
          total: list.length,
          pending: list.filter((p) => p.status === "pending").length,
        });
      }
    } catch {
      // Silently fail - could be offline
    } finally {
      setLoading(false);
    }
  }, [installationId, deviceToken]);

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
        <div className="rounded-xl border border-border bg-card opai-glass-soft-m p-5 animate-pulse">
          <div className="h-5 bg-muted rounded w-2/3 mb-2" />
          <div className="h-4 bg-muted rounded w-1/2" />
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

  const inSiteNow = recentRecords.filter((r) => !r.exitAt);
  const q = search.trim().toLowerCase();
  const filteredRecords = q
    ? recentRecords.filter((r) =>
        [r.fullName, r.vehiclePlate, r.rut, r.company]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : recentRecords;

  const scanMethods = [
    { id: "qr", label: "Cédula QR", icon: QrCode },
    { id: "ocr", label: "OCR", icon: ScanLine },
    { id: "plate", label: "Patente", icon: Car },
    { id: "manual", label: "Manual", icon: Keyboard },
  ] as const;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-5">
        <div className="rounded-xl border border-status-info-border bg-status-info-soft p-5">
          <p className="text-lg font-semibold text-status-info-fg">
            {greeting}, {guardName.split(" ")[0]}
          </p>
          <p className="mt-1 text-sm text-ds-text-3">{installationName}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            value={stats?.currentlyInSite ?? 0}
            label="En sitio"
            icon={<Users className="h-5 w-5" />}
            tone="info"
          />
          <MetricCard
            value={stats?.totalEntriesToday ?? 0}
            label="Ingresos hoy"
            icon={<ArrowUpRight className="h-5 w-5" />}
            tone="ok"
          />
          <MetricCard
            value={`${esperados.pending}/${esperados.total}`}
            label="Esperados"
            icon={<Clock className="h-5 w-5" />}
            tone="warn"
          />
        </div>

        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, RUT o patente"
            className="h-[52px] w-full rounded-xl border border-ds-border-default bg-ds-surface-2 px-4 text-sm text-ds-text-1 outline-none placeholder:text-ds-text-4 focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {scanMethods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={onQuickEntry}
              className="flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-2xl border border-ds-border-default bg-ds-surface-1 text-[12px] font-medium text-ds-text-2 active:scale-[0.97]"
            >
              <m.icon className="h-6 w-6 text-primary" />
              {m.label}
            </button>
          ))}
        </div>

        {alerts.length > 0 && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-status-warn-fg">
              <AlertTriangle className="h-4 w-4" />
              Alertas de permanencia
            </h3>
            {alerts.map((record) => {
              const elapsed = elapsedMinutes(record.entryAt);
              return (
                <div
                  key={record.id}
                  className="flex items-center gap-3 rounded-lg border border-status-warn-border bg-status-warn-soft p-3"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-status-warn-fg mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ds-text-1 break-words">
                      {record.fullName || record.vehiclePlate || "Sin identificar"}
                    </p>
                    <p className="text-sm text-ds-text-3">
                      Lleva {formatDuration(elapsed)} en sitio
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-status-warn-border bg-status-warn-soft text-status-warn-fg text-xs"
                  >
                    {formatDuration(elapsed)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ds-text-1">
            <Activity className="h-4 w-4 text-status-info-fg" />
            Actividad reciente
          </h3>

          {filteredRecords.length === 0 ? (
            <div className="rounded-xl border border-ds-border-default bg-ds-surface-1 p-8 text-center opai-glass-soft-m">
              <Clock className="mx-auto h-8 w-8 text-ds-text-4" />
              <p className="mt-2 text-sm text-ds-text-3">
                {q ? "Sin resultados" : "No hay actividad reciente"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredRecords.map((record) => {
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
                    className="flex w-full items-center gap-3 rounded-lg border border-ds-border-default bg-ds-surface-1 p-3 text-left opai-glass-soft-m active:bg-ds-surface-2"
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TYPE_ICON_TONE[record.recordType] ?? "bg-ds-surface-2 text-ds-text-2"}`}
                    >
                      {TYPE_ICONS[record.recordType]}
                    </div>
                    <div className="shrink-0">
                      {isEntry ? (
                        <ArrowUpRight className="h-4 w-4 text-status-ok-fg" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4 text-status-warn-fg" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ds-text-1 break-words">
                        {record.fullName || record.vehiclePlate || "Sin identificar"}
                      </p>
                      <p className="text-sm text-ds-text-3 break-words">
                        {record.company || tc.label}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[12px] font-medium tabular-nums text-ds-text-3">
                        {timeStr}
                      </p>
                      <Badge
                        variant="outline"
                        className={`mt-0.5 text-xs px-1.5 py-0 ${
                          isEntry
                            ? "border-status-ok-border text-status-ok-fg"
                            : "border-status-warn-border text-status-warn-fg"
                        }`}
                      >
                        {isEntry ? "Entrada" : "Salida"}
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </div>

        <div className="space-y-5">
          <EsperadosHoySection installationId={installationId} deviceToken={deviceToken} />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-ds-text-1">En sitio ahora</h3>
            {inSiteNow.length === 0 ? (
              <p className="text-sm text-ds-text-3">Nadie en sitio</p>
            ) : (
              inSiteNow.slice(0, 8).map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between rounded-lg border border-ds-border-default bg-ds-surface-1 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ds-text-1">
                      {record.fullName || record.vehiclePlate || "Sin identificar"}
                    </p>
                    <p className="text-[12px] text-ds-text-3">{record.company}</p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-ds-text-2">
                    {formatDuration(elapsedMinutes(record.entryAt))}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Record Detail Modal ────────────────────────────────────── */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-t-2xl border-t border-border bg-card opai-glass-strong-m p-5 pb-8 animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">
                Detalle del Registro
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Detail content */}
            <div className="space-y-3">
              {/* Type badge */}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${TYPE_ICON_TONE[selectedRecord.recordType] ?? "bg-ds-surface-2 text-ds-text-2"}`}
                >
                  {TYPE_ICONS[selectedRecord.recordType]}
                </div>
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground"
                >
                  {RECORD_TYPE_CONFIG[selectedRecord.recordType]?.label ?? selectedRecord.recordType}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    selectedRecord.exitAt
                      ? "border-status-warn-border text-status-warn-fg"
                      : "border-status-ok-border text-status-ok-fg"
                  }
                >
                  {selectedRecord.exitAt ? "Salida registrada" : "En sitio"}
                </Badge>
              </div>

              {/* Fields */}
              <div className="grid gap-2 rounded-lg border border-border bg-muted p-4">
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
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}
