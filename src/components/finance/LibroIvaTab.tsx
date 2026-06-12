"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  FileSpreadsheet,
  Download,
  Loader2,
  Info,
} from "lucide-react";

const fmtCLP = (n: number) =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

interface F29Documento {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  dteType: number;
  folio: number;
  date: string;
  rut: string;
  name: string;
  netAmount: number;
  exemptAmount: number;
  taxAmount: number;
  totalAmount: number;
  siiStatus: string;
  sign: 1 | -1 | 0;
}

interface SummaryData {
  periodo: string;
  ventas: {
    facturasCount: number;
    exentasCount: number;
    notasCreditoCount: number;
    notasDebitoCount: number;
    ventaNeto: number;
    ventaExento: number;
    ventaIva: number;
    ncNeto: number;
    ncIva: number;
    ndNeto: number;
    ndIva: number;
    debitoFiscal: number;
  };
  compras: {
    count: number;
    exentasCount: number;
    notasCreditoCount: number;
    notasDebitoCount: number;
    compraNeto: number;
    compraExento: number;
    compraIva: number;
    ncNeto: number;
    ncIva: number;
    ndIva: number;
    creditoFiscal: number;
  };
  f29: {
    debitoFiscal: number;
    creditoFiscal: number;
    remanenteAnterior: number;
    ivaDeterminado: number;
    ppmBase: number;
    ppmRatePct: number;
    ppmMonto: number;
    totalAPagar: number;
    esIvaAFavor: boolean;
    remanenteSiguiente: number;
  };
  documentos: F29Documento[];
}

const EYEBROW =
  "text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3 font-semibold";

