"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/opai";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Play,
  Upload,
  Database,
  FileDown,
  CheckCircle2,
  Eye,
  Trash2,
  RotateCcw,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { ChipTabs } from "@/components/ui/chip-tabs";

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

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PROCESSING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CLOSED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  PAID: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

interface Liquidacion {
  id: string;
  guardiaId: string;
  guardiaRut: string;
  guardiaName: string;
  salarySource: string;
  attendanceSource: string;
  daysWorked: number;
  grossSalary: string | number;
  netSalary: string | number;
  totalDeductions: string | number;
  employerCost: string | number;
  status: string;
  breakdown: any;
}

interface AttendanceRecord {
  id: string;
  guardiaId: string;
  guardiaRut: string;
  guardiaName: string;
  source: string;
  daysWorked: number;
  daysAbsent: number;
  daysMedicalLeave: number;
  daysVacation: number;
  normalHours: string | number;
  overtimeHours50: string | number;
}

interface SkippedGuard {
  guardiaId: string;
  name: string;
  rut: string;
  reason: string;
  reasonCode: string;
  fixLink?: string;
  fixLabel?: string;
}

interface PeriodData {
  id: string;
  year: number;
  month: number;
  status: string;
  notes: string | null;
  _count: { liquidaciones: number; attendanceRecords: number; attendanceImports: number };
  liquidaciones: Liquidacion[];
  attendanceRecords: AttendanceRecord[];
}

function formatCLP(val: string | number): string {
  return `$${Number(val).toLocaleString("es-CL")}`;
}

