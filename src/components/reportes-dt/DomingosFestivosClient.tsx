"use client";

import { useState, useCallback } from "react";
import { ReporteDtShell } from "./ReporteDtShell";
import { cn } from "@/lib/utils";

interface Installation { id: string; name: string; }

interface DomingosFestivosRecord {
  date: string;
  esDomingo: boolean;
  esFeriado: boolean;
  workedMinutes: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  plannedGuardia: { persona: { firstName: string; lastName: string; rut: string | null } } | null;
  installation: { name: string };
  puesto: { name: string } | null;
  marcacionEntrada: { timestamp: string } | null;
  marcacionSalida: { timestamp: string } | null;
}

const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = today.slice(0, 8) + "01";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function tipoDia(esDomingo: boolean, esFeriado: boolean): string {
  if (esDomingo && esFeriado) return "Dom+Feriado";
  if (esDomingo) return "Domingo";
  return "Feriado";
}

export function DomingosFestivosClient({ installations }: { installations: Installation[] }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [installationId, setInstallationId] = useState("");
  const [records, setRecords] = useState<DomingosFestivosRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (installationId) params.set("installationId", installationId);
      const r = await fetch(`/api/reportes/dt/domingos-festivos?${params}`);
      const d = await r.json();
      if (d.success) setRecords(d.data);
    } catch {}
    setLoading(false);
  }, [from, to, installationId]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/domingos-festivos/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `domingos-festivos-${from}-${to}.xlsx`);
    } catch {}
    setExporting(false);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/domingos-festivos/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `domingos-festivos-${from}-${to}.pdf`);
    } catch {}
    setExporting(false);
  };

  const fmtHora = (d: string | null | undefined) =>
    d
      ? new Date(d).toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Santiago",
        })
      : "—";

  const filters = (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Desde</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Instalación</label>
        <select
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background"
        >
          <option value="">Todas</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>
      <button
        onClick={fetchData}
        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Buscar
      </button>
    </div>
  );

  return (
    <ReporteDtShell
      title="Domingos y Festivos Trabajados"
      description="Art. 38 Código del Trabajo — días trabajados en domingo o festivo."
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
        <p className="text-sm text-muted-foreground text-center py-8">
          Sin registros para el período seleccionado.
        </p>
      ) : records.length > 0 ? (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {["Fecha", "Día", "RUT", "Apellido", "Nombre", "Instalación", "Puesto", "Entrada", "Salida", "H.Trab."].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className={cn("border-b border-border/40", i % 2 === 1 && "bg-muted/20")}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString("es-CL")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-violet-100 text-violet-700 font-medium">
                      {tipoDia(r.esDomingo, r.esFeriado)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.plannedGuardia?.persona.rut ?? "—"}</td>
                  <td className="px-3 py-2">{r.plannedGuardia?.persona.lastName ?? "—"}</td>
                  <td className="px-3 py-2">{r.plannedGuardia?.persona.firstName ?? "—"}</td>
                  <td className="px-3 py-2">{r.installation.name}</td>
                  <td className="px-3 py-2">{r.puesto?.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{fmtHora(r.marcacionEntrada?.timestamp ?? r.checkInAt)}</td>
                  <td className="px-3 py-2 font-mono">{fmtHora(r.marcacionSalida?.timestamp ?? r.checkOutAt)}</td>
                  <td className="px-3 py-2">
                    {r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReporteDtShell>
  );
}
