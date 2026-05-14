"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  History,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  UserPlus,
  Truck,
  Car,
  BadgeCheck,
  Package,
  Inbox,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import SkeletonCard from "../ui/SkeletonCard";
import {
  type AccessRecordType,
  type AccessControlRecordData,
} from "@/lib/access-control/types";
import { formatRut } from "@/lib/access-control/utils";
import { authFetch } from "../../_lib/authFetch";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-3.5 w-3.5" />,
  provider: <Truck className="h-3.5 w-3.5" />,
  vehicle: <Car className="h-3.5 w-3.5" />,
  staff: <BadgeCheck className="h-3.5 w-3.5" />,
  delivery: <Package className="h-3.5 w-3.5" />,
};

const TYPE_ICON_COLORS: Record<AccessRecordType, string> = {
  visit: "#3B82F6",
  provider: "#F97316",
  vehicle: "#A855F7",
  staff: "#10B981",
  delivery: "#F59E0B",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface HistorialSectionProps {
  installationId: string;
  deviceToken?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function HistorialSection({
  installationId,
  deviceToken,
}: HistorialSectionProps) {
  const [records, setRecords] = useState<AccessControlRecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const limit = 20;

  const fetchRecords = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        if (pageNum === 1) setLoading(true);
        else setLoadingMore(true);

        const params = new URLSearchParams({
          limit: String(limit),
          offset: String((pageNum - 1) * limit),
        });
        if (search) params.set("search", search);

        const res = await authFetch(
          `/api/access-control/records/${installationId}?${params.toString()}`,
          undefined,
          deviceToken,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (json.success) {
          const newRecords: AccessControlRecordData[] =
            json.data.records ?? json.data;
          if (append) {
            setRecords((prev) => [...prev, ...newRecords]);
          } else {
            setRecords(newRecords);
          }
          setHasMore(newRecords.length >= limit);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [installationId, search, deviceToken]
  );

  useEffect(() => {
    setPage(1);
    fetchRecords(1, false);
  }, [fetchRecords]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRecords(nextPage, true);
  };

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-48 rounded bg-[#1F2937] animate-pulse" />
        <div className="h-10 rounded-lg bg-[#1F2937] animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[#F9FAFB]">
        <History className="h-5 w-5 text-[#06B6D4]" />
        Historial de Registros
      </h2>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, RUT o patente..."
          className="pl-9 bg-[#111827] border-[#374151] text-[#F9FAFB] placeholder:text-[#9CA3AF]"
        />
      </div>

      {/* Records */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#374151] bg-[#111827] py-12 px-4">
          <Inbox className="h-12 w-12 text-[#374151]" />
          <p className="mt-3 text-sm font-medium text-[#9CA3AF]">
            {search
              ? "Sin resultados para la búsqueda"
              : "No hay registros en el historial"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => {
            const isEntry = !record.exitAt;
            const timeStr = new Date(
              record.exitAt || record.entryAt
            ).toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateStr = new Date(record.entryAt).toLocaleDateString(
              "es-CL",
              { day: "2-digit", month: "short" }
            );

            return (
              <div
                key={record.id}
                className="flex items-center gap-3 rounded-lg border border-[#374151] bg-[#111827] p-3"
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

                {/* Direction arrow */}
                <div className="shrink-0">
                  {isEntry ? (
                    <ArrowUpRight className="h-4 w-4 text-[#10B981]" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-[#F59E0B]" />
                  )}
                </div>

                {/* Name and details */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#F9FAFB] truncate">
                    {record.fullName ||
                      record.vehiclePlate ||
                      "Sin identificar"}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-[#9CA3AF]">
                    {record.rut && <span>{formatRut(record.rut)}</span>}
                    {record.rut && record.company && (
                      <span className="text-[#374151]">|</span>
                    )}
                    {record.company && <span>{record.company}</span>}
                  </div>
                </div>

                {/* Time + status */}
                <div className="shrink-0 text-right">
                  <p className="text-xs text-[#9CA3AF]">{dateStr}</p>
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
              </div>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#374151] bg-[#111827] py-3 text-sm text-[#9CA3AF] transition-colors active:bg-[#1F2937]"
            >
              {loadingMore ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Cargar más
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
