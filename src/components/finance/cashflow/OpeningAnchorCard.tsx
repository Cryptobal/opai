"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const fmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});
const fmtNumber = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/**
 * Card prominente que solo aparece para tenants sin ningún anchor activo
 * en FinanceCashflowWeeklyClose. Permite sellar el saldo banco real de
 * hoy como punto de partida del flujo de caja. Sin efecto contable.
 */
export function OpeningAnchorCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAnchor, setHasAnchor] = useState<boolean | null>(null);
  const [suggested, setSuggested] = useState<number>(0);
  const [override, setOverride] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/finance/cashflow/anchor-status")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setHasAnchor(Boolean(j.data.hasAnchor));
          setSuggested(Number(j.data.suggestedOpeningBalanceClp ?? 0));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    const value = override ? Number(override) : suggested;
    if (!Number.isFinite(value)) {
      toast.error("Saldo inválido");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/cashflow/opening-anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankBalanceClp: value }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Flujo cuadrado con el banco. ¡Listo para proyectar!");
      setHasAnchor(true);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || hasAnchor !== false) return null;

  return (
    <Card className="border-status-info-border bg-status-info-soft/30 mb-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Sparkles className="h-5 w-5 text-status-info-fg shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold">
              Empezá el flujo cuadrado con tu banco
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Esto sella el saldo de hoy como punto de partida del flujo de
              caja. La proyección hacia adelante parte desde acá, ignorando
              ruido histórico. No afecta tu balance contable.
            </p>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3 w-3" /> Saldo banco consolidado hoy
          </div>
          <span className="font-mono text-sm font-semibold">
            {fmt.format(suggested)}
          </span>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Saldo de apertura (CLP) — opcional override
          </label>
          <Input
            inputMode="numeric"
            placeholder={fmtNumber.format(suggested)}
            value={override}
            onChange={(e) => setOverride(e.target.value.replace(/\D/g, ""))}
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Dejá vacío para usar el saldo consolidado de hoy.
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={submitting} className="w-full">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Sellar saldo y empezar a proyectar
        </Button>
      </CardContent>
    </Card>
  );
}
