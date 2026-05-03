"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarCheck,
  User,
  Building2,
  Clock,
  Loader2,
  Inbox,
  UserCheck,
  UserX,
  Ban,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SkeletonCard from "../ui/SkeletonCard";
import type { PreregistrationData, PreregistrationStatus } from "@/lib/access-control/types";
import { PREREGISTRATION_STATUS_CONFIG } from "@/lib/access-control/types";
import { formatRut } from "@/lib/access-control/utils";

// ── Status badge colors ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<PreregistrationStatus, string> = {
  pending: "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]",
  checked_in: "border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]",
  checked_out: "border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#06B6D4]",
  no_show: "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]",
  cancelled: "border-[#9CA3AF]/30 bg-[#9CA3AF]/10 text-[#9CA3AF]",
};

const STATUS_ICONS: Record<PreregistrationStatus, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  checked_in: <UserCheck className="h-3.5 w-3.5" />,
  checked_out: <UserCheck className="h-3.5 w-3.5" />,
  no_show: <UserX className="h-3.5 w-3.5" />,
  cancelled: <Ban className="h-3.5 w-3.5" />,
};

// ── Props ───────────────────────────────────────────────────────────────────

interface EsperadosHoySectionProps {
  installationId: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function EsperadosHoySection({
  installationId,
}: EsperadosHoySectionProps) {
  const [preregistrations, setPreregistrations] = useState<PreregistrationData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/access-control/preregistrations/${installationId}/today`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setPreregistrations(json.data ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-48 rounded bg-[#1F2937] animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // ── Group by status ───────────────────────────────────────────────────

  const pending = preregistrations.filter((p) => p.status === "pending");
  const checkedIn = preregistrations.filter((p) => p.status === "checked_in");
  const others = preregistrations.filter(
    (p) => p.status !== "pending" && p.status !== "checked_in"
  );

  const sortedList = [...pending, ...checkedIn, ...others];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#F9FAFB]">
          <CalendarCheck className="h-5 w-5 text-[#06B6D4]" />
          Esperados Hoy
        </h2>
        <Badge
          variant="outline"
          className="border-[#374151] text-[#9CA3AF]"
        >
          {preregistrations.length} total
        </Badge>
      </div>

      {/* Summary badges */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline" className={STATUS_COLORS.pending}>
          {pending.length} pendientes
        </Badge>
        <Badge variant="outline" className={STATUS_COLORS.checked_in}>
          {checkedIn.length} ingresados
        </Badge>
      </div>

      {/* List */}
      {sortedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#374151] bg-[#111827] py-12 px-4">
          <Inbox className="h-12 w-12 text-[#374151]" />
          <p className="mt-3 text-sm font-medium text-[#9CA3AF]">
            No hay visitas pre-registradas para hoy
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedList.map((prereg) => {
            const statusConfig = PREREGISTRATION_STATUS_CONFIG[prereg.status];
            const timeRange = [
              prereg.expectedTimeFrom,
              prereg.expectedTimeTo,
            ]
              .filter(Boolean)
              .join(" - ");

            return (
              <div
                key={prereg.id}
                className="rounded-lg border border-[#374151] bg-[#111827] p-4 space-y-2"
              >
                {/* Top row: name + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#F9FAFB] break-words">
                      {prereg.visitorName}
                    </p>
                    {prereg.visitorRut && (
                      <p className="text-sm text-[#9CA3AF]">
                        {formatRut(prereg.visitorRut)}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`flex items-center gap-1 shrink-0 ${STATUS_COLORS[prereg.status]}`}
                  >
                    {STATUS_ICONS[prereg.status]}
                    {statusConfig.label}
                  </Badge>
                </div>

                {/* Details */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#9CA3AF]">
                  {prereg.visitorCompany && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {prereg.visitorCompany}
                    </span>
                  )}
                  {prereg.hostName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Visita a: {prereg.hostName}
                    </span>
                  )}
                  {timeRange && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeRange}
                    </span>
                  )}
                </div>

                {/* Purpose */}
                {prereg.purpose && (
                  <p className="text-sm text-[#9CA3AF] italic">
                    {prereg.purpose}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
