/**
 * Data del tablero de relevo: consulta `OpsAsistenciaDiaria` del día de una
 * instalación y separa el turno ENTRANTE (puestos cuyo `shiftStart` = el turno
 * que llega) del SALIENTE (los del/los otro(s) shift, que se relevan).
 *
 * Simplificación deliberada: saliente = puestos con un `shiftStart` distinto al
 * entrante. En instalaciones de guardia (día/noche) esto es exacto; con >2
 * turnos distintos agrupa todos los demás como "saliente".
 */

import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";

export interface RelevoGuardiaRow {
  asistenciaId: string;
  nombre: string;
  rut: string;
  /** Celular o fijo del guardia activo (mobile preferido). */
  telefono: string | null;
  puesto: string;
  estado: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  contactoResultado: string | null;
}

export interface RelevoBoardData {
  installationId: string;
  installationName: string;
  date: Date;
  shiftStart: string;
  turnoLabel: string;
  saliente: RelevoGuardiaRow[];
  entrante: RelevoGuardiaRow[];
  cobertura: { cubiertos: number; total: number; ppc: number };
}

const PRESENT_STATES = new Set(["asistio", "presente", "confirmado_llegada"]);

type PersonaSel = {
  persona: {
    firstName: string | null;
    lastName: string | null;
    rut: string | null;
    phone: string | null;
    phoneMobile: string | null;
  };
} | null;

function personaName(g: PersonaSel): { nombre: string; rut: string; telefono: string | null } | null {
  if (!g) return null;
  return {
    nombre: formatPersonName(g.persona.firstName, g.persona.lastName) || "—",
    rut: g.persona.rut ?? "",
    telefono: g.persona.phoneMobile?.trim() || g.persona.phone?.trim() || null,
  };
}

/** Etiqueta día/noche derivada del `shiftStart` ("HH:MM"). */
export function turnoLabelFromShiftStart(shiftStart: string): string {
  const hour = parseInt(shiftStart.slice(0, 2), 10);
  return Number.isFinite(hour) && hour < 12 ? "Turno día" : "Turno noche";
}

export async function buildRelevoBoardData(input: {
  tenantId: string;
  installationId: string;
  date: Date;
  shiftStart: string;
}): Promise<RelevoBoardData> {
  const [installation, rows] = await Promise.all([
    prisma.crmInstallation.findFirst({
      where: { id: input.installationId, tenantId: input.tenantId },
      select: { name: true },
    }),
    prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: input.tenantId,
        installationId: input.installationId,
        date: input.date,
        deletedAt: null,
      },
      select: {
        id: true,
        attendanceStatus: true,
        checkInAt: true,
        checkOutAt: true,
        contactoCentralResultado: true,
        replacementGuardiaId: true,
        puesto: { select: { name: true, shiftStart: true } },
        plannedGuardia: {
          select: {
            persona: { select: { firstName: true, lastName: true, rut: true, phone: true, phoneMobile: true } },
          },
        },
        actualGuardia: {
          select: {
            persona: { select: { firstName: true, lastName: true, rut: true, phone: true, phoneMobile: true } },
          },
        },
        replacementGuardia: {
          select: {
            persona: { select: { firstName: true, lastName: true, rut: true, phone: true, phoneMobile: true } },
          },
        },
      },
      orderBy: [{ puesto: { shiftStart: "asc" } }, { slotNumber: "asc" }],
    }),
  ]);

  const toRow = (r: (typeof rows)[number]): RelevoGuardiaRow => {
    const active =
      (r.replacementGuardiaId && r.attendanceStatus === "reemplazo"
        ? personaName(r.replacementGuardia)
        : null) ??
      personaName(r.actualGuardia) ??
      personaName(r.plannedGuardia);
    return {
      asistenciaId: r.id,
      nombre: active?.nombre ?? "PPC",
      rut: active?.rut ?? "",
      telefono: active?.telefono ?? null,
      puesto: r.puesto.name,
      estado: r.attendanceStatus,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      contactoResultado: r.contactoCentralResultado,
    };
  };

  // Normaliza a "HH:MM" con cero a la izquierda antes de comparar: el createMany
  // guarda `plannedShiftStart` desde `puesto.shiftStart` y el filtro compara
  // contra `puesto.shiftStart` (join vivo) — mismo origen, pero blindamos contra
  // cualquier "8:00" vs "08:00" que dejaría el tablero vacío en silencio.
  const norm = (s: string) => s.trim().padStart(5, "0");
  const targetShift = norm(input.shiftStart);
  const entrante = rows.filter((r) => norm(r.puesto.shiftStart) === targetShift).map(toRow);
  const saliente = rows.filter((r) => norm(r.puesto.shiftStart) !== targetShift).map(toRow);

  const total = entrante.length;
  const cubiertos = entrante.filter((r) => PRESENT_STATES.has(r.estado)).length;
  const ppc = entrante.filter((r) => r.estado === "ppc" || r.nombre === "PPC").length;

  return {
    installationId: input.installationId,
    installationName: installation?.name ?? "Instalación",
    date: input.date,
    shiftStart: input.shiftStart,
    turnoLabel: turnoLabelFromShiftStart(input.shiftStart),
    saliente,
    entrante,
    cobertura: { cubiertos, total, ppc },
  };
}
