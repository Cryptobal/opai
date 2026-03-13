"use client";

import { useState, useCallback } from "react";
import { ReporteDtShell } from "./ReporteDtShell";
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

type Estado = "pendiente" | "opuesta" | "consolidada";

interface ModificacionRecord {
  id: string;
  tipo: string;
  timestamp: string;
  timestampOriginal: string | null;
  modifiedAt: string | null;
  modifiedBy: string | null;
  modificationReason: string | null;
  estado: Estado;
  opposedAt: string | null;
  opposedBy: string | null;
  oppositionReason: string | null;
  consolidatedAt: string | null;
  guardiaRut: string;
  guardiaLastName: string;
  guardiaFirstName: string;
  installationName: string;
}

function EstadoBadge({ estado }: { estado: Estado }) {
  const classes: Record<Estado, string> = {
    pendiente: "bg-amber-100 text-amber-800 border border-amber-300",
    opuesta: "bg-red-100 text-red-800 border border-red-300",
    consolidada: "bg-slate-100 text-slate-700 border border-slate-300",
  };
  const labels: Record<Estado, string> = {
    pendiente: "Pendiente",
    opuesta: "Opuesta",
    consolidada: "Consolidada",
  };
  return (
    <span className={cn("inline-block px-2 py-0.5 rounded text-xs font-medium", classes[estado])}>
      {labels[estado]}
    </span>
  );
}

function fmtHora(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
}

export function ModificacionesTurnosClient({ installations }: { installations: Installation[] }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [installationId, setInstallationId] = useState("");
  const [records, setRecords] = useState<ModificacionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (installationId) params.set("installationId", installationId);
      const r = await fetch(`/api/reportes/dt/modificaciones-turnos?${params}`);
      const d = await r.json();
      if (d.success) setRecords(d.data);
    } catch {}
    setLoading(false);
  }, [from, to, installationId]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/modificaciones-turnos/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `modificaciones-turnos-${from}-${to}.xlsx`);
    } catch {}
    setExporting(false);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/modificaciones-turnos/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `modificaciones-turnos-${from}-${to}.pdf`);
    } catch {}
    setExporting(false);
  };

  const filters = (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Desde</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Instalación</label>
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
      title="Modificaciones de Turnos"
      description="Marcaciones modificadas con estado de oposición (Res. Exenta N°38 Art. 19)."
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
        <p className="text-sm text-muted-foreground text-center py-8">Sin modificaciones para el período seleccionado.</p>
      ) : records.length > 0 ? (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {["Fecha Mod.","RUT","Apellido","Nombre","Instalación","Tipo","Hora Orig.","Hora Nueva","Motivo","Modificado Por","Estado","Motivo Oposición"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className={cn("border-b border-border/40", i % 2 === 1 && "bg-muted/20")}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.modifiedAt ? new Date(r.modifiedAt).toLocaleDateString("es-CL") : "—"}
                  </td>
                  <td className="px-3 py-2">{r.guardiaRut || "—"}</td>
                  <td className="px-3 py-2">{r.guardiaLastName}</td>
                  <td className="px-3 py-2">{r.guardiaFirstName}</td>
                  <td className="px-3 py-2">{r.installationName}</td>
                  <td className="px-3 py-2 capitalize">{r.tipo}</td>
                  <td className="px-3 py-2 font-mono">{fmtHora(r.timestampOriginal)}</td>
                  <td className="px-3 py-2 font-mono">{fmtHora(r.timestamp)}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate" title={r.modificationReason ?? ""}>
                    {r.modificationReason ?? "—"}
                  </td>
                  <td className="px-3 py-2">{r.modifiedBy ?? "—"}</td>
                  <td className="px-3 py-2">
                    <EstadoBadge estado={r.estado} />
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate" title={r.oppositionReason ?? ""}>
                    {r.oppositionReason ?? "—"}
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
