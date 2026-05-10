"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";

interface CashflowQuote {
  id: string;
  code: string;
  name: string | null;
  clientName: string | null;
  monthlyCost: string | number;
  currency: string;
  contractStartDate: string | null;
  contractDuration: number;
  paymentDays: number;
  paymentDayMode: string;
  paymentTerms: string;
  installationId: string | null;
  installation: { id: string; name: string } | null;
}

interface InstallationLite {
  id: string;
  name: string;
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const PAYMENT_DAY_MODE_LABELS: Record<string, string> = {
  SPECIFIC_DAY: "Día específico del mes",
  FIRST_BUSINESS_DAY: "Primer día hábil del mes",
  LAST_BUSINESS_DAY: "Último día hábil del mes",
  FIRST_MONDAY: "Primer lunes del mes",
};

export function AccountCashflowQuotesSection({ accountId }: { accountId: string }) {
  const [quotes, setQuotes] = useState<CashflowQuote[]>([]);
  const [installations, setInstallations] = useState<InstallationLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<CashflowQuote | null>(null);
  const [draftInstallationId, setDraftInstallationId] = useState<string>("");
  const [draftMode, setDraftMode] = useState<string>("SPECIFIC_DAY");
  const [draftDay, setDraftDay] = useState<string>("5");
  const [saving, setSaving] = useState(false);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/accounts/${accountId}/cashflow-quotes`);
      const j = await r.json();
      if (j?.success) {
        setQuotes(j.data.quotes);
        setInstallations(j.data.installations);
      }
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  function openEdit(q: CashflowQuote) {
    setEditing(q);
    setDraftInstallationId(q.installationId ?? "");
    setDraftMode(q.paymentDayMode);
    setDraftDay(String(q.paymentDays));
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        installationId: draftInstallationId || null,
        paymentDayMode: draftMode,
      };
      if (draftMode === "SPECIFIC_DAY") {
        const n = Number(draftDay);
        if (!Number.isFinite(n) || n < 1 || n > 28) {
          toast.error("Día debe ser entre 1 y 28");
          setSaving(false);
          return;
        }
        body.paymentDays = n;
      }
      const r = await fetch(
        `/api/crm/accounts/${accountId}/cashflow-quotes/${editing.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const j = await r.json();
      if (j?.success) {
        toast.success("Configuración guardada");
        setEditing(null);
        fetchQuotes();
      } else {
        toast.error(j?.error ?? "Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando cotizaciones...
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Wallet className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No hay cotizaciones activas para flujo de caja
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Una cotización aparece acá cuando está aceptada y tiene fecha de inicio de contrato.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Contratos activos en flujo de caja</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cada cotización aceptada se proyecta mensualmente. Configura instalación y día de pago para que la proyección sea exacta.
        </p>
      </div>

      <div className="space-y-2">
        {quotes.map((q) => {
          const monthly = fmt.format(Number(q.monthlyCost));
          return (
            <div
              key={q.id}
              className="flex items-start sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 flex-col sm:flex-row"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {q.installation?.name ?? "Sin instalación"}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {q.code}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {q.currency} {monthly} / mes
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    Inicio:{" "}
                    {q.contractStartDate
                      ? new Date(q.contractStartDate).toLocaleDateString("es-CL")
                      : "—"}
                  </span>
                  <span>Duración: {q.contractDuration} meses</span>
                  <span>
                    Pago:{" "}
                    {PAYMENT_DAY_MODE_LABELS[q.paymentDayMode] ?? q.paymentDayMode}
                    {q.paymentDayMode === "SPECIFIC_DAY" && ` (día ${q.paymentDays})`}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => openEdit(q)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Configurar
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.installation?.name ?? "Cotización"} ·{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {editing?.code}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Instalación</Label>
              <Select value={draftInstallationId} onValueChange={setDraftInstallationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin instalación" />
                </SelectTrigger>
                <SelectContent>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">
                La instalación que pagará por este contrato. Se usa para agrupar la proyección.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Día de pago</Label>
              <Select value={draftMode} onValueChange={setDraftMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPECIFIC_DAY">Día específico del mes</SelectItem>
                  <SelectItem value="FIRST_BUSINESS_DAY">Primer día hábil del mes</SelectItem>
                  <SelectItem value="LAST_BUSINESS_DAY">Último día hábil del mes</SelectItem>
                  <SelectItem value="FIRST_MONDAY">Primer lunes del mes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draftMode === "SPECIFIC_DAY" && (
              <div className="space-y-2">
                <Label>Día del mes (1-28)</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={draftDay}
                  onChange={(e) => setDraftDay(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
