"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search, Download, Loader2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AccessRecordType, ListMatch, QrSource } from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG } from "@/lib/access-control/types";
import { formatRut, formatDuration, elapsedMinutes } from "@/lib/access-control/utils";
import { AccessControlRecordDetailSheet } from "./AccessControlRecordDetailSheet";

interface RecordItem {
  id: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  entryAt: string;
  exitAt: string | null;
  vehiclePlate: string | null;
  listMatch?: ListMatch | null;
  qrSource?: QrSource | null;
}

interface Props {
  installationId: string;
}

type DatePreset = "" | "today" | "yesterday" | "7d" | "month";

function presetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "today") return { from: fmt(today), to: fmt(today) };
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: fmt(y), to: fmt(y) };
  }
  if (preset === "7d") {
    const f = new Date(today); f.setDate(f.getDate() - 6);
    return { from: fmt(f), to: fmt(today) };
  }
  if (preset === "month") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(f), to: fmt(today) };
  }
  return { from: "", to: "" };
}

export function AccessControlRecordsView({ installationId }: Props) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "in_site">("");
  const [listMatchFilter, setListMatchFilter] = useState<"" | "whitelist" | "blacklist" | "none">("");
  const [qrSourceFilter, setQrSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const applyPreset = (p: DatePreset) => {
    setDatePreset(p);
    const { from, to } = presetRange(p);
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (listMatchFilter) params.set("listMatch", listMatchFilter);
      if (qrSourceFilter) params.set("qrSource", qrSourceFilter);

      const res = await fetch(
        `/api/access-control/records/${installationId}?${params}`,
      );
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
        setTotalPages(json.pagination.totalPages);
        setTotal(json.pagination.total);
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [
    installationId, search, dateFrom, dateTo, typeFilter, statusFilter,
    listMatchFilter, qrSourceFilter, page,
  ]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleExport = () => {
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

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
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
      {/* Toolbar — primer renglón: búsqueda + presets + export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, RUT, empresa o patente..."
            className="pl-9 bg-zinc-800 border-zinc-600"
          />
        </div>
        <div className="flex gap-1">
          {(["today", "yesterday", "7d", "month"] as DatePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(datePreset === p ? "" : p)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                datePreset === p
                  ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                  : "border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {p === "today" ? "Hoy" : p === "yesterday" ? "Ayer" : p === "7d" ? "7 días" : "Mes"}
            </button>
          ))}
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setDatePreset(""); setPage(1); }}
          className="w-36 bg-zinc-800 border-zinc-600"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setDatePreset(""); setPage(1); }}
          className="w-36 bg-zinc-800 border-zinc-600"
        />
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-4 w-4" />
          Exportar
        </Button>
      </div>

      {/* Toolbar — segundo renglón: filtros estructurados */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="">Todos los tipos</option>
          {(Object.keys(RECORD_TYPE_CONFIG) as AccessRecordType[]).map((t) => (
            <option key={t} value={t}>{RECORD_TYPE_CONFIG[t].label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as "" | "in_site"); setPage(1); }}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="">Todos</option>
          <option value="in_site">Solo en sitio</option>
        </select>
        <select
          value={listMatchFilter}
          onChange={(e) => { setListMatchFilter(e.target.value as typeof listMatchFilter); setPage(1); }}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="">Lista (todas)</option>
          <option value="whitelist">Lista blanca</option>
          <option value="blacklist">Lista negra</option>
          <option value="none">Sin lista</option>
        </select>
        <select
          value={qrSourceFilter}
          onChange={(e) => { setQrSourceFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="">Origen (todos)</option>
          <option value="cedula_2024">Cédula 2024</option>
          <option value="cedula_2013">Cédula 2013</option>
          <option value="manual">Manual</option>
          <option value="preregistered">Pre-registro</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-8">Sin registros</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="border-b border-zinc-700 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">RUT</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Origen</th>
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
                const initials = (r.fullName || r.vehiclePlate || "?")
                  .split(" ")
                  .map((s) => s[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-200 flex-shrink-0">
                          {initials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-zinc-200 truncate">
                            {r.fullName || r.vehiclePlate || "—"}
                          </span>
                          {r.listMatch === "whitelist" && (
                            <span className="text-[10px] text-status-ok-fg">Lista blanca</span>
                          )}
                          {r.listMatch === "blacklist" && (
                            <span className="text-[10px] text-status-danger-fg">Lista negra</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {r.rut ? formatRut(r.rut) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 truncate max-w-[200px]">{r.company || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs border-zinc-600">
                        {RECORD_TYPE_CONFIG[r.recordType]?.label || r.recordType}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-zinc-500 text-xs">
                      {qrSourceShort(r.qrSource)}
                    </td>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                      {new Date(r.entryAt).toLocaleString("es-CL", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
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
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{formatDuration(duration)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
            Página {page} de {totalPages} · {total} registros
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

      <AccessControlRecordDetailSheet
        recordId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function qrSourceShort(s: QrSource | null | undefined): string {
  switch (s) {
    case "cedula_2024":
      return "Cédula 2024";
    case "cedula_2013":
      return "Cédula 2013";
    case "manual":
      return "Manual";
    case "preregistered":
      return "Pre-registro";
    default:
      return "—";
  }
}
