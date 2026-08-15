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

function MoneyTable({
  headers,
  rows,
  opening,
}: {
  headers: string[];
  rows: Array<{ key: string; cells: string[]; highlight?: boolean }>;
  opening: EconomicOpening;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
      <table className="w-full min-w-[20rem] text-left text-[13px]">
        <thead>
          <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={
                row.highlight
                  ? "border-t border-ds-border-default bg-status-ok-soft font-semibold text-ds-text-1"
                  : "border-t border-ds-border-subtle text-ds-text-1"
              }
            >
              {row.cells.map((c, i) => (
                <td
                  key={`${row.key}-${i}`}
                  className={
                    i === 0
                      ? "px-3 py-2"
                      : "px-3 py-2 text-right font-mono text-[12px]"
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* silence unused */}
      <span className="sr-only">{opening.currency}</span>
    </div>
  );
}

export function EconomicOpeningTable({ opening }: { opening: EconomicOpening }) {
  const [primary, secondary] = openingAmountColumns(opening.currency);
  const fmt = (kind: "uf" | "clp", clp: number) =>
    kind === "uf" ? formatOpeningUf(clp, opening.ufValue) : formatOpeningClp(clp);

  return (
    <div className="space-y-4">
      {opening.services.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
            Cotización por servicio
          </p>
          <MoneyTable
            opening={opening}
            headers={["Servicio / puesto", "Dotación", primary === "uf" ? "Venta UF" : "Venta CLP", "Costo MO"]}
            rows={opening.services.map((s, i) => ({
              key: `svc-${i}`,
              cells: [
                s.name,
                `${s.guards}×${s.puestos}`,
                fmt(primary, s.saleClp),
                fmt(primary, s.laborClp),
              ],
            }))}
          />
        </div>
      ) : null}

      {opening.installations.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
            Apertura por instalación
          </p>
          <MoneyTable
            opening={opening}
            headers={["Instalación", primary === "uf" ? "Venta UF" : "Venta CLP", "Mano de obra"]}
            rows={opening.installations.map((inst, i) => ({
              key: `inst-${i}`,
              cells: [inst.name, fmt(primary, inst.saleClp), fmt(primary, inst.laborClp)],
            }))}
          />
        </div>
      ) : null}

      {opening.salariesByCargo.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
            Apertura de sueldos por cargo
          </p>
          <MoneyTable
            opening={opening}
            headers={[
              "Cargo",
              "N°",
              "Base",
              "Gratific.",
              "Colac./Mov.",
              "Leyes soc.",
              "Costo emp.",
            ]}
            rows={opening.salariesByCargo.map((s, i) => ({
              key: `sal-${i}`,
              cells: [
                s.cargo,
                String(s.guards),
                formatOpeningClp(s.baseSalary),
                formatOpeningClp(s.gratification),
                formatOpeningClp(s.allowances),
                formatOpeningClp(s.socialLaws),
                formatOpeningClp(s.employerCost),
              ],
            }))}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
          Estructura del precio
        </p>
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
      </div>

      <p className="text-[12px] text-ds-text-3">{opening.note || ECONOMIC_OPENING_NOTE}</p>
      <Tag variant="info" size="sm">
        Auto · siempre al día
      </Tag>
    </div>
  );
}
