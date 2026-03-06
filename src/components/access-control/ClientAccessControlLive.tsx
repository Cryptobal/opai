"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Car, Search, RefreshCw, Loader2, Clock,
  UserPlus, Truck, BadgeCheck, Package, Filter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AccessRecordType } from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG } from "@/lib/access-control/types";
import { formatRut, formatDuration, elapsedMinutes } from "@/lib/access-control/utils";

interface LiveRecord {
  id: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  entryAt: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
}

interface Props {
  installationId: string;
}

export function ClientAccessControlLive({ installationId }: Props) {
  const [records, setRecords] = useState<LiveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccessRecordType | "">("");
  const [counts, setCounts] = useState({ persons: 0, vehicles: 0, total: 0 });

  const fetchLive = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(
        `/api/portal/cliente/access-control/${installationId}/live?${params}`
      );
      const json = await res.json();
      if (json.success) {
        setRecords(json.data.records);
        setCounts({
          persons: json.data.personCount,
          vehicles: json.data.vehicleCount,
          total: json.data.totalCount,
        });
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [installationId, search, typeFilter]);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-center">
          <Users className="mx-auto h-5 w-5 text-blue-400 mb-1" />
          <p className="text-2xl font-bold text-zinc-100">{counts.persons}</p>
          <p className="text-xs text-zinc-500">Personas</p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-center">
          <Car className="mx-auto h-5 w-5 text-purple-400 mb-1" />
          <p className="text-2xl font-bold text-zinc-100">{counts.vehicles}</p>
          <p className="text-xs text-zinc-500">Vehículos</p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-center">
          <Clock className="mx-auto h-5 w-5 text-emerald-400 mb-1" />
          <p className="text-2xl font-bold text-zinc-100">{counts.total}</p>
          <p className="text-xs text-zinc-500">Total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="pl-9 bg-zinc-800 border-zinc-600"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AccessRecordType | "")}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="">Todos</option>
          {(Object.keys(RECORD_TYPE_CONFIG) as AccessRecordType[]).map((t) => (
            <option key={t} value={t}>{RECORD_TYPE_CONFIG[t].label}</option>
          ))}
        </select>
        <button onClick={fetchLive} className="text-zinc-500 hover:text-zinc-300 p-2">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Records */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-8">
          No hay personas o vehículos en sitio actualmente
        </p>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const elapsed = elapsedMinutes(r.entryAt);
            const tc = RECORD_TYPE_CONFIG[r.recordType];
            return (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-zinc-600">
                      {tc.label}
                    </Badge>
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {r.fullName || r.vehiclePlate || "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    {r.rut && <span>{formatRut(r.rut)}</span>}
                    {r.company && <span>{r.company}</span>}
                    {r.vehiclePlate && <span>{r.vehiclePlate}</span>}
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-400">
                  <p>{new Date(r.entryAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="text-zinc-500">{formatDuration(elapsed)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
