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

  it("tolera ausencia de licitacion y condicionesEconomicas (drafts viejos)", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "ACME" },
      deal: { title: "X", isLicitacion: true },
    });
    expect(proposal.licitacion).toBeUndefined();
    expect(proposal.condicionesEconomicas).toBeUndefined();
    expect(proposal.reservePct).toBe(10);
  });

  it("normaliza licitacion YYYY-MM-DD y descarta fechas inválidas", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "Muni" },
      deal: { title: "Licitación", isLicitacion: true, fechaLimite: "no-es-fecha" },
      licitacion: {
        fechaConsultas: "2026-08-10",
        fechaVisitaTecnica: "2026-08-15",
        fechaEntrega: "2026-08-30",
        inicioServicio: "2026-10-01",
        visitaObligatoria: true,
      },
    });
    expect(proposal.licitacion).toEqual({
      fechaConsultas: "2026-08-10",
      fechaVisitaTecnica: "2026-08-15",
      fechaEntrega: "2026-08-30",
      inicioServicio: "2026-10-01",
      visitaObligatoria: true,
    });
    expect(proposal.deal.fechaLimite).toBe("2026-08-30");
  });

  it("descarta fechas incoherentes y montos/arrays inválidos en condicionesEconomicas", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "Muni" },
      deal: { isLicitacion: true },
      licitacion: {
        fechaConsultas: "2026-09-01",
        fechaEntrega: "2026-08-01", // antes de consultas → descartar entrega
        fechaVisitaTecnica: "2026-08-15",
        inicioServicio: null,
        visitaObligatoria: false,
      },
      condicionesEconomicas: {
        sueldoBaseMinimo: -100,
        gratificacionPct: 250,
        movilizacion: "abc",
        beneficiosExigidos: Array.from({ length: 30 }, (_, i) => `b${i}`),
        multas: [
          { concepto: "Puesto sin cobertura", montoUf: 10 },
          { concepto: "", montoUf: 5 },
          { concepto: "Negativa", montoUf: -3 },
        ],
        kpis: [{ indicador: "Asistencia", meta: "≥98%" }],
        reservaPct: 15,
        inadmisibleSiNoCumpleRemuneracion: true,
      },
      reservePct: 10,
    });
    expect(proposal.licitacion?.fechaEntrega).toBeNull();
    expect(proposal.condicionesEconomicas?.sueldoBaseMinimo).toBeNull();
    expect(proposal.condicionesEconomicas?.gratificacionPct).toBeNull();
    expect(proposal.condicionesEconomicas?.movilizacion).toBeNull();
    expect(proposal.condicionesEconomicas?.beneficiosExigidos).toHaveLength(15);
    expect(proposal.condicionesEconomicas?.multas).toEqual([
      { concepto: "Puesto sin cobertura", montoUf: 10 },
    ]);
    expect(proposal.condicionesEconomicas?.kpis).toHaveLength(1);
    expect(proposal.condicionesEconomicas?.reservaPct).toBe(15);
    expect(proposal.reservePct).toBe(15); // pliego pisa el default
    expect(proposal.condicionesEconomicas?.inadmisibleSiNoCumpleRemuneracion).toBe(true);
  });

  it("acepta sueldo base mínimo positivo del pliego", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "Muni" },
      condicionesEconomicas: {
        sueldoBaseMinimo: 620000,
        beneficiosExigidos: [],
        multas: [],
        kpis: [],
        reservaPct: null,
        inadmisibleSiNoCumpleRemuneracion: false,
      },
    });
    expect(proposal.condicionesEconomicas?.sueldoBaseMinimo).toBe(620000);
  });
});

describe("milestonesFromLicitacion", () => {
  it("siembra hitos solo con fechas no nulas", async () => {
    const { milestonesFromLicitacion } = await import(
      "../email-to-crm-structure.types"
    );
    const ms = milestonesFromLicitacion({
      fechaConsultas: "2026-08-10",
      fechaVisitaTecnica: null,
      fechaEntrega: "2026-08-30",
      inicioServicio: "2026-10-01",
      visitaObligatoria: true,
    });
    expect(ms.map((m) => m.kind)).toEqual(["consultas", "entrega"]);
    expect(ms.every((m) => m.fromDocument && m.enabled && m.time === "09:00")).toBe(true);
  });
});
