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
    expect(proposal.contacts).toHaveLength(1);
    expect(proposal.contacts?.[0].email).toBe("ana@acme.cl");
  });

  it("normaliza contacts[] multi-contacto y espeja el primario", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "Embajada" },
      contact: {
        firstName: "Embajada",
        lastName: "España",
        email: "emb.santiagodechile@maec.es",
      },
      contacts: [
        {
          firstName: "Embajada",
          lastName: "España",
          email: "emb.santiagodechile@maec.es",
        },
        { nombre: "Julia Fuentes", email: "julia.fuentes@maec.es" },
        { firstName: "Fanny", lastName: "Villarroel", email: "fanny.villarroel@maec.es" },
      ],
      deal: { title: "Licitación", isLicitacion: true },
      installations: [],
    });
    expect(proposal.contacts).toHaveLength(3);
    expect(proposal.contact.email).toBe("emb.santiagodechile@maec.es");
    expect(proposal.contacts?.[1].firstName).toBe("Julia");
    expect(proposal.contacts?.[1].lastName).toBe("Fuentes");
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

  it("conserva baseSalary del puesto y lat/lng de la instalación", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "CGE" },
      installations: [
        {
          name: "Subestación",
          address: "Padre las Casas",
          commune: "Padre las Casas",
          city: "Temuco",
          mapsUrl: "https://www.google.com/maps?q=-38.7,-72.6",
          lat: -38.7,
          lng: -72.6,
          coverageSlots: [
            {
              name: "Guardia Diurna",
              regimen: "24/7",
              dias: [
                "lunes",
                "martes",
                "miercoles",
                "jueves",
                "viernes",
                "sabado",
                "domingo",
              ],
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
              baseSalary: 600000,
            },
          ],
        },
      ],
    });
    const inst = proposal.installations[0];
    expect(inst.lat).toBe(-38.7);
    expect(inst.lng).toBe(-72.6);
    expect(inst.mapsUrl).toContain("google.com/maps");
    expect(inst.coverageSlots[0].baseSalary).toBe(600000);
  });

  it("conserva etapa/vigencia/horarioAsumido y calcula staffingPeak (no suma total)", () => {
    const week = [
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sabado",
      "domingo",
    ];
    const proposal = normalizeCrmStructureProposal({
      account: { name: "ITJC" },
      deal: { title: "Cotización Guardia" },
      weeklyHoursPerWorker: 42,
      installations: [
        {
          name: "Obra ITJC",
          coverageSlots: [
            {
              name: "Pique Brasil diurno E1",
              regimen: "Diurno",
              dias: week,
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
              etapa: "Etapa 1",
              vigenciaDesde: "2026-09-01",
              vigenciaHasta: "2026-09-30",
              horarioAsumido: true,
            },
            {
              name: "Pique Brasil diurno E2",
              regimen: "Diurno",
              dias: week,
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
              etapa: "Etapa 2",
              vigenciaDesde: "2026-09-01",
              vigenciaHasta: "2026-09-30",
              horarioAsumido: true,
            },
            {
              name: "Pique Brasil 24/7 día E3A",
              regimen: "24/7",
              dias: week,
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
              etapa: "Etapa 3A",
              vigenciaDesde: "2026-10-01",
              vigenciaHasta: "2026-11-30",
            },
            {
              name: "Pique Brasil 24/7 noche E3A",
              regimen: "24/7",
              dias: week,
              horaInicio: "20:00",
              horaFin: "08:00",
              simultaneous: 1,
              etapa: "Etapa 3A",
              vigenciaDesde: "2026-10-01",
              vigenciaHasta: "2026-11-30",
            },
            {
              name: "Pique reforzado día E3B",
              regimen: "24/7",
              dias: week,
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 2,
              etapa: "Etapa 3B",
              vigenciaDesde: "2026-11-15",
              vigenciaHasta: "2027-01-29",
            },
            {
              name: "Pique reforzado noche E3B",
              regimen: "24/7",
              dias: week,
              horaInicio: "20:00",
              horaFin: "08:00",
              simultaneous: 2,
              etapa: "Etapa 3B",
              vigenciaDesde: "2026-11-15",
              vigenciaHasta: "2027-01-29",
            },
          ],
        },
      ],
    });

    const slots = proposal.installations[0].coverageSlots;
    expect(slots[0].etapa).toBe("Etapa 1");
    expect(slots[0].vigenciaDesde).toBe("2026-09-01");
    expect(slots[0].vigenciaHasta).toBe("2026-09-30");
    expect(slots[0].horarioAsumido).toBe(true);
    expect(slots[2].etapa).toBe("Etapa 3A");
    expect(slots[4].etapa).toBe("Etapa 3B");

    // Peak en traslape 3A+3B (2+2 + 4+4 = 12), no la suma total de todas las etapas.
    expect(proposal.staffingPeak).not.toBeNull();
    expect(proposal.staffingPeak!.peakHeadcount).toBe(12);
    expect(proposal.staffingPeak!.peakFrom).toBe("2026-11-15");
    expect(proposal.staffingPeak!.peakTo).toBe("2026-11-30");
    expect(proposal.staffingTotals.headcountBase).toBeGreaterThan(
      proposal.staffingPeak!.peakHeadcount,
    );
  });

  it("draft legacy sin vigencias → staffingPeak null", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "ACME" },
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
    expect(proposal.staffingPeak).toBeNull();
    expect(proposal.installations[0].coverageSlots[0].etapa).toBeNull();
    expect(proposal.installations[0].coverageSlots[0].vigenciaDesde).toBeNull();
  });

  it("puesto sin nombre no se descarta: recibe nombre por defecto", () => {
    const proposal = normalizeCrmStructureProposal({
      account: { name: "ACME" },
      installations: [
        {
          name: "Planta",
          coverageSlots: [
            { name: "Portería", dias: ["lunes"], horaInicio: "08:00", horaFin: "18:00" },
            // Puesto agregado a mano en el Plan y luego vaciado por el usuario:
            // antes desaparecía en el coerce de un refine.
            { name: "", dias: ["lunes"], horaInicio: "08:00", horaFin: "18:00" },
            { dias: ["lunes"], horaInicio: "08:00", horaFin: "18:00" },
          ],
        },
      ],
    });
    const names = proposal.installations[0].coverageSlots.map((s) => s.name);
    expect(names).toEqual(["Portería", "Puesto 2", "Puesto 3"]);
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
    // Ids generados en cliente (no node:crypto) — evita crash iOS/Safari.
    expect(ms.every((m) => typeof m.id === "string" && m.id.length > 0)).toBe(true);
    expect(new Set(ms.map((m) => m.id)).size).toBe(ms.length);
  });

  it("prellena dirección de visita técnica desde la instalación", async () => {
    const { milestonesFromLicitacion } = await import(
      "../email-to-crm-structure.types"
    );
    const ms = milestonesFromLicitacion(
      {
        fechaConsultas: null,
        fechaVisitaTecnica: "2026-08-10",
        fechaEntrega: null,
        inicioServicio: null,
        visitaObligatoria: true,
      },
      {
        address: "Av. Apoquindo 3000, Las Condes",
        lat: -33.41,
        lng: -70.58,
        mapsUrl: "https://www.google.com/maps?q=-33.41,-70.58",
      },
    );
    expect(ms).toHaveLength(1);
    expect(ms[0].kind).toBe("visita_tecnica");
    expect(ms[0].address).toBe("Av. Apoquindo 3000, Las Condes");
    expect(ms[0].lat).toBe(-33.41);
    expect(ms[0].lng).toBe(-70.58);
  });
});

describe("applyInstallationLocationToMilestones", () => {
  it("no pisa una dirección ya definida en el hito", async () => {
    const { applyInstallationLocationToMilestones } = await import(
      "../email-to-crm-structure.types"
    );
    const out = applyInstallationLocationToMilestones(
      [
        {
          id: "visita-1",
          kind: "visita_tecnica",
          date: "2026-08-10",
          time: "09:00",
          durationMin: 60,
          participantIds: [],
          externalEmails: [],
          address: "Dirección ya cargada",
          lat: 1,
          lng: 2,
        },
      ],
      { address: "Otra", lat: 9, lng: 9 },
    );
    expect(out[0].address).toBe("Dirección ya cargada");
    expect(out[0].lat).toBe(1);
  });
});
