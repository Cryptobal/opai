"use client";

import { useState, useCallback } from "react";
import { ReporteDtShell } from "./ReporteDtShell";
import { MarcacionModificadaBadge } from "@/components/ops/MarcacionModificadaBadge";
import { cn } from "@/lib/utils";

interface Installation { id: string; name: string; }

const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = today.slice(0, 8) + "01";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function AsistenciaDiariaClient({ installations }: { installations: Installation[] }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [installationId, setInstallationId] = useState("");
  const [records, setRecords] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (installationId) params.set("installationId", installationId);
      const r = await fetch(`/api/reportes/dt/asistencia-diaria?${params}`);
      const d = await r.json();
      if (d.success) setRecords(d.data);
    } catch {}
    setLoading(false);
  }, [from, to, installationId]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/asistencia-diaria/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `asistencia-diaria-${from}-${to}.xlsx`);
    } catch {}
    setExporting(false);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/asistencia-diaria/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `asistencia-diaria-${from}-${to}.pdf`);
    } catch {}
    setExporting(false);
  };

  const filters = (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Desde</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background" />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Hasta</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background" />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Instalación</label>
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background">
          <option value="">Todas</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>
      <button onClick={fetchData}
        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
        Buscar
      </button>
    </div>
  );

  return (
    <ReporteDtShell
      title="Asistencia Diaria"
      description="Listado de marcaciones de asistencia por trabajador y fecha."
      filters={filters}
      onExportExcel={searched ? exportExcel : undefined}
      onExportPdf={searched ? exportPdf : undefined}
      exporting={exporting}
    >
      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : searched && records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin registros para el período seleccionado.</p>
      ) : records.length > 0 ? (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {["Fecha","RUT","Apellido","Nombre","Instalación","Puesto","Estado","Entrada","Salida","H.Norm","H.Extra","Mod."].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(records as Record<string, unknown>[]).map((r, i) => {
                // API returns "plannedGuardia" (not "guardia") for OpsAsistenciaDiaria
                const g = r.plannedGuardia as Record<string, Record<string, string>> | null;
                const inst = r.installation as Record<string, string>;
                const puesto = r.puesto as Record<string, string> | null;
                const me = r.marcacionEntrada as Record<string, unknown> | null;
                const ms = r.marcacionSalida as Record<string, unknown> | null;
                const isModified = (me?.isModified as boolean) || (ms?.isModified as boolean);
                const fmtHora = (d: unknown) => d ? new Date(d as string).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "—";
                return (
                  <tr key={i} className={cn("border-b border-border/40", i % 2 === 1 && "bg-muted/20")}>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.date as string).toLocaleDateString("es-CL")}</td>
                    <td className="px-3 py-2">{g?.persona.rut ?? "—"}</td>
                    <td className="px-3 py-2">{g?.persona.lastName ?? "—"}</td>
                    <td className="px-3 py-2">{g?.persona.firstName ?? "—"}</td>
                    <td className="px-3 py-2">{inst.name}</td>
                    <td className="px-3 py-2">{puesto?.name ?? "—"}</td>
                    <td className="px-3 py-2">{r.attendanceStatus as string}</td>
                    <td className="px-3 py-2 font-mono">{fmtHora(me?.timestamp ?? r.checkInAt)}</td>
                    <td className="px-3 py-2 font-mono">{fmtHora(ms?.timestamp ?? r.checkOutAt)}</td>
                    <td className="px-3 py-2">{r.workedMinutes ? ((r.workedMinutes as number) / 60).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2">{r.overtimeMinutes ? ((r.overtimeMinutes as number) / 60).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2">
                      {isModified && (
                        <MarcacionModificadaBadge
                          isModified={true}
                          consolidatedAt={(me?.consolidatedAt ?? ms?.consolidatedAt) as string | null}
                          opposedAt={(me?.opposedAt ?? ms?.opposedAt) as string | null}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReporteDtShell>
  );
}
