"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Coins,
  ExternalLink,
  Loader2,
  Lock,
  Paperclip,
  FileText,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

interface DteSummary {
  id: string;
  dteType: number;
  folio: number;
  receiverName: string;
  /** Correo del receptor en la factura; se antepone en la cesión Octava. */
  receiverEmail?: string | null;
  /** Copias configuradas al emitir / reenviar el DTE. */
  receiverEmailCc?: string[] | null;
  totalAmount: number;
  /** Fecha de emisión del DTE, formato ISO o YYYY-MM-DD. */
  date?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dte: DteSummary;
}

/** Snapshot del PDF de simulación subido por el usuario + campos extraídos.
 *  Si el modelo IA no logró extraer un campo, queda null y el usuario lo
 *  edita a mano en los inputs del modal. */
interface SimulationState {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  extractedJson: unknown;
  /** Si la IA falló, viene una razón legible. UI muestra modo manual. */
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

function formatDayMonth(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function normalizeEmailKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Principal primero, luego CC, sin duplicados (case-insensitive). */
function collectReceiverEmails(
  primary?: string | null,
  cc?: string[] | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | undefined | null) => {
    const e = raw?.trim();
    if (!e) return;
    const key = normalizeEmailKey(e);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  push(primary);
  for (const x of cc ?? []) push(x);
  return out;
}

function defaultDeudorEmailFromDte(
  dte: Pick<DteSummary, "receiverEmail" | "receiverEmailCc">,
): string {
  const list = collectReceiverEmails(dte.receiverEmail, dte.receiverEmailCc);
  return list[0] ?? "";
}

function labelDeudorEmailOption(email: string, primary?: string | null): string {
  const p = primary?.trim().toLowerCase();
  const e = email.trim().toLowerCase();
  const tag = p && e === p ? "Principal" : "Copia (CC)";
  return `${email} · ${tag}`;
}

export function CederDteDialog({ open, onOpenChange, dte }: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState<FactoringCompanyOpt[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [factoringId, setFactoringId] = useState<string>("");
  const [fechaCesion, setFechaCesion] = useState(todayIso);
  const [fechaVencimiento, setFechaVencimiento] = useState(() => isoPlusDays(60));
  const [advanceRate, setAdvanceRate] = useState<string>("90");
  // Los 4 montos del cesionario son la ÚNICA fuente: vienen del PDF o
  // los tipea el usuario. La tasa efectiva mensual se DERIVA — ya no
  // hay input "interés %".
  const [commissionAmount, setCommissionAmount] = useState<string>("0");
  const [difPrecioAmount, setDifPrecioAmount] = useState<string>("0");
  const [ivaAmount, setIvaAmount] = useState<string>("0");
  const [montoAGirarAmount, setMontoAGirarAmount] = useState<string>("");
  const [emailDeudor, setEmailDeudor] = useState("");
  const [notes, setNotes] = useState("");

  // ── Simulación del cesionario (Fase 1) ─────────────────────────
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [simulationUploading, setSimulationUploading] = useState(false);
  const [simulationDragOver, setSimulationDragOver] = useState(false);

  // Anteponer email del receptor del DTE al abrir (Octava exige email del deudor).
  useEffect(() => {
    if (!open) return;
    setEmailDeudor(defaultDeudorEmailFromDte(dte));
  }, [open, dte.id, dte.receiverEmail, dte.receiverEmailCc]);

  useEffect(() => {
    if (!open) return;
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

  const deudorEmailCandidates = useMemo(
    () => collectReceiverEmails(dte.receiverEmail, dte.receiverEmailCc),
    [dte.receiverEmail, dte.receiverEmailCc],
  );

  const deudorEmailPresetValue = useMemo(() => {
    if (deudorEmailCandidates.length === 0) return "__custom__";
    const cur = emailDeudor.trim();
    if (!cur) return "__custom__";
    const match = deudorEmailCandidates.find(
      (e) => normalizeEmailKey(e) === normalizeEmailKey(cur),
    );
    return match ?? "__custom__";
  }, [deudorEmailCandidates, emailDeudor]);

  // Reset estado simulación cuando se cierra el modal.
  useEffect(() => {
    if (!open) {
      setSimulation(null);
      setSimulationUploading(false);
      setSimulationDragOver(false);
    }
  }, [open]);

  // Upload + extracción IA del PDF de simulación. No bloquea la cesión:
  // si la IA falla, el archivo queda subido y los campos siguen
  // editables manualmente.
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
      // Pre-fill de los 4 inputs CLP con lo que extrajo la IA. El
      // usuario los puede ajustar antes de ceder. Sin PDF, los tipea
      // todos a mano (ese es el camino "manual").
      if (sim.comision != null) setCommissionAmount(String(Math.round(sim.comision)));
      if (sim.difPrecio != null) setDifPrecioAmount(String(Math.round(sim.difPrecio)));
      if (sim.iva != null) setIvaAmount(String(Math.round(sim.iva)));
      if (sim.montoAGirar != null)
        setMontoAGirarAmount(String(Math.round(sim.montoAGirar)));
      if (sim.porcAnticipo != null) setAdvanceRate(String(sim.porcAnticipo));
      if (sim.extractionError) {
        toast.warning("PDF subido. No se pudieron extraer los datos — completa a mano.");
      } else {
        toast.success("Datos extraídos del PDF. Revisa antes de ceder.");
      }
    } catch {
      toast.error("Error de conexión al subir el PDF");
    } finally {
      setSimulationUploading(false);
    }
  }

  function removeSimulation() {
    setSimulation(null);
  }

  // Auto-rellenar anticipo y comisión (CLP) al elegir factoring del catálogo.
  // El "interés mensual" default que tenían algunos catálogos legacy ya
  // no se usa como input — la tasa efectiva real se deriva de los 4
  // montos CLP cuando hay simulación o entrada manual.
  useEffect(() => {
    if (!selectedCompany) return;
    if (selectedCompany.defaultAdvanceRate !== null)
      setAdvanceRate(String(selectedCompany.defaultAdvanceRate));
    if (selectedCompany.defaultCommissionAmount !== null)
      setCommissionAmount(String(Math.round(selectedCompany.defaultCommissionAmount)));
  }, [selectedCompany]);

  // Cálculos en vivo, derivados de los 4 inputs CLP (única fuente de
  // verdad). El usuario tipea/PDF rellena monto a girar, dif. precio,
  // comisión, IVA; el resto se calcula automáticamente.
  const calc = useMemo(() => {
    const aRate = Number(advanceRate) || 0;
    const commissionClp = Math.max(0, Number(commissionAmount) || 0);
    const difPrecioClp = Math.max(0, Number(difPrecioAmount) || 0);
    const ivaClp = Math.max(0, Number(ivaAmount) || 0);
    const montoAGirarTyped = Number(montoAGirarAmount);
    const cesion = new Date(`${fechaCesion}T00:00:00Z`);
    const venc = new Date(`${fechaVencimiento}T00:00:00Z`);
    const dias = Math.max(1, Math.round((venc.getTime() - cesion.getTime()) / 86400000));
    const advance = dte.totalAmount * (aRate / 100);
    // Si el usuario tipeó monto a girar, esa es la verdad y derivamos
    // costo financiero de ahí. Sino, costo financiero = dif precio +
    // comisión + IVA (los descuentos conocidos) y monto a girar es la
    // resta del anticipo.
    const hasMontoAGirar =
      Number.isFinite(montoAGirarTyped) && montoAGirarTyped > 0;
    const montoAGirar = hasMontoAGirar
      ? montoAGirarTyped
      : Math.max(0, advance - difPrecioClp - commissionClp - ivaClp);
    const costoFinanciero = Math.max(0, dte.totalAmount - montoAGirar);
    const retention = dte.totalAmount - advance;
    const effectiveMonthlyRate =
      advance > 0 && dias > 0
        ? (costoFinanciero / advance) * (30 / dias) * 100
        : null;
    return {
      dias,
      advance: Math.round(advance),
      difPrecio: Math.round(difPrecioClp),
      commission: Math.round(commissionClp),
      iva: Math.round(ivaClp),
      costoFinanciero: Math.round(costoFinanciero),
      montoAGirar: Math.round(montoAGirar),
      retention: Math.round(retention),
      effectiveMonthlyRate,
      hasMontoAGirar,
    };
  }, [
    advanceRate,
    commissionAmount,
    difPrecioAmount,
    ivaAmount,
    montoAGirarAmount,
    fechaCesion,
    fechaVencimiento,
    dte.totalAmount,
  ]);

  async function handleSubmit() {
    if (!factoringId) {
      toast.error("Seleccioná una empresa de factoring");
      return;
    }
    setSubmitting(true);
    try {
      // Construir snapshot a partir de los inputs CLP (ÚNICA fuente).
      // Si hay PDF cargado, traemos también el storage key + JSON
      // extraído para auditoría, pero los valores numéricos vienen
      // de los inputs actuales (que el usuario pudo haber editado).
      const simPayload = {
        fileUrl: simulation?.fileUrl ?? undefined,
        fileKey: simulation?.fileKey ?? undefined,
        fileName: simulation?.fileName ?? undefined,
        extractedJson: simulation?.extractedJson,
        montoBruto: simulation?.montoBruto ?? dte.totalAmount,
        montoAGirar: calc.montoAGirar,
        difPrecio: calc.difPrecio,
        comision: calc.commission,
        iva: calc.iva,
        gastosLegal: simulation?.gastosLegal ?? null,
        notaria: simulation?.notaria ?? null,
        gastosOperacionales: simulation?.gastosOperacionales ?? null,
      };
      const res = await fetch(`/api/finance/billing/issued/${dte.id}/cede`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoringCompanyId: factoringId,
          fechaCesion,
          fechaVencimiento,
          advanceRate: Number(advanceRate),
          // interestRate derivado de los inputs CLP. El server podría
          // calcularlo igual; lo mandamos para que `FinanceFactoringOperation.
          // interestRate` no quede en 0 cuando hay datos reales.
          interestRate: calc.effectiveMonthlyRate ?? 0,
          commissionAmount: calc.commission,
          emailDeudor: emailDeudor.trim() || undefined,
          notes: notes.trim() || undefined,
          simulation: simPayload,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error cediendo el DTE");
        return;
      }
      toast.success(`Cesión enviada al SII (TrackId ${json.trackId ?? "—"})`);
      onOpenChange(false);
      router.push(`/finanzas/facturacion/cesiones/${json.operationId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" /> Ceder factura a factoring
          </DialogTitle>
          <DialogDescription>
            DTE {dte.dteType}-{dte.folio} · {dte.receiverName} · {formatCLP(dte.totalAmount)}
            {formatDayMonth(dte.date) ? (
              <span className="block text-[11px] text-ds-text-3 mt-0.5">
                Emitida el {formatDayMonth(dte.date)}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="factoring">Empresa de factoring</Label>
            <Select value={factoringId} onValueChange={setFactoringId}>
              <SelectTrigger className="h-10 sm:h-9" id="factoring">
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
                    <Lock className="h-3 w-3" /> Datos del cesionario (desde catálogo)
                  </span>
                  <Link
                    href="/finanzas/facturacion/cesiones/factorings"
                    target="_blank"
                    rel="noopener"
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Editar en catálogo <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ds-text-3">RUT</dt>
                    <dd className="text-ds-text-1 font-mono">
                      {selectedCompany.rutFormatted}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:col-span-1">
                    <dt className="text-ds-text-3">Email</dt>
                    <dd className="text-ds-text-1 truncate">
                      {selectedCompany.email ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:col-span-2">
                    <dt className="text-ds-text-3">Dirección</dt>
                    <dd className="text-ds-text-1 truncate">
                      {selectedCompany.direccion ?? "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>

          {/* ─── Dropzone: PDF de simulación del factoring (Fase 1) ─── */}
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Simulación del cesionario (opcional)
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
                  id="factoring-simulation-file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSimulationFile(f);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor="factoring-simulation-file"
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
                      : "Arrastra el PDF que envió el factoring o haz clic para seleccionar"}
                  </span>
                  <span className="text-[11px] text-ds-text-3">
                    Los datos (monto a girar, comisión, dif. precio, IVA, gastos)
                    se rellenan automáticamente.
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
                        : `Datos extraídos por IA${
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
                    onClick={removeSimulation}
                    type="button"
                    title="Quitar PDF"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {!simulation.extractionError && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono">
                    {simulation.montoAGirar != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ds-text-3">Monto a girar</dt>
                        <dd className="text-ds-text-1">
                          {formatCLP(simulation.montoAGirar)}
                        </dd>
                      </div>
                    )}
                    {simulation.difPrecio != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ds-text-3">Dif. precio</dt>
                        <dd className="text-ds-text-1">
                          {formatCLP(simulation.difPrecio)}
                        </dd>
                      </div>
                    )}
                    {simulation.comision != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ds-text-3">Comisión</dt>
                        <dd className="text-ds-text-1">
                          {formatCLP(simulation.comision)}
                        </dd>
                      </div>
                    )}
                    {simulation.iva != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ds-text-3">IVA</dt>
                        <dd className="text-ds-text-1">
                          {formatCLP(simulation.iva)}
                        </dd>
                      </div>
                    )}
                    {(simulation.gastosLegal ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ds-text-3">Gasto legal</dt>
                        <dd className="text-ds-text-1">
                          {formatCLP(simulation.gastosLegal ?? 0)}
                        </dd>
                      </div>
                    )}
                    {(simulation.notaria ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ds-text-3">Notaría</dt>
                        <dd className="text-ds-text-1">
                          {formatCLP(simulation.notaria ?? 0)}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="fechaCesion">Fecha cesión</Label>
            <Input
              id="fechaCesion"
              type="date"
              value={fechaCesion}
              onChange={(e) => setFechaCesion(e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="fechaVencimiento" className="flex items-center justify-between gap-2">
              <span>Vencimiento factura</span>
              <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 rounded-md bg-ds-surface-2 border border-ds-border-subtle px-1.5 py-0.5">
                {calc.dias} {calc.dias === 1 ? "día" : "días"}
              </span>
            </Label>
            <Input
              id="fechaVencimiento"
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="advanceRate">Anticipo (%)</Label>
            <Input
              id="advanceRate"
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
            <Label htmlFor="difPrecioAmount">Diferencia de precio (CLP)</Label>
            <Input
              id="difPrecioAmount"
              type="number"
              min="0"
              step="1"
              value={difPrecioAmount}
              onChange={(e) => setDifPrecioAmount(e.target.value)}
              className="h-10 sm:h-9"
            />
            <p className="text-[10px] text-ds-text-3 mt-0.5">
              El interés total cobrado por el plazo, en pesos.
            </p>
          </div>
          <div>
            <Label htmlFor="commissionAmount">Comisión (CLP)</Label>
            <Input
              id="commissionAmount"
              type="number"
              min="0"
              step="1"
              value={commissionAmount}
              onChange={(e) => setCommissionAmount(e.target.value)}
              placeholder={
                selectedCompany?.defaultCommissionAmount != null
                  ? String(Math.round(selectedCompany.defaultCommissionAmount))
                  : "0"
              }
              className="h-10 sm:h-9"
            />
            <p className="text-[10px] text-ds-text-3 mt-0.5">
              {selectedCompany
                ? "Default desde catálogo. Editable para esta cesión."
                : "Se rellena al elegir la empresa de factoring."}
            </p>
          </div>
          <div>
            <Label htmlFor="ivaAmount">IVA comisión (CLP)</Label>
            <Input
              id="ivaAmount"
              type="number"
              min="0"
              step="1"
              value={ivaAmount}
              onChange={(e) => setIvaAmount(e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="montoAGirarAmount">Monto a girar (CLP)</Label>
            <Input
              id="montoAGirarAmount"
              type="number"
              min="0"
              step="1"
              value={montoAGirarAmount}
              onChange={(e) => setMontoAGirarAmount(e.target.value)}
              placeholder={String(calc.montoAGirar || "")}
              className="h-10 sm:h-9"
            />
            <p className="text-[10px] text-ds-text-3 mt-0.5">
              {calc.hasMontoAGirar
                ? "Valor real del cesionario. Costo financiero se deriva de aquí."
                : "Vacío: se calcula como anticipo − dif. precio − comisión − IVA."}
            </p>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="emailDeudor">Correo del deudor para la cesión</Label>
            {deudorEmailCandidates.length > 0 ? (
              <Select
                value={deudorEmailPresetValue}
                onValueChange={(v) => {
                  if (v !== "__custom__") setEmailDeudor(v);
                }}
              >
                <SelectTrigger id="emailDeudorPreset" className="h-10 sm:h-9 w-full">
                  <SelectValue placeholder="Elegir entre los correos del DTE…" />
                </SelectTrigger>
                <SelectContent>
                  {deudorEmailCandidates.map((e, i) => (
                    <SelectItem key={`${e}-${i}`} value={e}>
                      {labelDeudorEmailOption(e, dte.receiverEmail)}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Otro correo (editar abajo)</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Input
              id="emailDeudor"
              type="email"
              value={emailDeudor}
              onChange={(e) => setEmailDeudor(e.target.value)}
              className="h-10 sm:h-9"
              placeholder="facturacion@cliente.cl"
            />
            <p className="text-xs text-ds-text-3">
              Es el contacto del receptor de la factura (tu cliente), no el del factoring. Obligatorio
              con App Octava. En el detalle del DTE los correos son solo lectura; la cesión se completa
              acá. Si hay varios (principal y CC), elegí uno en la lista o escribí otro.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notas internas</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3 space-y-1.5 text-sm">
          <div className="text-xs uppercase tracking-wide text-ds-text-3 mb-1">
            Resumen ({calc.dias} {calc.dias === 1 ? "día" : "días"})
          </div>
          <CalcRow label="Anticipo bruto" value={formatCLP(calc.advance)} />
          <CalcRow
            label="Dif. precio (interés CLP)"
            value={`-${formatCLP(calc.difPrecio)}`}
          />
          <CalcRow label="Comisión" value={`-${formatCLP(calc.commission)}`} />
          {calc.iva > 0 ? (
            <CalcRow label="IVA comisión" value={`-${formatCLP(calc.iva)}`} />
          ) : null}
          <div className="border-t border-ds-border-subtle pt-1.5">
            <CalcRow
              label="Monto a girar"
              value={formatCLP(calc.montoAGirar)}
              strong
            />
          </div>
          <CalcRow
            label="Costo financiero"
            value={`-${formatCLP(calc.costoFinanciero)}`}
          />
          {calc.effectiveMonthlyRate != null ? (
            <CalcRow
              label="Tasa efectiva mensual"
              value={`${calc.effectiveMonthlyRate.toFixed(2)}%`}
            />
          ) : null}
          <CalcRow label="Retención" value={formatCLP(calc.retention)} muted />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !factoringId}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Ceder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalcRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? "text-xs text-ds-text-3" : "text-xs text-ds-text-2"}>{label}</span>
      <span
        className={`font-mono ${strong ? "font-semibold text-ds-text-1" : muted ? "text-ds-text-3" : "text-ds-text-2"}`}
      >
        {value}
      </span>
    </div>
  );
}
