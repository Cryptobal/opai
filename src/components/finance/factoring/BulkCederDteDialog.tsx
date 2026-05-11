"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Coins,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface FactoringCompanyOpt {
  id: string;
  rut: string;
  rutFormatted: string;
  razonSocial: string;
  direccion: string | null;
  email: string | null;
  defaultAdvanceRate: number | null;
  defaultInterestRate: number | null;
  defaultCommissionAmount: number | null;
}

export interface BulkDteRow {
  id: string;
  dteType: number;
  folio: number;
  receiverName: string;
  totalAmount: number;
}

interface SimulationState {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  extractedJson: unknown;
  extractionError: string | null;
  montoBruto: number | null;
  porcAnticipo: number | null;
  difPrecio: number | null;
  comision: number | null;
  iva: number | null;
  gastosLegal: number | null;
  notaria: number | null;
  gastosOperacionales: number | null;
  montoAGirar: number | null;
  confidence: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dtes: BulkDteRow[];
  onCompleted?: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatCLP(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export function BulkCederDteDialog({
  open,
  onOpenChange,
  dtes,
  onCompleted,
}: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState<FactoringCompanyOpt[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [factoringId, setFactoringId] = useState<string>("");
  const [fechaCesion, setFechaCesion] = useState(todayIso);
  const [fechaVencimiento, setFechaVencimiento] = useState(() => isoPlusDays(60));
  const addDaysToIso = (iso: string, days: number): string => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const diasFromDates = useMemo(() => {
    const a = new Date(`${fechaCesion}T00:00:00Z`).getTime();
    const b = new Date(`${fechaVencimiento}T00:00:00Z`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 60;
    return Math.max(1, Math.round((b - a) / 86400000));
  }, [fechaCesion, fechaVencimiento]);
  const [advanceRate, setAdvanceRate] = useState<string>("90");
  // 4 inputs CLP a nivel batch (se prorratean por bruto en el server).
  const [comision, setComision] = useState<string>("0");
  const [difPrecio, setDifPrecio] = useState<string>("0");
  const [iva, setIva] = useState<string>("0");
  const [montoAGirarTotal, setMontoAGirarTotal] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [simulationUploading, setSimulationUploading] = useState(false);
  const [simulationDragOver, setSimulationDragOver] = useState(false);

  const [results, setResults] = useState<Array<{
    dteId: string;
    operationId?: string;
    code?: string;
    error?: string;
  }> | null>(null);

  const totalBruto = useMemo(
    () => dtes.reduce((s, d) => s + d.totalAmount, 0),
    [dtes],
  );

  useEffect(() => {
    if (!open) {
      setSimulation(null);
      setResults(null);
      return;
    }
    setLoadingCompanies(true);
    fetch("/api/finance/factoring/companies")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setCompanies(j.companies);
      })
      .finally(() => setLoadingCompanies(false));
  }, [open]);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === factoringId) ?? null,
    [factoringId, companies],
  );

  useEffect(() => {
    if (!selectedCompany) return;
    if (selectedCompany.defaultAdvanceRate !== null)
      setAdvanceRate(String(selectedCompany.defaultAdvanceRate));
    if (selectedCompany.defaultCommissionAmount !== null)
      setComision(String(Math.round(selectedCompany.defaultCommissionAmount)));
  }, [selectedCompany]);

