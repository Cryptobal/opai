import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import { todayInChile, utcDateFromYmd } from "@/lib/dates-cl";
import { cleanRut, toSiiRut } from "@/lib/chile-rut";

export type DeviceGuard = {
  id: string;
  name: string;
  code: string | null;
  isTurnoExtra: boolean;
};

const GUARD_SELECT = {
  id: true,
  code: true,
  status: true,
  isBlacklisted: true,
  persona: { select: { firstName: true, lastName: true } },
} as const;

type GuardRow = {
  id: string;
  code: string | null;
  status: string;
  isBlacklisted: boolean;
  persona: { firstName: string | null; lastName: string | null } | null;
};

const SEARCH_LIMIT = 40;

function pushGuard(
  guards: Map<string, DeviceGuard>,
  row: GuardRow | null | undefined,
  isTurnoExtra: boolean,
) {
  if (!row || row.status !== "active" || row.isBlacklisted) return;
  const name = formatPersonName(row.persona?.firstName, row.persona?.lastName);
  if (!name) return;
  const existing = guards.get(row.id);
  if (existing) {
    if (!isTurnoExtra) existing.isTurnoExtra = false;
    return;
  }
  guards.set(row.id, { id: row.id, name, code: row.code, isTurnoExtra });
}

function sortGuards(guards: DeviceGuard[]): DeviceGuard[] {
  return [...guards].sort((a, b) => {
    if (a.isTurnoExtra !== b.isTurnoExtra) return a.isTurnoExtra ? 1 : -1;
    return a.name.localeCompare(b.name, "es");
  });
}

/**
 * Guardias que un dispositivo de instalación puede seleccionar.
 *
 * Fuentes (sin query): asignaciones activas, currentInstallationId,
 * pauta y asistencia de hoy (TZ Chile), turnos extra aprobados.
 * Con `query` (≥2 chars): busca en el tenant por nombre o código.
 */
export async function listDeviceGuards(args: {
  tenantId: string;
  installationId: string;
  query?: string;
  now?: Date;
}): Promise<DeviceGuard[]> {
  const q = args.query?.trim() ?? "";
  if (q.length >= 2) {
    const rows = await prisma.opsGuardia.findMany({
      where: {
        tenantId: args.tenantId,
        status: "active",
        isBlacklisted: false,
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { persona: { firstName: { contains: q, mode: "insensitive" } } },
          { persona: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: GUARD_SELECT,
      orderBy: { persona: { lastName: "asc" } },
      take: SEARCH_LIMIT,
    });
    const guards = new Map<string, DeviceGuard>();
    for (const row of rows) pushGuard(guards, row, false);
    return sortGuards([...guards.values()]);
  }

  const today = utcDateFromYmd(todayInChile(args.now));
  const activeAtInstallation = {
    status: "active" as const,
    isBlacklisted: false,
  };

  const [assignments, stationed, pauta, extras, asistencia] = await Promise.all([
    prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: args.tenantId,
        installationId: args.installationId,
        isActive: true,
        guardia: activeAtInstallation,
      },
      select: { guardia: { select: GUARD_SELECT } },
    }),
    prisma.opsGuardia.findMany({
      where: {
        tenantId: args.tenantId,
        currentInstallationId: args.installationId,
        ...activeAtInstallation,
      },
      select: GUARD_SELECT,
    }),
    prisma.opsPautaMensual.findMany({
      where: {
        tenantId: args.tenantId,
        installationId: args.installationId,
        date: today,
      },
      select: {
        plannedGuardia: { select: GUARD_SELECT },
        replacementGuardia: { select: GUARD_SELECT },
      },
    }),
    prisma.opsTurnoExtra.findMany({
      where: {
        tenantId: args.tenantId,
        installationId: args.installationId,
        date: today,
        status: "approved",
        tipo: "turno_extra",
        guardia: activeAtInstallation,
      },
      select: { guardia: { select: GUARD_SELECT } },
    }),
    prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: args.tenantId,
        installationId: args.installationId,
        date: today,
        deletedAt: null,
      },
      select: {
        plannedGuardia: { select: GUARD_SELECT },
        actualGuardia: { select: GUARD_SELECT },
        replacementGuardia: { select: GUARD_SELECT },
      },
    }),
  ]);

  const guards = new Map<string, DeviceGuard>();
  for (const a of assignments) pushGuard(guards, a.guardia, false);
  for (const g of stationed) pushGuard(guards, g, false);
  for (const p of pauta) {
    pushGuard(guards, p.plannedGuardia, false);
    pushGuard(guards, p.replacementGuardia, false);
  }
  for (const row of asistencia) {
    pushGuard(guards, row.plannedGuardia, false);
    pushGuard(guards, row.actualGuardia, false);
    pushGuard(guards, row.replacementGuardia, false);
  }
  for (const t of extras) pushGuard(guards, t.guardia, true);

  return sortGuards([...guards.values()]);
}

export async function pinMatches(
  pin: string,
  storedPin: string | null | undefined,
  visiblePin: string | null | undefined,
): Promise<boolean> {
  if (!pin) return false;
  if (storedPin) {
    if (storedPin.startsWith("$2")) {
      try {
        if (await bcrypt.compare(pin, storedPin)) return true;
      } catch {
        // hash ilegible — caer al PIN visible
      }
    } else if (storedPin === pin) {
      return true;
    }
  }
  return Boolean(visiblePin && visiblePin === pin);
}

export function rutLookupValues(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const compact = cleanRut(trimmed);
  const values = new Set<string>();
  if (trimmed) values.add(trimmed.toUpperCase());
  if (compact) values.add(compact);
  if (compact.length >= 8) values.add(toSiiRut(trimmed));
  return [...values];
}

export async function bindDeviceCurrentGuard(args: {
  deviceId: string;
  tenantId: string;
  installationId: string;
  previousGuardId: string | null;
  guardId: string | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.devicePairing.update({
      where: { id: args.deviceId },
      data: {
        currentGuardId: args.guardId,
        guardSelectedAt: new Date(),
      },
    }),
    prisma.guardSelectionLog.create({
      data: {
        tenantId: args.tenantId,
        devicePairingId: args.deviceId,
        installationId: args.installationId,
        fromGuardId: args.previousGuardId,
        toGuardId: args.guardId,
        timestamp: new Date(),
      },
    }),
  ]);
}

/** Recuerda el guardia en el dispositivo tras una marcación. No debe fallar el punch. */
export async function rememberDeviceGuard(
  devicePairingId: string | null | undefined,
  guardiaId: string,
): Promise<void> {
  if (!devicePairingId) return;
  try {
    await prisma.devicePairing.update({
      where: { id: devicePairingId },
      data: {
        currentGuardId: guardiaId,
        guardSelectedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[devices] rememberDeviceGuard:", error);
  }
}
