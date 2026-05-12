"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search, Download, Loader2, ChevronLeft, ChevronRight, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AccessRecordType } from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG } from "@/lib/access-control/types";
import { formatRut, formatDuration, elapsedMinutes } from "@/lib/access-control/utils";

interface HistoryRecord {
  id: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  entryAt: string;
  exitAt: string | null;
  vehiclePlate: string | null;
}

interface Props {
  installationId: string;
}

export function ClientAccessControlHistory({ installationId }: Props) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(
        `/api/portal/cliente/access-control/${installationId}/history?${params}`
      );
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
        setTotalPages(json.pagination.totalPages);
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [installationId, search, dateFrom, dateTo, typeFilter, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleExport = () => {
    // Build CSV
    const headers = ["Tipo", "RUT", "Nombre", "Empresa", "Entrada", "Salida", "Patente"];
    const rows = records.map((r) => [
      RECORD_TYPE_CONFIG[r.recordType]?.label || r.recordType,
      r.rut ? formatRut(r.rut) : "",
      r.fullName || "",
      r.company || "",
      new Date(r.entryAt).toLocaleString("es-CL"),
      r.exitAt ? new Date(r.exitAt).toLocaleString("es-CL") : "En sitio",
      r.vehiclePlate || "",
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accesos_${installationId}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar..."
            className="pl-9 bg-zinc-800 border-zinc-600"
          />
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="w-36 bg-zinc-800 border-zinc-600"
          placeholder="Desde"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="w-36 bg-zinc-800 border-zinc-600"
          placeholder="Hasta"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="">Todos</option>
          {(Object.keys(RECORD_TYPE_CONFIG) as AccessRecordType[]).map((t) => (
            <option key={t} value={t}>{RECORD_TYPE_CONFIG[t]?.label ?? t}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-4 w-4" />
          Exportar
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-8">Sin registros</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">RUT</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Entrada</th>
                <th className="px-3 py-2">Salida</th>
                <th className="px-3 py-2">Duración</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const duration = r.exitAt
                  ? elapsedMinutes(r.entryAt, r.exitAt)
                  : elapsedMinutes(r.entryAt);
                return (
                  <tr key={r.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs border-zinc-600">
                        {RECORD_TYPE_CONFIG[r.recordType]?.label || r.recordType}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-zinc-200">
                      {r.fullName || r.vehiclePlate || "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.rut ? formatRut(r.rut) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.company || "—"}</td>
                    <td className="px-3 py-2 text-zinc-300">
                      {new Date(r.entryAt).toLocaleString("es-CL", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {r.exitAt ? (
                        <span className="text-zinc-300">
                          {new Date(r.exitAt).toLocaleString("es-CL", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      ) : (
                        <Badge className="bg-status-ok-soft text-status-ok-fg border-status-ok-border text-xs">
                          En sitio
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{formatDuration(duration)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-zinc-400">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
