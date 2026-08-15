"use client";

import { Tag } from "@/components/opai-ds";
import {
  ECONOMIC_OPENING_NOTE,
  formatOpeningClp,
  formatOpeningPct,
  formatOpeningUf,
  openingAmountColumns,
  type EconomicOpening,
} from "@/lib/cpq/economic-opening";

export function EconomicOpeningTable({ opening }: { opening: EconomicOpening }) {
  const [primary, secondary] = openingAmountColumns(opening.currency);
  const fmt = (kind: "uf" | "clp", clp: number) =>
    kind === "uf" ? formatOpeningUf(clp, opening.ufValue) : formatOpeningClp(clp);
  const serviceLines = opening.serviceLines ?? [];
  const installations = opening.byInstallation ?? [];
  const salaries = opening.salariesByRole ?? [];

  return (
    <div className="space-y-5">
      {serviceLines.length > 0 ? (
        <section className="space-y-2">
          <h4 className="font-display text-[14px] font-semibold text-ds-text-1">
            Cotización por servicios
          </h4>
          <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
            <table className="w-full min-w-[38rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
                  <th className="px-3 py-2 font-medium">Servicio</th>
                  <th className="px-3 py-2 font-medium text-right">Cantidad</th>
                  <th className="px-3 py-2 font-medium text-right">Valor unitario</th>
                  <th className="px-3 py-2 font-medium text-right">Subtotal mensual</th>
                </tr>
              </thead>
              <tbody>
                {serviceLines.map((line, index) => (
                  <tr
                    key={`${line.description}-${index}`}
                    className="border-t border-ds-border-subtle text-ds-text-1"
                  >
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {line.quantity.toLocaleString("es-CL")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {formatOpeningClp(line.unitPriceClp)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] font-semibold">
                      {formatOpeningClp(line.subtotalClp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {installations.length > 0 ? (
        <section className="space-y-2">
          <h4 className="font-display text-[14px] font-semibold text-ds-text-1">
            Apertura por instalación
          </h4>
          <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
            <table className="w-full min-w-[30rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
                  <th className="px-3 py-2 font-medium">Instalación</th>
                  <th className="px-3 py-2 font-medium text-right">Dotación</th>
                  <th className="px-3 py-2 font-medium text-right">Monto mensual neto</th>
                </tr>
              </thead>
              <tbody>
                {installations.map((installation, index) => (
                  <tr
                    key={`${installation.name}-${index}`}
                    className="border-t border-ds-border-subtle text-ds-text-1"
                  >
                    <td className="px-3 py-2">{installation.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {installation.guards.toLocaleString("es-CL")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] font-semibold">
                      {formatOpeningClp(installation.amountClp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {salaries.length > 0 ? (
        <section className="space-y-2">
          <div>
            <h4 className="font-display text-[14px] font-semibold text-ds-text-1">
              Sueldos por cargo
            </h4>
            <p className="text-[12px] text-ds-text-3">Valores por persona al mes</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
            <table className="w-full min-w-[58rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
                  <th className="px-3 py-2 font-medium">Cargo</th>
                  <th className="px-3 py-2 font-medium text-right">Personas</th>
                  <th className="px-3 py-2 font-medium text-right">Sueldo base</th>
                  <th className="px-3 py-2 font-medium text-right">Gratificación</th>
                  <th className="px-3 py-2 font-medium text-right">Colación y movilización</th>
                  <th className="px-3 py-2 font-medium text-right">Leyes sociales</th>
                  <th className="px-3 py-2 font-medium text-right">Costo empresa</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((salary) => (
                  <tr
                    key={salary.cargo}
                    className="border-t border-ds-border-subtle text-ds-text-1"
                  >
                    <td className="px-3 py-2">{salary.cargo}</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {salary.count.toLocaleString("es-CL")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {formatOpeningClp(salary.baseClp)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {formatOpeningClp(salary.gratificacionClp)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {formatOpeningClp(salary.colacionMovilizacionClp)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {formatOpeningClp(salary.leyesSocialesClp)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] font-semibold">
                      {formatOpeningClp(salary.costoEmpresaClp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="font-display text-[14px] font-semibold text-ds-text-1">
          Estructura del precio
        </h4>
        <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
        <table className="w-full min-w-[20rem] text-left text-[13px]">
          <thead>
            <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
              <th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 font-medium text-right">{primary === "uf" ? "UF" : "CLP"}</th>
              <th className="px-3 py-2 font-medium text-right">{secondary === "uf" ? "UF" : "CLP"}</th>
              <th className="px-3 py-2 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {opening.rows.map((row) => (
              <tr
                key={row.key}
                className={
                  row.highlight
                    ? "border-t border-ds-border-default bg-status-ok-soft font-semibold text-ds-text-1"
                    : "border-t border-ds-border-subtle text-ds-text-1"
                }
              >
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono text-[12px]">{fmt(primary, row.amountClp)}</td>
                <td className="px-3 py-2 text-right font-mono text-[12px] text-ds-text-3">
                  {fmt(secondary, row.amountClp)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[12px]">{formatOpeningPct(row.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
      <p className="text-[12px] text-ds-text-3">{opening.note}</p>
      <Tag variant="info" size="sm">
        Auto · siempre al día
      </Tag>
    </div>
  );
}
