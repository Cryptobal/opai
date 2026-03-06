"use client";

import React, { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Search, LogOut, QrCode, Loader2, Check,
  User, Car, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RECORD_TYPE_CONFIG } from "@/lib/access-control/types";
import { formatRut, formatDuration, elapsedMinutes } from "@/lib/access-control/utils";
import type { AccessRecordType } from "@/lib/access-control/types";

interface InSiteRecord {
  id: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  entryAt: string;
  vehiclePlate: string | null;
}

interface Props {
  installationId: string;
  guardId: string;
  onClose: () => void;
}

export function AccessControlExit({ installationId, guardId, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<InSiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [exitObservations, setExitObservations] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/access-control/records/${installationId}/in-site${search ? `?search=${encodeURIComponent(search)}` : ""}`
      );
      const json = await res.json();
      if (json.success) {
        setRecords(json.data.records);
      }
    } catch {
      toast.error("Error al cargar registros");
    } finally {
      setLoading(false);
    }
  }, [installationId, search]);

  useEffect(() => {
    fetchRecords();
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

      const res = await fetch(`/api/access-control/records/${recordId}/exit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exitGuardId: guardId,
          gpsLat: gps?.lat,
          gpsLng: gps?.lng,
          exitObservations: exitObservations || null,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success("Salida registrada");
        fetchRecords();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al registrar salida");
    } finally {
      setExitingId(null);
      setExitObservations("");
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h3 className="text-base font-semibold text-zinc-100">Registrar Salida</h3>
      </div>

      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RUT, nombre o patente..."
            className="pl-9 bg-zinc-800 border-zinc-600"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No hay personas en sitio
          </p>
        ) : (
          <div className="space-y-2">
            {records.map((record) => {
              const elapsed = elapsedMinutes(record.entryAt);
              const tc = RECORD_TYPE_CONFIG[record.recordType];

              return (
                <div
                  key={record.id}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 p-3"
                >
                  <div className="flex items-start justify-between">
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
                        {record.vehiclePlate && <span>{record.vehiclePlate}</span>}
                        {record.company && <span>{record.company}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3 text-zinc-500" />
                        <span className="text-zinc-400">{formatDuration(elapsed)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2 border-zinc-600 text-zinc-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                      onClick={() => handleExit(record.id)}
                      disabled={exitingId === record.id}
                    >
                      {exitingId === record.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <LogOut className="mr-1 h-4 w-4" />
                          Salida
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
