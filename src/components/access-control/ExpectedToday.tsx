"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CalendarClock, Loader2, Check, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PREREGISTRATION_STATUS_CONFIG } from "@/lib/access-control/types";
import { formatRut } from "@/lib/access-control/utils";
import type { PreregistrationStatus } from "@/lib/access-control/types";

interface Preregistration {
  id: string;
  visitorRut: string;
  visitorName: string;
  visitorCompany: string | null;
  hostName: string | null;
  expectedTimeFrom: string | null;
  expectedTimeTo: string | null;
  purpose: string | null;
  status: PreregistrationStatus;
}

interface Props {
  installationId: string;
}

export function ExpectedToday({ installationId }: Props) {
  const [items, setItems] = useState<Preregistration[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/access-control/preregistrations/${installationId}/today`
      );
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center">
        <CalendarClock className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
        <p className="text-sm text-zinc-500">No hay visitas esperadas para hoy</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "border-amber-500/30 text-amber-400",
    checked_in: "border-emerald-500/30 text-emerald-400",
    checked_out: "border-blue-500/30 text-blue-400",
    no_show: "border-red-500/30 text-red-400",
    cancelled: "border-zinc-500/30 text-zinc-500",
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">{items.length} esperado(s) hoy</p>
      {items.map((item) => {
        const sc = PREREGISTRATION_STATUS_CONFIG[item.status];
        return (
          <div
            key={item.id}
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">{item.visitorName}</p>
                <p className="text-xs text-zinc-500">{formatRut(item.visitorRut)}</p>
                {item.visitorCompany && (
                  <p className="text-xs text-zinc-500">{item.visitorCompany}</p>
                )}
                {item.hostName && (
                  <p className="text-xs text-zinc-400 mt-1">Visita a: {item.hostName}</p>
                )}
                {item.expectedTimeFrom && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    {item.expectedTimeFrom}
                    {item.expectedTimeTo && ` - ${item.expectedTimeTo}`}
                  </p>
                )}
              </div>
              <Badge
                variant="outline"
                className={`text-xs ${statusColors[item.status] || "border-zinc-600"}`}
              >
                {sc.label}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
