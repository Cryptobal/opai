import { describe, expect, it } from "vitest";
import {
  buildCoverageTable,
  normalizeCrmStructureProposal,
} from "../email-to-crm-structure.service";

describe("normalizeCrmStructureProposal", () => {
  it("multi-instalación + cobertura≠dotación + totales", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "Ministerio de Salud", segment: "Sector Público" },
      contact: {
        firstName: "Fernando",
        lastName: "Henríquez Ortiz",
        email: "fernando.henriquez@minsal.cl",
        roleTitle: "Profesional Oficina Administración Interna",
      },
      deal: {
        title: "Consulta al Mercado - Seguridad y Vigilancia",
        isLicitacion: true,
        mesesContrato: 24,
      },
      coverageIsRequirementNotStaffing: true,
      weeklyHoursPerWorker: 42,
      requerimiento: "Servicio de seguridad 24/7 en dependencias Nivel Central",
      installations: [
        {
          name: "Mac Iver 541",
          address: "Mac Iver 541",
          city: "Santiago",
          coverageSlots: [
            {
              name: "Guardia clásico diurno",
              role: "Guardia",
              regimen: "24/7",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 5,
            },
            {
              name: "Guardia clásico nocturno",
              role: "Guardia",
              regimen: "24/7",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
              horaInicio: "20:00",
              horaFin: "08:00",
              simultaneous: 5,
            },
            {
              name: "Recepcionista",
              role: "Recepcionista",
              regimen: "L-V diurno",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes"],
              horaInicio: "07:30",
              horaFin: "19:30",
              simultaneous: 1,
            },
          ],
        },
        {
          name: "Monjitas 689",
          coverageSlots: [
            {
              name: "Guardia diurno",
              role: "Guardia",
              regimen: "24/7",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
            },
            {
              name: "Guardia nocturno",
              role: "Guardia",
              regimen: "24/7",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
              horaInicio: "20:00",
              horaFin: "08:00",
              simultaneous: 1,
            },
          ],
        },
      ],
      openQuestions: ["¿Jefe de turno es cargo adicional?"],
      assumptions: ["4x4 a 42 h/sem"],
    });

    expect(proposal.coverageIsRequirementNotStaffing).toBe(true);
    expect(proposal.installations).toHaveLength(2);
    expect(proposal.installations[0].coverageSlots[0].headcount).toBe(10); // 5×2
    expect(proposal.installations[0].coverageSlots[1].headcount).toBe(10);
    expect(proposal.installations[0].coverageSlots[2].headcount).toBe(2); // L-V 12h
    expect(proposal.staffingTotals.headcountBase).toBe(10 + 10 + 2 + 2 + 2);
    expect(proposal.openQuestions[0]).toMatch(/jefe/i);

    const table = buildCoverageTable(proposal);
    expect(table.headers).toContain("Cobertura");
    expect(table.headers).toContain("Dotación");
    expect(table.rows.length).toBe(5);
  });

  it("parte nombre de contacto si viene como nombre único", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "ACME" },
      contact: { nombre: "Ana Soto", email: "ana@acme.cl" },
      deal: { title: "Servicio" },
      installations: [
        {
          name: "Planta",
          coverageSlots: [
            {
              name: "Portería",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes"],
              horaInicio: "08:00",
              horaFin: "18:00",
              simultaneous: 1,
            },
          ],
        },
      ],
    });
    expect(proposal.contact.firstName).toBe("Ana");
    expect(proposal.contact.lastName).toBe("Soto");
  });
});
