import { prisma } from "@/lib/prisma";
import { JORNADA_OPTIONS } from "./constants";
import { mapTipoJornadaToArt25, turnoKey } from "./filters";

function regionOf(inst: { city: string | null; commune: string | null }): string {
  return (inst.city || inst.commune || "Sin región").trim() || "Sin región";
}

export async function loadDtFilterOptions(tenantId: string) {
  const [instalaciones, puestos, guardias, estRows] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: { tenantId },
      select: { id: true, name: true, city: true, commune: true },
      orderBy: { name: "asc" },
    }),
    prisma.opsPuestoOperativo.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        name: true,
        shiftStart: true,
        shiftEnd: true,
        weekdays: true,
        installationId: true,
        cargo: { select: { name: true } },
      },
    }),
    prisma.opsGuardia.findMany({
      where: { tenantId, status: "active" },
      select: {
        id: true,
        tipoJornada: true,
        persona: { select: { firstName: true, lastName: true, rut: true, cargoStaff: true } },
      },
      orderBy: { persona: { lastName: "asc" } },
    }),
    prisma.opsMarcacion.findMany({
      where: { tenantId, mandanteRut: { not: null } },
      distinct: ["mandanteRut"],
      select: { mandanteRut: true, mandanteName: true },
      take: 200,
    }),
  ]);

  const regionesMap = new Map<string, { id: string; name: string }[]>();
  for (const inst of instalaciones) {
    const region = regionOf(inst);
    const list = regionesMap.get(region) ?? [];
    list.push({ id: inst.id, name: inst.name });
    regionesMap.set(region, list);
  }

  const regiones = [...regionesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([name, items]) => ({
      name,
      cascade: items.length > 5,
      instalaciones: items,
    }));

  const turnosMap = new Map<string, string>();
  for (const p of puestos) {
    const key = turnoKey(p.shiftStart, p.shiftEnd, p.weekdays);
    if (!turnosMap.has(key)) turnosMap.set(key, `${p.shiftStart} a ${p.shiftEnd}`);
  }

  const cargoSet = new Set<string>();
  for (const p of puestos) {
    if (p.cargo?.name) cargoSet.add(p.cargo.name);
  }
  for (const g of guardias) {
    if (g.persona.cargoStaff) cargoSet.add(g.persona.cargoStaff);
  }

  return {
    periodos: [
      { id: "ultima_semana", label: "Última semana" },
      { id: "ultima_quincena", label: "Última quincena" },
      { id: "mes_anterior", label: "Mes anterior" },
      { id: "12_meses", label: "Últimos 12 meses" },
    ],
    jornadas: JORNADA_OPTIONS.map((j) => ({ id: j.id, label: j.label })),
    turnos: [...turnosMap.entries()].map(([id, label]) => ({ id, label })),
    regiones,
    instalaciones: instalaciones.map((i) => ({
      id: i.id,
      name: i.name,
      region: regionOf(i),
    })),
    cargos: [...cargoSet].sort((a, b) => a.localeCompare(b, "es")).map((name) => ({ id: name, label: name })),
    trabajadores: guardias.map((g) => ({
      id: g.id,
      nombre: `${g.persona.lastName} ${g.persona.firstName}`.trim(),
      rut: g.persona.rut || "",
      jornada: mapTipoJornadaToArt25(g.tipoJornada),
    })),
    ests: estRows
      .filter((e) => e.mandanteRut)
      .map((e) => ({ rut: e.mandanteRut as string, name: e.mandanteName || e.mandanteRut })),
  };
}
