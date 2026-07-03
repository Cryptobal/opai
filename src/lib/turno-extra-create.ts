/**
 * Servicio de creación de turno/hora extra (Fase 7). Extraído de `POST /api/te`
 * para reuso desde Slack: valida instalación + guardia, calcula el monto por
 * defecto (puesto → instalación), rechaza duplicados (mismo guardia+fecha+puesto
 * pendiente/aprobado) y crea el turno en estado `pending`. Autorización la hace
 * quien llama.
 */

import { prisma } from "@/lib/prisma";
import { decimalToNumber, parseDateOnly } from "@/lib/ops";

export interface CreateTurnoExtraInput {
  tenantId: string;
  createdBy: string;
  installationId: string;
  guardiaId: string;
  date: string; // YYYY-MM-DD
  tipo: "turno_extra" | "hora_extra";
  puestoId?: string | null;
  amountClp?: number | null;
  horasExtra?: number | null;
}

export type CreateTurnoExtraResult = { ok: true; id: string } | { ok: false; error: string };

export async function createTurnoExtra(input: CreateTurnoExtraInput): Promise<CreateTurnoExtraResult> {
  const [installation, guardia] = await Promise.all([
    prisma.crmInstallation.findFirst({
      where: { id: input.installationId, tenantId: input.tenantId },
      select: {
        id: true, teMontoClp: true,
        opsPuestos: { where: { active: true }, select: { id: true, teMontoClp: true } },
      },
    }),
    prisma.opsGuardia.findFirst({
      where: { id: input.guardiaId, tenantId: input.tenantId },
      select: { id: true, status: true, isBlacklisted: true },
    }),
  ]);

  if (!installation) return { ok: false, error: "Instalación no encontrada" };
  if (!guardia) return { ok: false, error: "Guardia no encontrado" };
  if (guardia.status !== "active" || guardia.isBlacklisted) {
    return { ok: false, error: "No se puede asignar turno extra a guardia inactivo o en lista negra" };
  }

  const puesto = input.puestoId ? installation.opsPuestos.find((p) => p.id === input.puestoId) : null;
  const defaultAmount =
    (puesto && decimalToNumber(puesto.teMontoClp) > 0
      ? decimalToNumber(puesto.teMontoClp)
      : decimalToNumber(installation.teMontoClp)) || 0;
  const amountClp = input.amountClp ?? defaultAmount;
  const date = parseDateOnly(input.date);

  const duplicate = await prisma.opsTurnoExtra.findFirst({
    where: {
      tenantId: input.tenantId, guardiaId: input.guardiaId, date,
      puestoId: input.puestoId ?? null, status: { in: ["pending", "approved"] },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: "Ya existe un turno/hora extra para este guardia en esa fecha y puesto" };
  }

  const turno = await prisma.opsTurnoExtra.create({
    data: {
      tenantId: input.tenantId, installationId: input.installationId, puestoId: input.puestoId ?? null,
      guardiaId: input.guardiaId, date, tipo: input.tipo, isManual: true,
      horasExtra: input.horasExtra ?? null, amountClp, status: "pending", createdBy: input.createdBy,
    },
    select: { id: true },
  });
  return { ok: true, id: turno.id };
}
