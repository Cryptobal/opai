/**
 * Costo mano de obra por puesto de lead usando el mismo motor que CPQ.
 */

import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { buildCpqStyleEmployerCostInput } from "./cpq-employer-cost-input";

export type LeadPositionLike = {
  puesto?: string;
  baseSalary?: number;
  cantidad?: number;
  numPuestos?: number;
  horaInicio?: string;
  horaFin?: string;
  dias?: string[];
};

export type LeadPositionCostRow = {
  name: string;
  guards: number;
  numPuestos: number;
  totalGuardsInPos: number;
  salary: number;
  gratificacion: number;
  totalImponible: number;
  sisEmployer: number;
  afcEmployer: number;
  mutualEmployer: number;
  vacationProvision: number;
  severanceProvision: number;
  costoGuardia: number;
  totalCost: number;
  baseSalaryTotal: number;
  gratificacionTotal: number;
  days: string;
  schedule: string;
};

export async function computeLeadPositionCostFromPayroll(
  pos: LeadPositionLike,
  ufValue?: number | null
): Promise<LeadPositionCostRow> {
  const salary = pos.baseSalary || 550000;
  const guards = pos.cantidad || 1;
  const numPuestos = pos.numPuestos || 1;
  const totalGuardsInPos = guards * numPuestos;

  const payroll = await computeEmployerCost(
    buildCpqStyleEmployerCostInput(salary, { ufValue })
  );
  const b = payroll.breakdown;
  const costoGuardia = payroll.monthly_employer_cost_clp;

  return {
    name: pos.puesto || "Puesto",
    guards,
    numPuestos,
    totalGuardsInPos,
    salary,
    gratificacion: b.gratification,
    totalImponible: b.total_taxable_income,
    sisEmployer: b.sis_employer * totalGuardsInPos,
    afcEmployer: b.afc_employer.total * totalGuardsInPos,
    mutualEmployer: b.work_injury_employer.amount * totalGuardsInPos,
    vacationProvision: b.vacation_provision * totalGuardsInPos,
    severanceProvision: b.severance_provision * totalGuardsInPos,
    costoGuardia,
    totalCost: costoGuardia * totalGuardsInPos,
    baseSalaryTotal: salary * totalGuardsInPos,
    gratificacionTotal: b.gratification * totalGuardsInPos,
    days: (pos.dias || []).join(", ") || "-",
    schedule: `${pos.horaInicio || "-"} - ${pos.horaFin || "-"}`,
  };
}

export async function computeLeadPositionCostsFromPayroll(
  positions: LeadPositionLike[],
  ufValue?: number | null
): Promise<LeadPositionCostRow[]> {
  return Promise.all(
    positions.map((pos) => computeLeadPositionCostFromPayroll(pos, ufValue))
  );
}
