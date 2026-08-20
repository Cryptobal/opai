"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  Car,
  Search,
  LogOut,
  Loader2,
  Clock,
  RefreshCw,
  UserPlus,
  Truck,
  BadgeCheck,
  Package,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import SkeletonCard from "../ui/SkeletonCard";
import SwipeAction from "../ui/SwipeAction";
import {
  RECORD_TYPE_CONFIG,
  type AccessRecordType,
} from "@/lib/access-control/types";
import {
  formatRut,
  formatDuration,
  elapsedMinutes,
  stayDurationColor,
} from "@/lib/access-control/utils";
import { authFetch } from "../../_lib/authFetch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

// ── Types ───────────────────────────────────────────────────────────────────

interface InSiteRecord {
  id: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  entryAt: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
}

type FilterType = "all" | "visit" | "provider" | "vehicle";
type FilterTime = "all" | "4h" | "8h";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-3.5 w-3.5" />,
  provider: <Truck className="h-3.5 w-3.5" />,
  vehicle: <Car className="h-3.5 w-3.5" />,
  staff: <BadgeCheck className="h-3.5 w-3.5" />,
  delivery: <Package className="h-3.5 w-3.5" />,
};

// ── Props ───────────────────────────────────────────────────────────────────

interface EnSitioTabProps {
  installationId: string;
  guardId: string;
  maxStayHours?: number | null;
  deviceToken?: string;
}

// ── Filter Chip Component ───────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary/20 text-primary border border-primary/40"
          : "bg-muted text-muted-foreground border border-border active:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

// ── Duration color helpers ──────────────────────────────────────────────────

const LEFT_BORDER_COLORS = {
  green: "border-l-status-ok",
  yellow: "border-l-status-warn",
  red: "border-l-status-danger",
} as const;

const DURATION_BADGE_COLORS = {
  green: "bg-status-ok-soft border-status-ok-border text-status-ok-fg",
  yellow: "bg-status-warn-soft border-status-warn-border text-status-warn-fg",
  red: "bg-status-danger-soft border-status-danger-border text-status-danger-fg",
} as const;

// ── Component ───────────────────────────────────────────────────────────────

