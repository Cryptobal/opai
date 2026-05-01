"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Search, LogOut, Loader2, Users, Car, Clock, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AccessRecordType } from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG } from "@/lib/access-control/types";
import { formatRut, formatDuration, elapsedMinutes, stayDurationColor } from "@/lib/access-control/utils";

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

interface Props {
  installationId: string;
  guardId: string;
  maxStayHours?: number | null;
  onExitRegistered: () => void;
}

export function InSiteList({ installationId, guardId, maxStayHours, onExitRegistered }: Props) {
  const [records, setRecords] = useState<InSiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ persons: 0, vehicles: 0 });

  const fetchRecords = useCallback(async () => {
    try {
      const url = `/api/access-control/records/${installationId}/in-site${
        search ? `?search=${encodeURIComponent(search)}` : ""
      }`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setRecords(json.data.records);
        setCounts({
          persons: json.data.personCount,
          vehicles: json.data.vehicleCount,
        });
      }
    } catch {
      // Offline fallback could go here
    } finally {
      setLoading(false);
    }
  }, [installationId, search]);

  useEffect(() => {
    fetchRecords();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchRecords, 30000);
    return () => clearInterval(interval);
  }, [fetchRecords]);

  const handleExit = async (recordId: string) => {
    setExitingId(recordId);
    try {
      const gps = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation?.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 5000 }
        );
      });

      const res = await fetch(`/api/access-control/records/item/${recordId}/exit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitGuardId: guardId, gpsLat: gps?.lat, gpsLng: gps?.lng }),
      });

      if ((await res.json()).success) {
        toast.success("Salida registrada");
        fetchRecords();
        onExitRegistered();
      }
    } catch {
      toast.error("Error al registrar salida");
    } finally {
      setExitingId(null);
    }
  };

  const colorClasses = {
    green: "bg-status-ok-soft border-status-ok-border text-status-ok-fg",
    yellow: "bg-status-warn-soft border-status-warn-border text-status-warn-fg",
    red: "bg-status-danger-soft border-status-danger-border text-status-danger-fg",
  };

  return (
    <div className="space-y-3">
      {/* Counts */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-zinc-300">
            <Users className="h-4 w-4 text-status-info-fg" />
            {counts.persons} personas
          </span>
          <span className="flex items-center gap-1 text-zinc-300">
            <Car className="h-4 w-4 text-purple-400" />
            {counts.vehicles} vehículos
          </span>
        </div>
        <button
          onClick={fetchRecords}
          className="text-zinc-500 hover:text-zinc-300"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="pl-9 bg-zinc-800 border-zinc-600"
        />
      </div>

      {/* Records */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : records.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          {search ? "Sin resultados" : "No hay personas o vehículos en sitio"}
        </p>
      ) : (
        <div className="space-y-2">
          {records.map((record) => {
            const elapsed = elapsedMinutes(record.entryAt);
            const color = stayDurationColor(elapsed, maxStayHours);
            const tc = RECORD_TYPE_CONFIG[record.recordType];

            return (
              <div
                key={record.id}
                className="rounded-lg border border-zinc-700 bg-zinc-900 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs border-zinc-600">
                        {tc.label}
                      </Badge>
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        {record.fullName || record.vehiclePlate || "Sin identificar"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                      {record.rut && <span>{formatRut(record.rut)}</span>}
                      {record.company && <span>{record.company}</span>}
                      {record.vehiclePlate && <span>{record.vehiclePlate}</span>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        Entrada: {new Date(record.entryAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${colorClasses[color]}`}
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        {formatDuration(elapsed)}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExit(record.id)}
                    disabled={exitingId === record.id}
                    className="ml-2 border-zinc-600"
                  >
                    {exitingId === record.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