  const calc = useMemo(() => {
    const aRate = Number(advanceRate) || 0;
    const cClp = Math.max(0, Number(comision) || 0);
    const dpClp = Math.max(0, Number(difPrecio) || 0);
    const ivaClp = Math.max(0, Number(iva) || 0);
    const montoTyped = Number(montoAGirarTotal);
    const cesion = new Date(`${fechaCesion}T00:00:00Z`);
    const venc = new Date(`${fechaVencimiento}T00:00:00Z`);
    const dias = Math.max(1, Math.round((venc.getTime() - cesion.getTime()) / 86400000));
    const advance = totalBruto * (aRate / 100);
    const hasMontoAGirar = Number.isFinite(montoTyped) && montoTyped > 0;
    const montoAGirar = hasMontoAGirar
      ? montoTyped
      : Math.max(0, advance - dpClp - cClp - ivaClp);
    const costoFinanciero = Math.max(0, totalBruto - montoAGirar);
    const retention = totalBruto - advance;
    // Tasa efectiva (costo total / bruto) y tasa real (interés puro / bruto),
    // ambas mensuales para comparar entre factorings con distintos plazos.
    const effectiveMonthlyRate =
      totalBruto > 0 && dias > 0
        ? (costoFinanciero / totalBruto) * (30 / dias) * 100
        : null;
    const realMonthlyRate =
      totalBruto > 0 && dias > 0
        ? (dpClp / totalBruto) * (30 / dias) * 100
        : null;
    return {
      dias,
      advance: Math.round(advance),
      difPrecio: Math.round(dpClp),
      commission: Math.round(cClp),
      iva: Math.round(ivaClp),
      montoAGirar: Math.round(montoAGirar),
      costoFinanciero: Math.round(costoFinanciero),
      retention: Math.round(retention),
      effectiveMonthlyRate,
      realMonthlyRate,
      hasMontoAGirar,
    };
  }, [
    advanceRate,
    comision,
    difPrecio,
    iva,
    montoAGirarTotal,
    fechaCesion,
    fechaVencimiento,
    totalBruto,
  ]);

