"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, FileSpreadsheet, Download, Loader2 } from "lucide-react";

const fmtCLP = (n: number) =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

const fmtCLPShort = (n: number) => {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n;
};

interface SummaryData {
  periodo: string;
  ventas: {
    facturasCount: number;
    notasCreditoCount: number;
    notasDebitoCount: number;
    ventaNeto: number;
    ventaIva: number;
    ncNeto: number;
    ncIva: number;
    ndNeto: number;
    ndIva: number;
    debitoFiscal: number;
  };
  compras: {
    count: number;
    compraNeto: number;
    compraIva: number;
    creditoFiscal: number;
  };
  f29: {
    debitoFiscal: number;
    creditoFiscal: number;
    ivaResultado: number;
    esIvaAFavor: boolean;
  };
}

const EYEBROW =
  "text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 font-semibold";

function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
    });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

export function LibroIvaTab() {
  const monthOptions = getMonthOptions();
  const [periodo, setPeriodo] = useState(monthOptions[0].value);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/finance/billing/iva-summary?periodo=${periodo}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setData(body.data);
      })
      .finally(() => setLoading(false));
  }, [periodo]);

  const handleExport = (direction: "ISSUED" | "RECEIVED") => {
    window.location.href = `/api/finance/billing/iva-summary/export?periodo=${periodo}&direction=${direction}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-ds-text-3" />
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="bg-ds-surface-2 border border-ds-border-default rounded-lg px-3 h-10 sm:h-9 text-sm text-ds-text-1 outline-none focus:border-status-ok-border"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("ISSUED")}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Libro Ventas (CSV)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("RECEIVED")}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Libro Compras (CSV)
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <Card className="p-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-ds-text-3" />
        </Card>
      ) : (
        <Card className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className={EYEBROW}>Libro de Ventas</div>
              <div className="space-y-1.5">
                <Row
                  label="Facturas (33+34)"
                  amount={data.ventas.ventaNeto}
                  count={data.ventas.facturasCount}
                />
                <Row label="IVA débito" amount={data.ventas.ventaIva} />
                {data.ventas.notasCreditoCount > 0 && (
                  <Row
                    label="Notas de Crédito (61)"
                    amount={-data.ventas.ncIva}
                    count={data.ventas.notasCreditoCount}
                    tone="danger"
                  />
                )}
                {data.ventas.notasDebitoCount > 0 && (
                  <Row
                    label="Notas de Débito (56)"
                    amount={data.ventas.ndIva}
                    count={data.ventas.notasDebitoCount}
                  />
                )}
                <div className="flex justify-between pt-2 border-t border-ds-border-subtle">
                  <span className="font-semibold text-status-ok-fg">
                    Débito fiscal neto
                  </span>
                  <span className="font-mono font-bold text-status-ok-fg ds-num">
                    {fmtCLP(data.f29.debitoFiscal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 lg:border-l lg:border-ds-border-subtle lg:pl-6">
              <div className={EYEBROW}>Libro de Compras</div>
              <div className="space-y-1.5">
                <Row
                  label="Facturas recibidas"
                  amount={data.compras.compraNeto}
                  count={data.compras.count}
                />
                <Row label="IVA crédito" amount={data.compras.compraIva} />
                <div className="flex justify-between pt-2 border-t border-ds-border-subtle">
                  <span className="font-semibold text-status-warn-fg">
                    Crédito fiscal
                  </span>
                  <span className="font-mono font-bold text-status-warn-fg ds-num">
                    {fmtCLP(data.f29.creditoFiscal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 lg:border-l lg:border-ds-border-subtle lg:pl-6">
              <div className={EYEBROW}>F29 — Resultado</div>
              <div
                className={
                  data.f29.esIvaAFavor
                    ? "rounded-lg border bg-status-info-soft border-status-info-border p-4"
                    : "rounded-lg border bg-status-ok-soft border-status-ok-border p-4"
                }
              >
                <div
                  className={
                    data.f29.esIvaAFavor
                      ? "text-[11px] font-mono uppercase tracking-[0.08em] text-status-info-fg mb-1"
                      : "text-[11px] font-mono uppercase tracking-[0.08em] text-status-ok-fg mb-1"
                  }
                >
                  {data.f29.esIvaAFavor ? "IVA a favor" : "IVA a pagar"}
                </div>
                <div
                  className={
                    data.f29.esIvaAFavor
                      ? "font-display text-3xl font-bold tracking-tight text-status-info-fg ds-num"
                      : "font-display text-3xl font-bold tracking-tight text-status-ok-fg ds-num"
                  }
                >
                  {fmtCLP(Math.abs(data.f29.ivaResultado))}
                </div>
                <div className="text-[12px] text-ds-text-3 mt-2">
                  Débito {fmtCLPShort(data.f29.debitoFiscal)} − Crédito{" "}
                  {fmtCLPShort(data.f29.creditoFiscal)}
                </div>
              </div>
              <div className="text-[12px] text-ds-text-3 leading-relaxed">
                Genera tu Formulario 29 con un clic. Los CSV cumplen el formato
                del SII para subida directa.
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  amount,
  count,
  tone,
}: {
  label: string;
  amount: number;
  count?: number;
  tone?: "danger";
}) {
  const labelCls = tone === "danger" ? "text-status-danger-fg" : "text-ds-text-2";
  const numCls =
    tone === "danger"
      ? "font-mono ds-num text-status-danger-fg"
      : "font-mono ds-num text-ds-text-1";
  return (
    <div className="flex justify-between text-sm">
      <span className={labelCls}>
        {label}
        {count != null && (
          <span className="ml-1 text-[12px] text-ds-text-3">({count})</span>
        )}
      </span>
      <span className={numCls}>{fmtCLP(amount)}</span>
    </div>
  );
}
