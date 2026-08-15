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

function LinesBlock({
  title,
  lines,
}: {
  title: string;
  lines: NonNullable<EconomicOpening["directLines"]>;
}) {
  return (
    <section className="space-y-2">
      <h4 className="font-display text-[14px] font-semibold text-ds-text-1">{title}</h4>
      {lines.length === 0 ? (
        <p className="text-[13px] text-ds-text-3">No aplica</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
          <table className="w-full min-w-[28rem] text-left text-[13px]">
            <thead>
              <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
                <th className="px-3 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 font-medium text-right">Cantidad</th>
                <th className="px-3 py-2 font-medium text-right">Monto mensual</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr
                  key={`${line.label}-${index}`}
                  className="border-t border-ds-border-subtle text-ds-text-1"
                >
                  <td className="px-3 py-2">{line.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px]">
                    {line.quantity != null ? line.quantity.toLocaleString("es-CL") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] font-semibold">
                    {formatOpeningClp(line.amountClp)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-ds-border-default bg-ds-surface-2 font-semibold text-ds-text-1">
                <td className="px-3 py-2" colSpan={2}>
                  Subtotal
                </td>
                <td className="px-3 py-2 text-right font-mono text-[12px]">
                  {formatOpeningClp(lines.reduce((sum, line) => sum + line.amountClp, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function EconomicOpeningTable({ opening }: { opening: EconomicOpening }) {
  const [primary, secondary] = openingAmountColumns(opening.currency);
  const fmt = (kind: "uf" | "clp", clp: number) =>
    kind === "uf" ? formatOpeningUf(clp, opening.ufValue) : formatOpeningClp(clp);
  const serviceLines = opening.serviceLines ?? [];
  const installations = opening.byInstallation ?? [];
  const salaries = opening.salariesByRole ?? [];
  const directLines = opening.directLines ?? [];
  const indirectLines = opening.indirectLines ?? [];

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
        <section className="space-y-3">
          <div>
            <h4 className="font-display text-[14px] font-semibold text-ds-text-1">
              Sueldos por cargo
            </h4>
            <p className="text-[12px] text-ds-text-3">
              Componentes del snapshot · valores por persona al mes
            </p>
          </div>
          {salaries.map((salary) => (
            <div
              key={salary.cargo}
              className="overflow-x-auto rounded-xl border border-ds-border-subtle"
            >
              <div className="flex items-center justify-between gap-2 border-b border-ds-border-subtle bg-ds-surface-2 px-3 py-2">
                <p className="text-[13px] font-semibold text-ds-text-1">{salary.cargo}</p>
                <p className="font-mono text-[12px] text-ds-text-3">
                  {salary.count.toLocaleString("es-CL")} persona
                  {salary.count === 1 ? "" : "s"}
                </p>
              </div>
              <table className="w-full min-w-[24rem] text-left text-[13px]">
                <tbody>
                  {(salary.components ?? []).map((component) => (
                    <tr
                      key={`${salary.cargo}-${component.label}`}
                      className="border-t border-ds-border-subtle text-ds-text-1"
                    >
                      <td className="px-3 py-2">{component.label}</td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {formatOpeningClp(component.amountClp)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-ds-border-default bg-status-ok-soft font-semibold text-ds-text-1">
                    <td className="px-3 py-2">Costo empresa</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {formatOpeningClp(salary.costoEmpresaClp)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}

      <LinesBlock title="Costos directos" lines={directLines} />
      <LinesBlock title="Costos indirectos" lines={indirectLines} />

      <section className="space-y-2">
        <h4 className="font-display text-[14px] font-semibold text-ds-text-1">
          Estructura del precio
        </h4>
        <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
          <table className="w-full min-w-[20rem] text-left text-[13px]">
            <thead>
              <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
                <th className="px-3 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 font-medium text-right">
                  {primary === "uf" ? "UF" : "CLP"}
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  {secondary === "uf" ? "UF" : "CLP"}
                </th>
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
                  <td className="px-3 py-2 text-right font-mono text-[12px]">
                    {fmt(primary, row.amountClp)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-ds-text-3">
                    {fmt(secondary, row.amountClp)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px]">
                    {formatOpeningPct(row.pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[12px] text-ds-text-3">{opening.note || ECONOMIC_OPENING_NOTE}</p>
      <Tag variant="info" size="sm">
        Auto · siempre al día
      </Tag>
    </div>
  );
}