export function PayrollPeriodDetailClient({ periodId }: { periodId: string }) {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [selectedLiq, setSelectedLiq] = useState<Liquidacion | null>(null);
  const [activeTab, setActiveTab] = useState<"liquidaciones" | "no_procesados">("liquidaciones");
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
          `- ${d.totalRows} filas totales\n` +
          `- ${d.matched.length} guardias encontrados en el sistema\n` +
          `- ${d.unmatched.length} no encontrados\n\n` +
          `¿Aplicar las asistencias de los ${d.matched.length} guardias encontrados?`
        );
        if (confirmApply) {
          const applyRes = await fetch(`/api/payroll/attendance/import/${d.importId}/apply`, { method: "POST" });
          if (applyRes.ok) {
            const applyJson = await applyRes.json();
            alert(`Asistencias aplicadas: ${applyJson.data.total} guardias (${applyJson.data.created} nuevos, ${applyJson.data.updated} actualizados)`);
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
    if (!confirm("¿Ejecutar liquidación masiva? Se procesarán los guardias activos con estructura de sueldo configurada.")) return;
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
    if (!confirm("¿Marcar como PAGADO? Las liquidaciones pasarán a estado PAID y serán visibles en la ficha de cada guardia.")) return;
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

  const handleDeletePeriod = async () => {
    if (!confirm("¿Eliminar este período y todas sus liquidaciones? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/payroll/periodos/${periodId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/payroll/periodos");
      } else {
        const json = await res.json();
        alert(json.error || "Error al eliminar");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReopen = async () => {
    if (!confirm("¿Reabrir el período? Las liquidaciones volverán a estado DRAFT y dejarán de ser visibles en las fichas de los guardias.")) return;
    try {
      await fetch(`/api/payroll/periodos/${periodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "OPEN" }),
      });
      await loadPeriod();
    } catch (err) {
      console.error(err);
    }
  };

  const downloadFile = async (type: string) => {
    try {
      const res = await fetch(`/api/payroll/periodos/${periodId}/export?type=${type}`);
      if (!res.ok) {
        alert("Error al generar archivo");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `export_${type}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Error al descargar");
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
  const isPaid = period.status === "PAID";

  // Parse skipped guards from runResult or from period.notes
  let skippedGuards: SkippedGuard[] = [];
  if (runResult?.skippedDetails) {
    skippedGuards = runResult.skippedDetails;
  } else if (period.notes) {
    try {
      const parsed = JSON.parse(period.notes);
      if (parsed.skippedDetails) skippedGuards = parsed.skippedDetails;
    } catch { /* not JSON */ }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{MONTHS[period.month - 1]} {period.year}</h2>
          <Badge variant="outline" className={`mt-1 ${STATUS_COLORS[period.status] || ""}`}>
            {isPaid && <Lock className="mr-1 h-3 w-3" />}
            {STATUS_LABELS[period.status] || period.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {period.status === "OPEN" && period.liquidaciones.length > 0 && (
            <Button size="sm" onClick={handleMarkPaid}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Marcar como pagado
            </Button>
          )}
          {isPaid && (
            <Button size="sm" variant="outline" onClick={handleReopen}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reabrir período
            </Button>
          )}
          {!isPaid && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={handleDeletePeriod}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar período
            </Button>
          )}
        </div>
      </div>

      {/* Step 1: Attendance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Paso 1: Fuente de Asistencias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isPaid && (
            <div className="flex items-center gap-3 flex-wrap">
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
            </div>
          )}

          {period._count.attendanceRecords > 0 ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">
                  {period._count.attendanceRecords} registros de asistencia cargados
                </span>
              </div>
              {period.attendanceRecords.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-border/50 max-h-[250px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Guardia</th>
                        <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Fuente</th>
                        <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Días trab.</th>
                        <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Faltas</th>
                        <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Licencia</th>
                        <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Vacación</th>
                        <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Hrs norm.</th>
                        <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Hrs extra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {period.attendanceRecords.map((r) => (
                        <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                          <td className="px-3 py-2">
                            <Link href={`/personas/guardias/${r.guardiaId}`} className="hover:underline">
                              <div className="font-medium text-foreground">{r.guardiaName || "—"}</div>
                              <div className="text-[9px] text-muted-foreground font-mono">{r.guardiaRut || "—"}</div>
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              r.source === "IMPORT" ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
                            }`}>
                              {r.source}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium">{r.daysWorked}</td>
                          <td className="px-3 py-2 text-right font-mono text-destructive">{r.daysAbsent > 0 ? r.daysAbsent : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{r.daysMedicalLeave > 0 ? r.daysMedicalLeave : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{r.daysVacation > 0 ? r.daysVacation : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{Number(r.normalHours)}</td>
                          <td className="px-3 py-2 text-right font-mono">{Number(r.overtimeHours50) > 0 ? Number(r.overtimeHours50) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Sin asistencias cargadas. Consolida desde OPAI o importa un CSV para continuar.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Run */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Paso 2: Ejecutar Liquidación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Genera las liquidaciones para los guardias activos que tienen asignación y estructura de sueldo.
            {period._count.attendanceRecords > 0 && period.liquidaciones.length === 0 && (
              <span className="text-amber-400 ml-1">
                Nota: solo se liquidarán guardias con asignación activa y sueldo configurado en sus puestos operativos.
              </span>
            )}
          </p>
          {!isPaid && (
            <Button size="sm" onClick={handleRunPayroll} disabled={running || period._count.attendanceRecords === 0}>
              {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              {period.liquidaciones.length > 0 ? "Re-ejecutar liquidación" : "Ejecutar liquidación masiva"}
            </Button>
          )}
          {period._count.attendanceRecords === 0 && (
            <p className="text-[10px] text-amber-400">Debes cargar asistencias primero (Paso 1).</p>
          )}
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
            {runResult.skipped > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Los guardias omitidos no tienen asignación activa o su puesto no tiene estructura de sueldo configurada.
              </p>
            )}
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
          <KpiCard title="Total Bruto" value={formatCLP(totalGross)} />
          <KpiCard title="Total Líquido" value={formatCLP(totalNet)} variant="emerald" />
          <KpiCard title="Costo Empleador" value={formatCLP(totalEmployer)} variant="amber" />
        </div>
      )}

      {/* Step 3: Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Paso 3: Exportar Archivos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Descarga los archivos para Previred, Dirección del Trabajo, libro de remuneraciones y nómina bancaria.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={period.liquidaciones.length === 0} onClick={() => downloadFile("libro")}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Libro Remuneraciones
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={period.liquidaciones.length === 0} onClick={() => downloadFile("previred")}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Previred
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={period.liquidaciones.length === 0} onClick={() => downloadFile("banco")}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Archivo Banco
            </Button>
          </div>
          {period.liquidaciones.length === 0 && (
            <p className="text-[10px] text-amber-400">Debes ejecutar la liquidación primero (Paso 2).</p>
          )}
        </CardContent>
      </Card>

      {/* Liquidaciones / No procesados tabs */}
      {(period.liquidaciones.length > 0 || skippedGuards.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <ChipTabs
              tabs={[
                { id: "liquidaciones", label: "Liquidaciones", icon: CheckCircle2, badge: period.liquidaciones.length },
                ...(skippedGuards.length > 0
                  ? [{ id: "no_procesados", label: "No procesados", icon: AlertTriangle, badge: skippedGuards.length }]
                  : []),
              ]}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as "liquidaciones" | "no_procesados")}
              centered={false}
            />
          </CardHeader>
          <CardContent>
            {activeTab === "liquidaciones" ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Guardia</th>
                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Fuente</th>
                      <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Días</th>
                      <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Bruto</th>
                      <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Desc.</th>
                      <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Líquido</th>
                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Estado</th>
                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground w-[60px]">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.liquidaciones.map((l) => (
                      <tr key={l.id} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                        <td className="px-3 py-2">
                          <Link href={`/personas/guardias/${l.guardiaId}`} className="hover:underline">
                            <div className="font-medium text-foreground">{l.guardiaName || "—"}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{l.guardiaRut || "—"}</div>
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className="text-[9px]">{l.salarySource}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{l.daysWorked}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCLP(l.grossSalary)}</td>
                        <td className="px-3 py-2 text-right font-mono text-destructive">-{formatCLP(l.totalDeductions)}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-emerald-400">{formatCLP(l.netSalary)}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className={`text-[9px] ${l.status === "PAID" ? "bg-emerald-500/15 text-emerald-400" : ""}`}>
                            {l.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedLiq(l)} title="Ver desglose">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* No procesados tab */
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Estos guardias no fueron incluidos en la liquidación. Revisa el motivo y usa los enlaces para corregir.
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Guardia</th>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Motivo</th>
                        <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground w-[120px]">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skippedGuards.map((sg, idx) => (
                        <tr key={idx} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                          <td className="px-3 py-2">
                            <Link href={`/personas/guardias/${sg.guardiaId}`} className="hover:underline">
                              <div className="font-medium text-foreground">{sg.name || "—"}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{sg.rut || "—"}</div>
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                sg.reasonCode === "NO_SALARY" ? "bg-amber-400" :
                                sg.reasonCode === "NO_ASSIGNMENT" ? "bg-orange-400" :
                                sg.reasonCode === "ZERO_SALARY" ? "bg-amber-400" :
                                sg.reasonCode === "ERROR" ? "bg-destructive" :
                                "bg-muted-foreground"
                              }`} />
                              <span className="text-muted-foreground">{sg.reason}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {sg.fixLink && (
                              <Link href={sg.fixLink}>
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
                                  {sg.fixLabel || "Corregir"}
                                </Button>
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Desglose modal */}
      <Dialog open={!!selectedLiq} onOpenChange={(open) => !open && setSelectedLiq(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Desglose de Remuneración
            </DialogTitle>
          </DialogHeader>
          {selectedLiq && (
            <div className="space-y-4 text-sm">
              {/* Guard info */}
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div>
                  <p className="font-semibold">{selectedLiq.guardiaName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedLiq.guardiaRut}</p>
                </div>
                <Badge variant="outline" className="ml-auto">{selectedLiq.salarySource}</Badge>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Haberes</p>
                  <p className="font-semibold font-mono">{formatCLP(selectedLiq.grossSalary)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Descuentos</p>
                  <p className="font-semibold font-mono text-destructive">-{formatCLP(selectedLiq.totalDeductions)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sueldo Líquido</p>
                  <p className="font-bold font-mono text-lg text-emerald-400">{formatCLP(selectedLiq.netSalary)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Costo Empleador</p>
                  <p className="font-semibold font-mono text-amber-400">{formatCLP(selectedLiq.employerCost)}</p>
                </div>
              </div>

              {selectedLiq.breakdown && (() => {
                const hab = selectedLiq.breakdown.haberes || {};
                const ded = selectedLiq.breakdown.deductions || {};
                const vol = selectedLiq.breakdown.voluntaryDeductions || {};
                const emp = selectedLiq.breakdown.employerCost || {};
                const gi = selectedLiq.breakdown.guardInfo || {};

                const afpLabel = gi.afpName ? `AFP ${gi.afpName}` : "AFP";
                const healthLabel = gi.healthSystem === "isapre"
                  ? `Isapre (${(gi.healthPlanPct * 100).toFixed(1)}%)`
                  : `Fonasa (${(gi.healthPlanPct ? gi.healthPlanPct * 100 : 7).toFixed(1)}%)`;
                const holidayDays = gi.holidayDaysWorked || 0;
                const holidayHours = gi.holidayHoursWorked || 0;

                return (
                  <>
                    {/* Info previsional */}
                    <div className="rounded-md bg-muted/30 border border-border/50 p-2.5 text-[11px] text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                      <span>AFP: <strong className="text-foreground">{gi.afpName || "—"}</strong></span>
                      <span>Salud: <strong className="text-foreground">{gi.healthSystem === "isapre" ? "Isapre" : "Fonasa"}</strong></span>
                      <span>Contrato: <strong className="text-foreground">{gi.contractType === "fixed_term" ? "Plazo fijo" : "Indefinido"}</strong></span>
                      <span>Días feriado: <strong className="text-foreground">{holidayDays}</strong> ({holidayHours}h)</span>
                    </div>

                    {/* Haberes */}
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Haberes Imponibles</p>
                      <div className="space-y-1 text-xs">
                        {hab.base_salary > 0 && <Row label="Sueldo Base" value={hab.base_salary} />}
                        {hab.gratification > 0 && <Row label="Gratificación Legal" value={hab.gratification} />}
                        {hab.holiday_surcharge > 0 && <Row label={`Recargo Día Feriado (${holidayDays} día${holidayDays !== 1 ? "s" : ""}, ${holidayHours}h)`} value={hab.holiday_surcharge} />}
                        {hab.overtime_50 > 0 && <Row label="Horas Extra 50%" value={hab.overtime_50} />}
                        {hab.overtime_100 > 0 && <Row label="Horas Extra 100%" value={hab.overtime_100} />}
                        {hab.commissions > 0 && <Row label="Comisiones" value={hab.commissions} />}
                        {hab.other_taxable > 0 && <Row label="Otros Imponibles (bonos)" value={hab.other_taxable} />}
                        <Row label="Total Imponible" value={hab.total_taxable} bold />
                      </div>
                    </div>

                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Haberes No Imponibles</p>
                      <div className="space-y-1 text-xs">
                        {hab.meal > 0 && <Row label="Colación" value={hab.meal} />}
                        {hab.transport > 0 && <Row label="Movilización" value={hab.transport} />}
                        {hab.family_allowance > 0 && <Row label="Asig. Familiar" value={hab.family_allowance} />}
                        {hab.other_non_taxable > 0 && <Row label="Otros No Imponibles" value={hab.other_non_taxable} />}
                        <Row label="Total No Imponible" value={hab.total_non_taxable} bold />
                      </div>
                    </div>

                    {/* Descuentos legales */}
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Descuentos Legales</p>
                      <div className="space-y-1 text-xs">
                        {ded.afp?.amount > 0 && (
                          <Row label={`${afpLabel} (${(ded.afp.total_rate * 100).toFixed(2)}%)`} value={ded.afp.amount} negative />
                        )}
                        {ded.health?.amount > 0 && (
                          <Row label={healthLabel} value={ded.health.amount} negative />
                        )}
                        {ded.afc?.amount > 0 && (
                          <Row label={`AFC Trabajador (${(ded.afc.total_rate * 100).toFixed(2)}%)`} value={ded.afc.amount} negative />
                        )}
                        {ded.tax?.amount > 0 && (
                          <Row label="Impuesto Único" value={ded.tax.amount} negative />
                        )}
                        <Row label="Total Descuentos Legales" value={ded.total_legal} bold negative />
                      </div>
                    </div>

                    {/* Descuentos voluntarios */}
                    {(vol.advance > 0 || vol.loan > 0 || vol.other > 0) && (
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold mb-2">Descuentos Voluntarios</p>
                        <div className="space-y-1 text-xs">
                          {vol.advance > 0 && <Row label="Anticipo" value={vol.advance} negative />}
                          {vol.loan > 0 && <Row label="Préstamo" value={vol.loan} negative />}
                          {vol.other > 0 && <Row label="Otros" value={vol.other} negative />}
                          <Row label="Total Voluntarios" value={vol.total} bold negative />
                        </div>
                      </div>
                    )}

                    {/* Costo empleador */}
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Costo Empleador</p>
                      <div className="space-y-1 text-xs">
                        {emp.sis?.amount > 0 && <Row label="SIS" value={emp.sis.amount} />}
                        {emp.afc?.total_amount > 0 && <Row label="AFC Empleador" value={emp.afc.total_amount} />}
                        {emp.work_injury?.amount > 0 && <Row label="Mutual / Acc. Trabajo" value={emp.work_injury.amount} />}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  if (value == null || isNaN(value)) return null;
  return (
    <div className={`flex justify-between ${bold ? "font-semibold pt-1 border-t border-border/30" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${negative ? "text-destructive" : ""}`}>
        {negative ? "-" : ""}${Math.abs(value).toLocaleString("es-CL")}
      </span>
    </div>
  );
}