const DTE_LABELS: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
  39: "Boleta",
  41: "Boleta exenta",
  46: "Factura de compra",
  52: "Guía de despacho",
  56: "Nota de débito",
  61: "Nota de crédito",
};

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < 36; i++) {
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

/** "2026-05" → "junio 2026" (mes siguiente, cuando se declara/paga el F29). */
function declarationMonthLabel(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(y, m, 1);
  return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

export function LibroIvaTab() {
  const monthOptions = useMemo(getMonthOptions, []);
  // Default: mes ANTERIOR — es el período que se declara/paga este mes.
  // El mes en curso siempre está incompleto y confunde la lectura del F29.
  const [periodo, setPeriodo] = useState(
    monthOptions[1]?.value ?? monthOptions[0].value,
  );
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

  const isCurrentMonth = periodo === currentMonthValue();
  const ventasDocs = data?.documentos.filter((d) => d.direction === "ISSUED") ?? [];
  const comprasDocs = data?.documentos.filter((d) => d.direction === "RECEIVED") ?? [];

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

      {isCurrentMonth && (
        <div className="flex items-start gap-2 rounded-lg border border-status-warn-border bg-status-warn-soft p-3 text-[13px] text-status-warn-fg">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Estás viendo el <strong>mes en curso</strong>: los documentos aún
            están llegando y el resultado es parcial. El F29 que se paga este
            mes corresponde al período anterior.
          </span>
        </div>
      )}

      {loading || !data ? (
        <Card className="p-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-ds-text-3" />
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className={EYEBROW}>Libro de Ventas</div>
                <div className="space-y-1.5">
                  <Row
                    label="Facturas afectas (33)"
                    amount={data.ventas.ventaNeto}
                    count={data.ventas.facturasCount}
                  />
                  {data.ventas.ventaExento > 0 && (
                    <Row
                      label="Ventas exentas"
                      amount={data.ventas.ventaExento}
                      count={data.ventas.exentasCount || undefined}
                    />
                  )}
                  <Row label="IVA débito" amount={data.ventas.ventaIva} />
                  {data.ventas.notasDebitoCount > 0 && (
                    <Row
                      label="Notas de Débito (56)"
                      amount={data.ventas.ndIva}
                      count={data.ventas.notasDebitoCount}
                    />
                  )}
                  {data.ventas.notasCreditoCount > 0 && (
                    <Row
                      label="Notas de Crédito (61)"
                      amount={-data.ventas.ncIva}
                      count={data.ventas.notasCreditoCount}
                      tone="danger"
                    />
                  )}
                  <div className="flex justify-between pt-2 border-t border-ds-border-subtle">
                    <span className="font-semibold text-status-ok-fg">
                      Débito fiscal
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
                    label="Facturas recibidas (33/46)"
                    amount={data.compras.compraNeto}
                    count={data.compras.count}
                  />
                  {data.compras.compraExento > 0 && (
                    <Row
                      label="Compras exentas (34)"
                      amount={data.compras.compraExento}
                      count={data.compras.exentasCount || undefined}
                    />
                  )}
                  <Row label="IVA crédito" amount={data.compras.compraIva} />
                  {data.compras.notasDebitoCount > 0 && (
                    <Row
                      label="Notas de Débito recibidas"
                      amount={data.compras.ndIva}
                      count={data.compras.notasDebitoCount}
                    />
                  )}
                  {data.compras.notasCreditoCount > 0 && (
                    <Row
                      label="Notas de Crédito recibidas"
                      amount={-data.compras.ncIva}
                      count={data.compras.notasCreditoCount}
                      tone="danger"
                    />
                  )}
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
                <div className={EYEBROW}>F29 — Determinación</div>
                <div className="space-y-1.5">
                  <Row label="Débito fiscal" amount={data.f29.debitoFiscal} />
                  <Row
                    label="Crédito fiscal"
                    amount={-data.f29.creditoFiscal}
                    tone="danger"
                  />
                  {data.f29.remanenteAnterior > 0 && (
                    <Row
                      label="Remanente período anterior"
                      amount={-data.f29.remanenteAnterior}
                      tone="danger"
                    />
                  )}
                  <Row
                    label={
                      data.f29.esIvaAFavor
                        ? "IVA determinado (a favor)"
                        : "IVA determinado"
                    }
                    amount={data.f29.ivaDeterminado}
                  />
                  {data.f29.ppmRatePct > 0 ? (
                    <Row
                      label={`PPM (${data.f29.ppmRatePct.toLocaleString("es-CL")}% s/ventas)`}
                      amount={data.f29.ppmMonto}
                    />
                  ) : (
                    <div className="text-[12px] text-ds-text-3 pt-1">
                      PPM no configurado — define la tasa en Configuración →
                      Finanzas → Flujo de caja para incluirlo aquí.
                    </div>
                  )}
                </div>
                <div
                  className={
                    data.f29.esIvaAFavor && data.f29.totalAPagar === 0
                      ? "rounded-lg border bg-status-info-soft border-status-info-border p-4"
                      : "rounded-lg border bg-status-ok-soft border-status-ok-border p-4"
                  }
                >
                  <div
                    className={
                      data.f29.esIvaAFavor && data.f29.totalAPagar === 0
                        ? "text-[12px] font-mono uppercase tracking-[0.08em] text-status-info-fg mb-1"
                        : "text-[12px] font-mono uppercase tracking-[0.08em] text-status-ok-fg mb-1"
                    }
                  >
                    Total a pagar F29
                  </div>
                  <div
                    className={
                      data.f29.esIvaAFavor && data.f29.totalAPagar === 0
                        ? "font-display text-3xl font-bold tracking-tight text-status-info-fg ds-num"
                        : "font-display text-3xl font-bold tracking-tight text-status-ok-fg ds-num"
                    }
                  >
                    {fmtCLP(data.f29.totalAPagar)}
                  </div>
                  <div className="text-[12px] text-ds-text-3 mt-2">
                    {data.f29.esIvaAFavor
                      ? `Saldo a favor: ${fmtCLP(data.f29.remanenteSiguiente)} pasa como remanente al período siguiente.`
                      : `IVA ${fmtCLP(Math.max(0, data.f29.ivaDeterminado))} + PPM ${fmtCLP(data.f29.ppmMonto)}`}
                  </div>
                </div>
                <div className="text-[12px] text-ds-text-3 leading-relaxed">
                  El período {data.periodo} se declara y paga en{" "}
                  {declarationMonthLabel(data.periodo)}. No incluye retención de
                  honorarios ni impuesto único de trabajadores.
                </div>
              </div>
            </div>
          </Card>

          <DocTable
            title={`Detalle Libro de Ventas (${ventasDocs.length})`}
            docs={ventasDocs}
            counterpartLabel="Cliente"
          />
          <DocTable
            title={`Detalle Libro de Compras (${comprasDocs.length})`}
            docs={comprasDocs}
            counterpartLabel="Proveedor"
          />
        </>
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

function DocTable({
  title,
  docs,
  counterpartLabel,
}: {
  title: string;
  docs: F29Documento[];
  counterpartLabel: string;
}) {
  if (docs.length === 0) return null;
  return (
    <Card className="p-5">
      <div className={`${EYEBROW} mb-3`}>{title}</div>

      {/* Desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[12px] font-mono uppercase tracking-wide text-ds-text-3 border-b border-ds-border-subtle">
              <th className="py-2 pr-3 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Folio</th>
              <th className="py-2 pr-3 font-medium">Fecha</th>
              <th className="py-2 pr-3 font-medium">{counterpartLabel}</th>
              <th className="py-2 pr-3 font-medium text-right">Exento</th>
              <th className="py-2 pr-3 font-medium text-right">Neto</th>
              <th className="py-2 pr-3 font-medium text-right">IVA</th>
              <th className="py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const isNc = d.sign === -1;
              const numCls = isNc
                ? "text-status-danger-fg"
                : "text-ds-text-1";
              const s = isNc ? -1 : 1;
              return (
                <tr
                  key={d.id}
                  className="border-b border-ds-border-subtle last:border-0"
                >
                  <td className="py-2 pr-3 text-ds-text-2">
                    {DTE_LABELS[d.dteType] ?? `DTE ${d.dteType}`}{" "}
                    <span className="text-[12px] text-ds-text-4">
                      ({d.dteType})
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono ds-num">{d.folio}</td>
                  <td className="py-2 pr-3 font-mono ds-num text-ds-text-2">
                    {d.date}
                  </td>
                  <td className="py-2 pr-3 text-ds-text-2 max-w-[260px] truncate">
                    <span className="font-mono text-[12px] text-ds-text-3 mr-1.5">
                      {d.rut}
                    </span>
                    {d.name}
                  </td>
                  <td className={`py-2 pr-3 text-right font-mono ds-num ${numCls}`}>
                    {d.exemptAmount ? fmtCLP(s * d.exemptAmount) : "—"}
                  </td>
                  <td className={`py-2 pr-3 text-right font-mono ds-num ${numCls}`}>
                    {fmtCLP(s * d.netAmount)}
                  </td>
                  <td className={`py-2 pr-3 text-right font-mono ds-num ${numCls}`}>
                    {fmtCLP(s * d.taxAmount)}
                  </td>
                  <td className={`py-2 text-right font-mono ds-num ${numCls}`}>
                    {fmtCLP(s * d.totalAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="sm:hidden space-y-2">
        {docs.map((d) => {
          const isNc = d.sign === -1;
          const s = isNc ? -1 : 1;
          return (
            <li
              key={d.id}
              className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3"
            >
              <div className="flex justify-between gap-2">
                <span className="text-[13px] text-ds-text-1 font-medium">
                  {DTE_LABELS[d.dteType] ?? `DTE ${d.dteType}`} #{d.folio}
                </span>
                <span
                  className={`font-mono ds-num text-[13px] ${isNc ? "text-status-danger-fg" : "text-ds-text-1"}`}
                >
                  {fmtCLP(s * d.totalAmount)}
                </span>
              </div>
              <div className="text-[12px] text-ds-text-3 mt-1 truncate">
                {d.date} · {d.rut} · {d.name}
              </div>
              <div className="text-[12px] text-ds-text-3 mt-0.5 font-mono ds-num">
                Neto {fmtCLP(s * d.netAmount)} · IVA {fmtCLP(s * d.taxAmount)}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
