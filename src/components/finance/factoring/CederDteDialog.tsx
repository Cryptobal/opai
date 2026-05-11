"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, ExternalLink, Loader2, Lock } from "lucide-react";
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
  totalAmount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dte: DteSummary;
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

export function CederDteDialog({ open, onOpenChange, dte }: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState<FactoringCompanyOpt[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [factoringId, setFactoringId] = useState<string>("");
  const [fechaCesion, setFechaCesion] = useState(todayIso);
  const [fechaVencimiento, setFechaVencimiento] = useState(() => isoPlusDays(60));
  const [advanceRate, setAdvanceRate] = useState<string>("90");
  const [interestRate, setInterestRate] = useState<string>("1.5");
  const [commissionAmount, setCommissionAmount] = useState<string>("0");
  const [emailDeudor, setEmailDeudor] = useState("");
  const [notes, setNotes] = useState("");

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

  // Auto-rellenar tasas y comisión (CLP) al elegir factoring del catálogo.
  useEffect(() => {
    if (!selectedCompany) return;
    if (selectedCompany.defaultAdvanceRate !== null)
      setAdvanceRate(String(selectedCompany.defaultAdvanceRate));
    if (selectedCompany.defaultInterestRate !== null)
      setInterestRate(String(selectedCompany.defaultInterestRate));
    if (selectedCompany.defaultCommissionAmount !== null)
      setCommissionAmount(String(Math.round(selectedCompany.defaultCommissionAmount)));
  }, [selectedCompany]);

  // Cálculos en vivo.
  const calc = useMemo(() => {
    const aRate = Number(advanceRate) || 0;
    const iRate = Number(interestRate) || 0;
    const cClp = Math.max(0, Number(commissionAmount) || 0);
    const cesion = new Date(`${fechaCesion}T00:00:00Z`);
    const venc = new Date(`${fechaVencimiento}T00:00:00Z`);
    const dias = Math.max(1, Math.round((venc.getTime() - cesion.getTime()) / 86400000));
    const advance = dte.totalAmount * (aRate / 100);
    const interest = advance * (iRate / 100) * (dias / 30);
    const commission = cClp;
    const net = advance - interest - commission;
    const retention = dte.totalAmount - advance;
    return {
      dias,
      advance: Math.round(advance),
      interest: Math.round(interest),
      commission: Math.round(commission),
      net: Math.round(net),
      retention: Math.round(retention),
    };
  }, [advanceRate, interestRate, commissionAmount, fechaCesion, fechaVencimiento, dte.totalAmount]);

  async function handleSubmit() {
    if (!factoringId) {
      toast.error("Seleccioná una empresa de factoring");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/billing/issued/${dte.id}/cede`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoringCompanyId: factoringId,
          fechaCesion,
          fechaVencimiento,
          advanceRate: Number(advanceRate),
          interestRate: Number(interestRate),
          commissionAmount: Math.max(0, Number(commissionAmount) || 0),
          emailDeudor: emailDeudor.trim() || undefined,
          notes: notes.trim() || undefined,
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
            <Label htmlFor="fechaVencimiento">Vencimiento factura</Label>
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
            <Label htmlFor="interestRate">Interés mensual (%)</Label>
            <Input
              id="interestRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="h-10 sm:h-9"
            />
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
            <Label htmlFor="emailDeudor">Email deudor (opcional)</Label>
            <Input
              id="emailDeudor"
              type="email"
              value={emailDeudor}
              onChange={(e) => setEmailDeudor(e.target.value)}
              className="h-10 sm:h-9"
            />
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
            Cálculos ({calc.dias} días)
          </div>
          <CalcRow label="Anticipo" value={formatCLP(calc.advance)} />
          <CalcRow label={`Interés (${interestRate}% × ${calc.dias}d)`} value={`-${formatCLP(calc.interest)}`} />
          <CalcRow label="Comisión" value={`-${formatCLP(calc.commission)}`} />
          <div className="border-t border-ds-border-subtle pt-1.5">
            <CalcRow label="Neto a girar" value={formatCLP(calc.net)} strong />
          </div>
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