export default function EnSitioTab({
  installationId,
  guardId,
  maxStayHours,
  deviceToken,
}: EnSitioTabProps) {
  const [records, setRecords] = useState<InSiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterTime, setFilterTime] = useState<FilterTime>("all");
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ persons: 0, vehicles: 0 });

  const fetchRecords = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);

      const url = `/api/access-control/records/${installationId}/in-site${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const res = await authFetch(url, undefined, deviceToken);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setLoadError(null);
        setRecords(json.data.records);
        setCounts({
          persons: json.data.personCount ?? 0,
          vehicles: json.data.vehicleCount ?? 0,
        });
      } else {
        setRecords([]);
        setLoadError(json.error || "Error al cargar quién está en sitio");
      }
    } catch {
      setRecords([]);
      setLoadError(
        deviceToken
          ? "No se pudo cargar quién está en sitio"
          : "No se pudo cargar quién está en sitio. Vuelve a emparejar el dispositivo.",
      );
    } finally {
      setLoading(false);
    }
  }, [installationId, debouncedSearch, deviceToken]);

  // Fetch on mount + auto-refresh every 30s
  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 30000);
    return () => clearInterval(interval);
  }, [fetchRecords]);

  // ── Quick exit handler ────────────────────────────────────────────────

  const handleQuickExit = async (recordId: string) => {
    setExitingId(recordId);
    try {
      const gps = await new Promise<{ lat: number; lng: number } | null>(
        (resolve) => {
          navigator.geolocation?.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            () => resolve(null),
            { timeout: 5000 }
          );
        }
      );

      const res = await fetch(
        `/api/access-control/records/item/${recordId}/exit`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exitGuardId: guardId,
            gpsLat: gps?.lat,
            gpsLng: gps?.lng,
          }),
        }
      );

      const json = await res.json();
      if (json.success) {
        toast.success("Salida registrada");
        fetchRecords();
      } else {
        toast.error(json.error || "Error al registrar salida");
      }
    } catch {
      toast.error("Error al registrar salida");
    } finally {
      setExitingId(null);
    }
  };

  // ── Filter records ────────────────────────────────────────────────────

  const filteredRecords = records.filter((record) => {
    // Type filter
    if (filterType === "visit" && record.recordType !== "visit") return false;
    if (
      filterType === "provider" &&
      record.recordType !== "provider" &&
      record.recordType !== "delivery"
    )
      return false;
    if (filterType === "vehicle" && record.recordType !== "vehicle")
      return false;

    // Time filter
    if (filterTime !== "all") {
      const elapsed = elapsedMinutes(record.entryAt);
      const hours = elapsed / 60;
      if (filterTime === "4h" && hours < 4) return false;
      if (filterTime === "8h" && hours < 8) return false;
    }

    return true;
  });

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          <div className="h-5 w-5 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-10 rounded-lg bg-muted animate-pulse" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-16 rounded-full bg-muted animate-pulse"
            />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header with counts ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span className="font-semibold">{counts.persons}</span>
            <span className="text-muted-foreground">personas</span>
          </span>
          <span className="flex items-center gap-1.5 text-foreground">
            <Car className="h-4 w-4 text-tint-violet-fg" />
            <span className="font-semibold">{counts.vehicles}</span>
            <span className="text-muted-foreground">vehiculos</span>
          </span>
        </div>
        <button
          onClick={fetchRecords}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* ── Search ────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, RUT o patente..."
          className="h-[52px] pl-9 bg-ds-surface-2 border-ds-border-default text-ds-text-1 placeholder:text-ds-text-4"
        />
      </div>

      {/* ── Type Filters ──────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip
          label="Todos"
          active={filterType === "all"}
          onClick={() => setFilterType("all")}
        />
        <FilterChip
          label="Visitas"
          active={filterType === "visit"}
          onClick={() => setFilterType("visit")}
        />
        <FilterChip
          label="Proveed."
          active={filterType === "provider"}
          onClick={() => setFilterType("provider")}
        />
        <FilterChip
          label="Vehic."
          active={filterType === "vehicle"}
          onClick={() => setFilterType("vehicle")}
        />
      </div>

      {/* ── Time Filters ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <FilterChip
          label="Todos"
          active={filterTime === "all"}
          onClick={() => setFilterTime("all")}
        />
        <FilterChip
          label="> 4h"
          active={filterTime === "4h"}
          onClick={() => setFilterTime("4h")}
        />
        <FilterChip
          label="> 8h"
          active={filterTime === "8h"}
          onClick={() => setFilterTime("8h")}
        />
      </div>

      {/* ── Records List ──────────────────────────────────────────── */}
      {filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card opai-glass-soft-m py-12 px-4">
          <Inbox className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {loadError
              ? loadError
              : debouncedSearch || filterType !== "all" || filterTime !== "all"
              ? "Sin resultados para los filtros aplicados"
              : "No hay personas o vehiculos en sitio"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRecords.map((record) => {
            const elapsed = elapsedMinutes(record.entryAt);
            const color = stayDurationColor(elapsed, maxStayHours);
            const tc = RECORD_TYPE_CONFIG[record.recordType] ?? { label: record.recordType, icon: "UserPlus", color: "blue" };
            const entryTimeStr = new Date(record.entryAt).toLocaleTimeString(
              "es-CL",
              { hour: "2-digit", minute: "2-digit" }
            );

            return (
              <SwipeAction
                key={record.id}
                actionLabel="Salida"
                onAction={() => handleQuickExit(record.id)}
              >
              <div
                className={`rounded-lg border border-ds-border-default border-l-4 ${LEFT_BORDER_COLORS[color]} bg-ds-surface-1 p-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Left: info */}
                  <div className="min-w-0 flex-1">
                    {/* Type badge + name */}
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1 border-border text-muted-foreground text-xs px-1.5 py-0"
                      >
                        {TYPE_ICONS[record.recordType]}
                        {tc.label}
                      </Badge>
                    </div>

                    <p className="text-sm font-medium text-foreground break-words">
                      {record.fullName ||
                        record.vehiclePlate ||
                        "Sin identificar"}
                    </p>

                    {/* RUT and company */}
                    <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                      {record.rut && <span>{formatRut(record.rut)}</span>}
                      {record.rut && record.company && (
                        <span className="text-muted-foreground">|</span>
                      )}
                      {record.company && <span>{record.company}</span>}
                    </div>

                    {/* Time info */}
                    <div className="mt-1.5 flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-[12px] tabular-nums text-ds-text-3">
                        <Clock className="h-3 w-3" />
                        {entryTimeStr}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs px-1.5 py-0 ${DURATION_BADGE_COLORS[color]}`}
                      >
                        {formatDuration(elapsed)}
                      </Badge>
                    </div>
                  </div>

                  {/* Right: Quick exit button */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickExit(record.id)}
                    disabled={exitingId === record.id}
                    className="shrink-0 border-ds-border-default text-ds-text-3 hover:border-status-danger-border hover:bg-status-danger-soft hover:text-status-danger-fg"
                  >
                    {exitingId === record.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <LogOut className="mr-1 h-3.5 w-3.5" />
                        Salida
                      </>
                    )}
                  </Button>
                </div>
              </div>
              </SwipeAction>
            );
          })}
        </div>
      )}
    </div>
  );
}
