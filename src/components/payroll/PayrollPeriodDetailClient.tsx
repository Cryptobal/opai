"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Play,
  Upload,
  Database,
  FileDown,
  CheckCircle2,
  DollarSign,
} from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  PROCESSING: "Procesando",
  CLOSED: "Cerrado",
  PAID: "Pagado",
};

interface Liquidacion {
  id: string;
  guardiaId: string;
  salarySource: string;
  attendanceSource: string;
  daysWorked: number;
  grossSalary: string | number;
  netSalary: string | number;
  totalDeductions: string | number;
  employerCost: string | number;
  status: string;
}

interface PeriodData {
  id: string;
  year: number;
  month: number;
  status: string;
  _count: { liquidaciones: number; attendanceRecords: number; attendanceImports: number };
  liquidaciones: Liquidacion[];
  attendanceRecords: Array<{
    id: string;
    guardiaId: string;
    source: string;
    daysWorked: number;
    daysAbsent: number;
  }>;
}

export function PayrollPeriodDetailClient({ periodId }: { periodId: string }) {
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/periodos/${periodId}`);
      if (res.ok) {
        const json = await res.json();
        setPeriod(json.data);
      }
    } catch (err) {
      console.error("Error loading period:", err);
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => { loadPeriod(); }, [loadPeriod]);

  const handleConsolidateOPAI = async () => {
    setConsolidating(true);
    try {
      const res = await fetch("/api/payroll/attendance/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      if (res.ok) {
        const json = await res.json();
        alert(`Asistencias consolidadas: ${json.data.total} guardias (${json.data.created} nuevos, ${json.data.updated} actualizados)`);
        await loadPeriod();
      } else {
        const json = await res.json();
        alert(json.error || "Error");
      }
    } finally {
      setConsolidating(false);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("periodId", periodId);

      const res = await fetch("/api/payroll/attendance/import", { method: "POST", body: formData });
      const json = await res.json();

      if (res.ok) {
        const d = json.data;
        const confirmApply = confirm(
          `Archivo parseado:\n` +
          `- ${d.totalRows} filas\n` +
          `- ${d.matched.length} guardias encontrados\n` +
          `- ${d.unmatched.length} no encontrados\n\n` +
          `¿Aplicar las asistencias?`
        );
        if (confirmApply) {
          const applyRes = await fetch(`/api/payroll/attendance/import/${d.importId}/apply`, { method: "POST" });
          if (applyRes.ok) {
            const applyJson = await applyRes.json();
            alert(`Asistencias aplicadas: ${applyJson.data.total} (${applyJson.data.created} nuevos, ${applyJson.data.updated} actualizados)`);
            await loadPeriod();
          }
        }
      } else {
        alert(json.error || "Error al importar");
      }
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRunPayroll = async () => {
    if (!confirm("¿Ejecutar liquidación masiva? Se generarán liquidaciones para todos los guardias activos.")) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch(`/api/payroll/periodos/${periodId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        setRunResult(json.data);
        await loadPeriod();
      } else {
        alert(json.error || "Error al ejecutar");
      }
    } finally {
      setRunning(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!confirm("¿Marcar este período como PAGADO? Se actualizarán todas las liquidaciones.")) return;
    try {
      await fetch(`/api/payroll/periodos/${periodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID" }),
      });
      await loadPeriod();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!period) return <p className="text-sm text-muted-foreground">Período no encontrado.</p>;

  const totalGross = period.liquidaciones.reduce((s, l) => s + Number(l.grossSalary), 0);
  const totalNet = period.liquidaciones.reduce((s, l) => s + Number(l.netSalary), 0);
  const totalEmployer = period.liquidaciones.reduce((s, l) => s + Number(l.employerCost), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{MONTHS[period.month - 1]} {period.year}</h2>
          <Badge variant="outline" className="mt-1">
            {STATUS_LABELS[period.status] || period.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {period.status !== "PAID" && (
            <Button size="sm" onClick={handleRunPayroll} disabled={running}>
              {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              Ejecutar liquidación
            </Button>
          )}
          {period.status === "OPEN" && period.liquidaciones.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleMarkPaid}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Marcar como pagado
            </Button>
          )}
        </div>
      </div>

      {/* Attendance source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fuente de Asistencias</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={handleConsolidateOPAI} disabled={consolidating}>
            {consolidating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1.5 h-3.5 w-3.5" />}
            Consolidar desde OPAI
          </Button>
          <span className="text-xs text-muted-foreground">o</span>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Importar CSV externo
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          <span className="text-xs text-muted-foreground">
            {period._count.attendanceRecords} registros cargados
          </span>
        </CardContent>
      </Card>

      {/* Run result */}
      {runResult && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-4 text-sm">
            <p className="font-medium text-emerald-400">Liquidación ejecutada</p>
            <p className="text-xs text-muted-foreground mt-1">
              {runResult.total} guardias procesados · {runResult.created} liquidaciones creadas · {runResult.skipped} omitidos
              {runResult.errors?.length > 0 && ` · ${runResult.errors.length} errores`}
            </p>
            {runResult.errors?.length > 0 && (
              <div className="mt-2 space-y-1">
                {runResult.errors.map((e: any, i: number) => (
                  <p key={i} className="text-[10px] text-destructive">{e.name}: {e.error}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {period.liquidaciones.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Total Bruto</p>
              <p className="text-lg font-bold">${totalGross.toLocaleString("es-CL")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Total Líquido</p>
              <p className="text-lg font-bold text-emerald-400">${totalNet.toLocaleString("es-CL")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Costo Empleador</p>
              <p className="text-lg font-bold text-amber-400">${totalEmployer.toLocaleString("es-CL")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Liquidaciones table */}
      {period.liquidaciones.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Liquidaciones ({period.liquidaciones.length})</CardTitle>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => window.open(`/api/payroll/periodos/${periodId}/export?type=libro`, "_blank")}>
                <FileDown className="mr-1 h-3 w-3" />
                Libro Rem.
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => window.open(`/api/payroll/periodos/${periodId}/export?type=previred`, "_blank")}>
                <FileDown className="mr-1 h-3 w-3" />
                Previred
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => window.open(`/api/payroll/periodos/${periodId}/export?type=banco`, "_blank")}>
                <FileDown className="mr-1 h-3 w-3" />
                Banco
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Guardia</th>
                    <th className="px-3 py-2 text-center font-medium">Fuente</th>
                    <th className="px-3 py-2 text-right font-medium">Días</th>
                    <th className="px-3 py-2 text-right font-medium">Bruto</th>
                    <th className="px-3 py-2 text-right font-medium">Desc.</th>
                    <th className="px-3 py-2 text-right font-medium">Líquido</th>
                    <th className="px-3 py-2 text-center font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {period.liquidaciones.map((l) => (
                    <tr key={l.id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono text-[10px]">{l.guardiaId.slice(0, 8)}...</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[9px]">
                          {l.salarySource}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">{l.daysWorked}</td>
                      <td className="px-3 py-2 text-right">${Number(l.grossSalary).toLocaleString("es-CL")}</td>
                      <td className="px-3 py-2 text-right text-destructive">-${Number(l.totalDeductions).toLocaleString("es-CL")}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-400">${Number(l.netSalary).toLocaleString("es-CL")}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[9px]">
                          {l.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