  async function handleSimulationFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Sólo se aceptan archivos PDF");
      return;
    }
    setSimulationUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/finance/factoring/extract-simulation", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error subiendo el PDF");
        return;
      }
      const ex = json.extracted as Record<string, number | null> | null;
      const sim: SimulationState = {
        fileUrl: json.fileUrl,
        fileKey: json.fileKey,
        fileName: json.fileName,
        extractedJson: ex,
        extractionError: json.extractionError ?? null,
        montoBruto: ex?.montoBruto ?? null,
        porcAnticipo: ex?.porcAnticipo ?? null,
        difPrecio: ex?.difPrecio ?? null,
        comision: ex?.comision ?? null,
        iva: ex?.iva ?? null,
        gastosLegal: ex?.gastosLegal ?? null,
        notaria: ex?.notaria ?? null,
        gastosOperacionales: ex?.gastosOperacionales ?? null,
        montoAGirar: ex?.montoAGirar ?? null,
        confidence: ex?.confidence ?? null,
      };
      setSimulation(sim);
      if (sim.comision != null) setComision(String(Math.round(sim.comision)));
      if (sim.difPrecio != null) setDifPrecio(String(Math.round(sim.difPrecio)));
      if (sim.iva != null) setIva(String(Math.round(sim.iva)));
      if (sim.montoAGirar != null)
        setMontoAGirarTotal(String(Math.round(sim.montoAGirar)));
      if (sim.porcAnticipo != null) setAdvanceRate(String(sim.porcAnticipo));
      if (sim.extractionError) {
        toast.warning("PDF subido. No se extrajeron datos — completa a mano.");
      } else {
        toast.success("Datos extraídos del PDF. Revisa antes de ceder.");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSimulationUploading(false);
    }
  }

  async function handleSubmit() {
    if (!factoringId) {
      toast.error("Seleccioná una empresa de factoring");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/factoring/bulk-cede", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dteIds: dtes.map((d) => d.id),
          factoringCompanyId: factoringId,
          fechaCesion,
          fechaVencimiento,
          advanceRate: Number(advanceRate),
          // Tasa efectiva derivada de los inputs CLP del batch.
          interestRate: calc.effectiveMonthlyRate ?? 0,
          totals: {
            montoAGirar: calc.montoAGirar,
            difPrecio: calc.difPrecio,
            comision: calc.commission,
            iva: calc.iva,
            gastosLegal: simulation?.gastosLegal ?? null,
            notaria: simulation?.notaria ?? null,
            gastosOperacionales: simulation?.gastosOperacionales ?? null,
          },
          notes: notes.trim() || undefined,
          simulation: simulation
            ? {
                fileUrl: simulation.fileUrl,
                fileKey: simulation.fileKey,
                fileName: simulation.fileName,
                extractedJson: simulation.extractedJson,
                montoBruto: simulation.montoBruto,
                montoAGirar: simulation.montoAGirar,
                difPrecio: simulation.difPrecio,
                comision: simulation.comision,
                iva: simulation.iva,
                gastosLegal: simulation.gastosLegal,
                notaria: simulation.notaria,
                gastosOperacionales: simulation.gastosOperacionales,
              }
            : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error en cesión bulk");
        return;
      }
      setResults(json.results);
      const ok = json.results.filter((r: { error?: string }) => !r.error).length;
      const fail = json.results.length - ok;
      if (fail === 0) {
        toast.success(`Batch ${json.batchCode}: ${ok} cesiones enviadas al SII.`);
      } else if (ok > 0) {
        toast.warning(`Batch ${json.batchCode}: ${ok} ok, ${fail} con error.`);
      } else {
        toast.error(`Batch ${json.batchCode}: todas las cesiones fallaron.`);
      }
      onCompleted?.();
      if (fail === 0) router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (results) {
    // Vista post-submit con resultados por DTE.
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" /> Resultado del batch
            </DialogTitle>
            <DialogDescription>
              {results.filter((r) => !r.error).length} de {results.length} cesiones procesadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {results.map((r) => {
              const dte = dtes.find((d) => d.id === r.dteId);
              return (
                <div
                  key={r.dteId}
                  className="flex items-start gap-2 rounded-md border border-ds-border-subtle p-2 text-sm"
                >
                  {r.error ? (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-status-ok-fg shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[13px]">
                      DTE {dte?.dteType}-{dte?.folio} · {dte?.receiverName}
                    </div>
                    {r.error ? (
                      <div className="text-[11px] text-destructive mt-0.5">{r.error}</div>
                    ) : (
                      <div className="text-[11px] text-ds-text-3 mt-0.5">
                        {r.code} {dte ? `· ${formatCLP(dte.totalAmount)}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" /> Ceder {dtes.length} facturas a factoring
          </DialogTitle>
          <DialogDescription>
            Batch · {formatCLP(totalBruto)} bruto · costos prorrateados por monto a cada
            factura
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3">
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 mb-1.5">
            Facturas seleccionadas
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {dtes.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 text-[12px]"
              >
                <span className="truncate">
                  DTE {d.dteType}-{d.folio} · {d.receiverName}
                </span>
                <span className="font-mono tabular-nums text-ds-text-2 shrink-0">
                  {formatCLP(d.totalAmount)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-ds-border-subtle flex items-center justify-between text-[13px] font-medium">
            <span>Total bruto</span>
            <span className="font-mono tabular-nums">{formatCLP(totalBruto)}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="factoringBulk">Empresa de factoring</Label>
            <Select value={factoringId} onValueChange={setFactoringId}>
              <SelectTrigger className="h-10 sm:h-9" id="factoringBulk">
                <SelectValue placeholder={loadingCompanies ? "Cargando…" : "Seleccionar"} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.razonSocial} ({c.rutFormatted})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCompany ? (
              <div className="mt-2 rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-ds-text-3 inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Datos del cesionario
                  </span>
                  <Link
                    href="/finanzas/facturacion/cesiones/factorings"
                    target="_blank"
                    rel="noopener"
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Editar catálogo <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <div className="text-xs text-ds-text-2">
                  RUT {selectedCompany.rutFormatted} · {selectedCompany.email ?? "—"}
                </div>
              </div>
            ) : null}
          </div>

          {/* Dropzone para PDF de simulación (1 doc cubre todo el batch) */}
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Simulación del cesionario (1 PDF para todo el batch)
            </Label>
            {!simulation ? (
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  setSimulationDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleSimulationFile(f);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSimulationDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setSimulationDragOver(false);
                }}
                className={cn(
                  "mt-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
                  simulationDragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50",
                )}
              >
                <input
                  type="file"
                  className="hidden"
                  id="bulk-factoring-simulation-file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSimulationFile(f);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor="bulk-factoring-simulation-file"
                  className="cursor-pointer flex flex-col items-center gap-1.5"
                >
                  {simulationUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <Paperclip className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="text-[13px] text-muted-foreground">
                    {simulationUploading
                      ? "Subiendo y extrayendo datos con IA…"
                      : "Arrastra el PDF del factoring o haz clic para seleccionar"}
                  </span>
                  <span className="text-[11px] text-ds-text-3">
                    Los costos extraídos se prorratean por monto entre las
                    {" "}{dtes.length} facturas.
                  </span>
                </label>
              </div>
            ) : (
              <div className="mt-1 rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={simulation.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium hover:underline truncate block"
                    >
                      {simulation.fileName}
                    </a>
                    <p className="text-[11px] text-ds-text-3 mt-0.5">
                      {simulation.extractionError
                        ? `Modo manual: ${simulation.extractionError}`
                        : `Datos extraídos${
                            simulation.confidence != null
                              ? ` · confianza ${Math.round(simulation.confidence * 100)}%`
                              : ""
                          }`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => setSimulation(null)}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="fcBulk">Fecha cesión</Label>
            <Input
              id="fcBulk"
              type="date"
              value={fechaCesion}
              onChange={(e) => {
                const next = e.target.value;
                setFechaCesion(next);
                setFechaVencimiento(addDaysToIso(next, diasFromDates));
              }}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="dcBulk">Días de cesión</Label>
            <Input
              id="dcBulk"
              type="number"
              min={1}
              max={365}
              value={diasFromDates}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n <= 0) return;
                setFechaVencimiento(addDaysToIso(fechaCesion, n));
              }}
              className="h-10 sm:h-9"
            />
            <p className="text-[11px] text-ds-text-3 mt-0.5">
              Vence el {new Date(`${fechaVencimiento}T00:00:00Z`)
                .toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
            </p>
          </div>
          <div>
            <Label htmlFor="arBulk">Anticipo (%)</Label>
            <Input
              id="arBulk"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={advanceRate}
              onChange={(e) => setAdvanceRate(e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="dpBulk">Diferencia de precio (CLP)</Label>
            <Input
              id="dpBulk"
              type="number"
              min="0"
              step="1"
              value={difPrecio}
              onChange={(e) => setDifPrecio(e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="comBulk">Comisión total del batch (CLP)</Label>
            <Input
              id="comBulk"
              type="number"
              min="0"
              step="1"
              value={comision}
              onChange={(e) => setComision(e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="ivaBulk">IVA comisión total (CLP)</Label>
            <Input
              id="ivaBulk"
              type="number"
              min="0"
              step="1"
              value={iva}
              onChange={(e) => setIva(e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="mgBulk">Monto a girar total (CLP)</Label>
            <Input
              id="mgBulk"
              type="number"
              min="0"
              step="1"
              value={montoAGirarTotal}
              onChange={(e) => setMontoAGirarTotal(e.target.value)}
              placeholder={String(calc.montoAGirar || "")}
              className="h-10 sm:h-9"
            />
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] text-ds-text-3">
              Todos los montos se prorratean por bruto entre las {dtes.length}
              {" "}facturas.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notesBulk">Notas internas</Label>
            <Textarea
              id="notesBulk"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3 space-y-1.5 text-sm">
          <div className="text-xs uppercase tracking-wide text-ds-text-3 mb-1">
            Totales del batch ({calc.dias} {calc.dias === 1 ? "día" : "días"})
          </div>
          <Row label="Anticipo bruto" value={formatCLP(calc.advance)} />
          <Row label="Dif. precio" value={`-${formatCLP(calc.difPrecio)}`} />
          <Row label="Comisión" value={`-${formatCLP(calc.commission)}`} />
          {calc.iva > 0 ? (
            <Row label="IVA comisión" value={`-${formatCLP(calc.iva)}`} />
          ) : null}
          <div className="border-t border-ds-border-subtle pt-1.5">
            <Row
              label="Monto a girar"
              value={formatCLP(calc.montoAGirar)}
              strong
            />
          </div>
          <Row
            label="Costo financiero"
            value={`-${formatCLP(calc.costoFinanciero)}`}
          />
          {calc.realMonthlyRate != null ? (
            <Row
              label="Tasa real mensual"
              value={`${calc.realMonthlyRate.toFixed(2)}%`}
            />
          ) : null}
          {calc.effectiveMonthlyRate != null ? (
            <Row
              label="Tasa efectiva mensual"
              value={`${calc.effectiveMonthlyRate.toFixed(2)}%`}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !factoringId}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Ceder {dtes.length} facturas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ds-text-2">{label}</span>
      <span className={`font-mono ${strong ? "font-semibold text-ds-text-1" : "text-ds-text-2"}`}>
        {value}
      </span>
    </div>
  );
}
