/**
 * Libro de Remuneraciones Exporter
 * Generates a CSV matching the format of "Libro Remuneración General.csv"
 * Headers: Corr;IdProc.;TipoProceso;Rut-Dv;Nombre Completo;Tipo Empleado;Fecha Ingreso;Fecha Finiquito;
 *   Cli;Sec;Ins;Cliente;Sector;Instalación;Días;SueldoBase;T.HrsExtras;Ant. Gratif.;T.OtrosImponibles;
 *   T.Imponible;T.Tributa;T.AFamiliar;T.Colación;T.Movilización;T.OtrosNoImpo;T.Haber;Afp - Ips;
 *   Plan Pactado (Ficha);Plan Periodo;Moneda Pactado;Salud;Adic.Salud;Afc;T.Neto;T.Anticipo;
 *   OtrosDescuentos;Imp.Único;Descuento Ley N° 21.252;T.Descuentos;Sobregiro;Liquido
 */

import { prisma } from "@/lib/prisma";

export interface LibroRemuneracionRow {
  corr: number;
  rutDv: string;
  nombreCompleto: string;
  tipoEmpleado: string;
  fechaIngreso: string;
  fechaFiniquito: string;
  instalacion: string;
  dias: number;
  sueldoBase: number;
  hrsExtras: number;
  gratificacion: number;
  otrosImponibles: number;
  totalImponible: number;
  totalTributa: number;
  aFamiliar: number;
  colacion: number;
  movilizacion: number;
  otrosNoImpo: number;
  totalHaber: number;
  afp: number;
  salud: number;
  afc: number;
  totalNeto: number;
  anticipo: number;
  otrosDescuentos: number;
  impUnico: number;
  totalDescuentos: number;
  liquido: number;
}

export async function generateLibroRemuneraciones(
  periodId: string,
  tenantId: string,
  installationId?: string
): Promise<string> {
  const where: any = { periodId, tenantId };
  if (installationId) where.installationId = installationId;

  const liquidaciones = await prisma.payrollLiquidacion.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  // Get guard details
  const guardIds = [...new Set(liquidaciones.map((l) => l.guardiaId))];
  const guardias = await prisma.opsGuardia.findMany({
    where: { id: { in: guardIds } },
    select: {
      id: true,
      hiredAt: true,
      terminatedAt: true,
      persona: { select: { rut: true, firstName: true, lastName: true } },
      asignaciones: {
        where: { isActive: true },
        take: 1,
        select: {
          installation: { select: { name: true } },
        },
      },
    },
  });
  const guardMap = new Map(guardias.map((g) => [g.id, g]));

  const HEADER = "Corr;Rut-Dv;Nombre Completo;Tipo Empleado;Fecha Ingreso;Fecha Finiquito;" +
    "Instalación;Días;SueldoBase;T.HrsExtras;Ant. Gratif.;T.OtrosImponibles;T.Imponible;T.Tributa;" +
    "T.AFamiliar;T.Colación;T.Movilización;T.OtrosNoImpo;T.Haber;Afp;Salud;Afc;T.Neto;T.Anticipo;" +
    "OtrosDescuentos;Imp.Único;T.Descuentos;Liquido";

  const rows: string[] = [HEADER];

  liquidaciones.forEach((liq, idx) => {
    const guard = guardMap.get(liq.guardiaId);
    const bd = liq.breakdown as any;
    const hab = bd?.haberes || {};
    const ded = bd?.deductions || {};
    const vol = bd?.voluntaryDeductions || {};

    const rutDv = guard?.persona?.rut || "";
    const nombre = guard ? `${guard.persona.lastName} ${guard.persona.firstName}`.toLowerCase() : "";
    const hiredAt = guard?.hiredAt ? new Date(guard.hiredAt).toLocaleDateString("es-CL") : "";
    const terminatedAt = guard?.terminatedAt ? new Date(guard.terminatedAt).toLocaleDateString("es-CL") : "";
    const instName = guard?.asignaciones?.[0]?.installation?.name || "";

    const totalNeto = Number(liq.grossSalary) - Number(ded.total_legal || 0);

    rows.push([
      idx + 1,
      rutDv,
      nombre,
      "SERVICIO",
      hiredAt,
      terminatedAt,
      instName,
      liq.daysWorked,
      hab.base_salary || 0,
      (hab.overtime_50 || 0) + (hab.overtime_100 || 0),
      hab.gratification || 0,
      hab.other_taxable || 0,
      hab.total_taxable || 0,
      ded.tax?.base_clp || 0,
      hab.family_allowance || 0,
      hab.meal || 0,
      hab.transport || 0,
      hab.other_non_taxable || 0,
      Number(liq.grossSalary),
      ded.afp?.amount || 0,
      ded.health?.amount || 0,
      ded.afc?.amount || 0,
      totalNeto,
      vol.advance || 0,
      (vol.loan || 0) + (vol.other || 0),
      ded.tax?.amount || 0,
      Number(liq.totalDeductions),
      Number(liq.netSalary),
    ].join(";"));
  });

  return rows.join("\n");
}
