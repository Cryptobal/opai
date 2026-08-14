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
import { authFetch } from "../../_lib/authFetch";

// ── Status badge colors ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<PreregistrationStatus, string> = {
  pending: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
  checked_in: "border-status-ok-border bg-status-ok-soft text-status-ok-fg",
  checked_out: "border-status-info-border bg-status-info-soft text-status-info-fg",
  no_show: "border-status-danger-border bg-status-danger-soft text-status-danger-fg",
  cancelled: "border-ds-border-default bg-ds-surface-2 text-ds-text-3",
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
  deviceToken?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function EsperadosHoySection({
  installationId,
  deviceToken,
}: EsperadosHoySectionProps) {
  const [preregistrations, setPreregistrations] = useState<PreregistrationData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch(
        `/api/access-control/preregistrations/${installationId}/today`,
        undefined,
        deviceToken,
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
  }, [installationId, deviceToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-48 rounded bg-muted animate-pulse" />
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
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarCheck className="h-5 w-5 text-primary" />
          Esperados Hoy
        </h2>
        <Badge
          variant="outline"
          className="border-border text-muted-foreground"
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
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card opai-glass-soft-m py-12 px-4">
          <Inbox className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
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
                className="rounded-lg border border-border bg-card opai-glass-soft-m p-4 space-y-2"
              >
                {/* Top row: name + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground break-words">
                      {prereg.visitorName}
                    </p>
                    {prereg.visitorRut && (
                      <p className="text-sm text-muted-foreground">
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
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="h-3 w-3" />
                      {timeRange}
                    </span>
                  )}
                </div>

                {/* Purpose */}
                {prereg.purpose && (
                  <p className="text-sm text-muted-foreground italic">
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
