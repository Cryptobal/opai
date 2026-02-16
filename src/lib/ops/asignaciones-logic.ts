/**
 * Lógica de negocio compartida para asignaciones de guardias.
 * Usada tanto desde /api/ops/asignaciones como /api/crm/installations/[id]/asignaciones.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpsAuditLog, parseDateOnly, toISODate } from "@/lib/ops";
import type { AuthContext } from "@/lib/api-auth";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const asignarSchema = z.object({
  guardiaId: z.string().uuid(),
  puestoId: z.string().uuid(),
  slotNumber: z.number().int().min(1).max(20),
  startDate: z.string().regex(dateRegex).optional(),
  endDatePrevious: z.string().regex(dateRegex).optional(),
  reason: z.string().max(500).optional().nullable(),
});

export const desasignarSchema = z.object({
  asignacionId: z.string().uuid(),
  endDate: z.string().regex(dateRegex).optional(),
  reason: z.string().max(500).optional().nullable(),
});

export const checkSchema = z.object({
  guardiaId: z.string().uuid(),
});

/**
 * Cleans pauta mensual entries for a guard from a date forward.
 * Removes the guard from planned slots (sets plannedGuardiaId to null).
 * Does NOT erase shiftCode — the series pattern stays painted.
 */
export async function cleanPautaFromDate(
  tenantId: string,
  puestoId: string,
  slotNumber: number,
  guardiaId: string,
  fromDate: Date
) {
  const cleaned = await prisma.opsPautaMensual.updateMany({
    where: {
      tenantId,
      puestoId,
      slotNumber,
      plannedGuardiaId: guardiaId,
      date: { gte: fromDate },
    },
    data: {
      plannedGuardiaId: null,
    },
  });

  return cleaned.count;
}

export type AsignarResult = {
  success: true;
  data: Record<string, unknown>;
  status: 201;
} | {
  success: false;
  error: string;
  status: number;
};

/**
 * Core logic for assigning a guard to a puesto slot.
 * Handles existing assignments, slot conflicts, pauta updates, etc.
 */
export async function executeAsignar(
  ctx: AuthContext,
  rawBody: unknown,
): Promise<AsignarResult> {
  const parsed = asignarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Datos inválidos",
      status: 400,
    };
  }
  const body = parsed.data;

  // Validate guardia
  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: body.guardiaId, tenantId: ctx.tenantId },
    select: { id: true, status: true, lifecycleStatus: true, isBlacklisted: true },
  });
  if (!guardia) {
    return { success: false, error: "Guardia no encontrado", status: 404 };
  }
  if (!["seleccionado", "contratado_activo"].includes(guardia.lifecycleStatus)) {
    return {
      success: false,
      error: `Guardia debe estar en estado 'seleccionado' o 'contratado_activo' (actual: ${guardia.lifecycleStatus})`,
      status: 400,
    };
  }
  if (guardia.isBlacklisted) {
    return {
      success: false,
      error: "No se puede asignar un guardia en lista negra",
      status: 400,
    };
  }

  // Validate puesto
  const puesto = await prisma.opsPuestoOperativo.findFirst({
    where: { id: body.puestoId, tenantId: ctx.tenantId },
    select: { id: true, installationId: true, requiredGuards: true },
  });
  if (!puesto) {
    return { success: false, error: "Puesto no encontrado", status: 404 };
  }
  if (body.slotNumber > puesto.requiredGuards) {
    return {
      success: false,
      error: `Slot ${body.slotNumber} excede la dotación del puesto (${puesto.requiredGuards})`,
      status: 400,
    };
  }

  const startDate = body.startDate
    ? parseDateOnly(body.startDate)
    : parseDateOnly(toISODate(new Date()));

  // End date for previous assignment: use endDatePrevious if provided, else startDate
  const endDateForPrevious = body.endDatePrevious
    ? parseDateOnly(body.endDatePrevious)
    : startDate;

  // 1. If guardia already has active assignment → close it + clean pauta
  const existingGuardiaAssignment = await prisma.opsAsignacionGuardia.findFirst({
    where: { guardiaId: body.guardiaId, tenantId: ctx.tenantId, isActive: true },
  });

  if (existingGuardiaAssignment) {
    await prisma.opsAsignacionGuardia.update({
      where: { id: existingGuardiaAssignment.id },
      data: {
        isActive: false,
        endDate: endDateForPrevious,
        reason: body.reason || "Traslado a otro puesto",
      },
    });

    await cleanPautaFromDate(
      ctx.tenantId,
      existingGuardiaAssignment.puestoId,
      existingGuardiaAssignment.slotNumber,
      body.guardiaId,
      endDateForPrevious
    );

    await createOpsAuditLog(ctx, "ops.asignacion.closed", "ops_asignacion", existingGuardiaAssignment.id, {
      guardiaId: body.guardiaId,
      previousPuestoId: existingGuardiaAssignment.puestoId,
      reason: body.reason || "Traslado a otro puesto",
      pautaCleaned: true,
    });
  }

  // 2. If slot is already occupied → close that assignment + clean pauta
  const existingSlotAssignment = await prisma.opsAsignacionGuardia.findFirst({
    where: {
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      tenantId: ctx.tenantId,
      isActive: true,
    },
  });

  if (existingSlotAssignment) {
    await prisma.opsAsignacionGuardia.update({
      where: { id: existingSlotAssignment.id },
      data: {
        isActive: false,
        endDate: startDate,
        reason: "Reemplazado por otro guardia",
      },
    });

    await cleanPautaFromDate(
      ctx.tenantId,
      existingSlotAssignment.puestoId,
      existingSlotAssignment.slotNumber,
      existingSlotAssignment.guardiaId,
      startDate
    );
  }

  // 3. Create new assignment
  const asignacion = await prisma.opsAsignacionGuardia.create({
    data: {
      tenantId: ctx.tenantId,
      guardiaId: body.guardiaId,
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      installationId: puesto.installationId,
      startDate,
      isActive: true,
      reason: body.reason || "Asignación inicial",
      createdBy: ctx.userId,
    },
    include: {
      guardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      },
      puesto: { select: { id: true, name: true } },
    },
  });

  // 4. Write plannedGuardiaId on all "T" days from startDate forward
  await prisma.opsPautaMensual.updateMany({
    where: {
      tenantId: ctx.tenantId,
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      shiftCode: "T",
      date: { gte: startDate },
    },
    data: {
      plannedGuardiaId: body.guardiaId,
    },
  });

  // Also update the serie to reference the new guard
  await prisma.opsSerieAsignacion.updateMany({
    where: {
      tenantId: ctx.tenantId,
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      isActive: true,
    },
    data: { guardiaId: body.guardiaId },
  });

  // 5. Auto-sync currentInstallationId on guard profile
  await prisma.opsGuardia.update({
    where: { id: body.guardiaId },
    data: { currentInstallationId: puesto.installationId },
  });

  // If the displaced guard has no other active assignments, clear their currentInstallationId
  if (existingSlotAssignment && existingSlotAssignment.guardiaId !== body.guardiaId) {
    const otherActive = await prisma.opsAsignacionGuardia.findFirst({
      where: {
        guardiaId: existingSlotAssignment.guardiaId,
        tenantId: ctx.tenantId,
        isActive: true,
      },
    });
    if (!otherActive) {
      await prisma.opsGuardia.update({
        where: { id: existingSlotAssignment.guardiaId },
        data: { currentInstallationId: null },
      });
    }
  }

  await createOpsAuditLog(ctx, "ops.asignacion.created", "ops_asignacion", asignacion.id, {
    guardiaId: body.guardiaId,
    puestoId: body.puestoId,
    slotNumber: body.slotNumber,
    startDate: toISODate(startDate),
  });

  return {
    success: true,
    data: asignacion as unknown as Record<string, unknown>,
    status: 201,
  };
}

export type DesasignarResult = {
  success: true;
  data: Record<string, unknown>;
  status: 200;
} | {
  success: false;
  error: string;
  status: number;
};

/**
 * Core logic for unassigning a guard from a slot.
 */
export async function executeDesasignar(
  ctx: AuthContext,
  rawBody: unknown,
): Promise<DesasignarResult> {
  const parsed = desasignarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Datos inválidos",
      status: 400,
    };
  }
  const body = parsed.data;

  const asignacion = await prisma.opsAsignacionGuardia.findFirst({
    where: { id: body.asignacionId, tenantId: ctx.tenantId, isActive: true },
  });
  if (!asignacion) {
    return { success: false, error: "Asignación activa no encontrada", status: 404 };
  }

  const endDate = body.endDate
    ? parseDateOnly(body.endDate)
    : parseDateOnly(toISODate(new Date()));

  const updated = await prisma.opsAsignacionGuardia.update({
    where: { id: asignacion.id },
    data: {
      isActive: false,
      endDate,
      reason: body.reason || "Desasignado manualmente",
    },
  });

  const cleanedCount = await cleanPautaFromDate(
    ctx.tenantId,
    asignacion.puestoId,
    asignacion.slotNumber,
    asignacion.guardiaId,
    endDate
  );

  // Auto-sync: if guard has no other active assignments, clear currentInstallationId
  const otherActive = await prisma.opsAsignacionGuardia.findFirst({
    where: {
      guardiaId: asignacion.guardiaId,
      tenantId: ctx.tenantId,
      isActive: true,
    },
  });
  if (!otherActive) {
    await prisma.opsGuardia.update({
      where: { id: asignacion.guardiaId },
      data: { currentInstallationId: null },
    });
  }

  await createOpsAuditLog(ctx, "ops.asignacion.closed", "ops_asignacion", asignacion.id, {
    guardiaId: asignacion.guardiaId,
    puestoId: asignacion.puestoId,
    reason: body.reason || "Desasignado manualmente",
    pautaCleaned: cleanedCount,
  });

  return {
    success: true,
    data: { ...updated, pautaCleaned: cleanedCount } as unknown as Record<string, unknown>,
    status: 200,
  };
}

export type CheckResult = {
  success: true;
  data: {
    hasActiveAssignment: boolean;
    assignment: {
      id: string;
      puestoName: string;
      installationName: string;
      accountName: string | null;
      slotNumber: number;
      startDate: Date;
    } | null;
  };
};

/**
 * Check: returns existing assignment info for a guard (for UI warnings).
 */
export async function executeCheck(
  ctx: AuthContext,
  rawBody: unknown,
): Promise<CheckResult | { success: false; error: string; status: number }> {
  const parsed = checkSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { success: false, error: "guardiaId inválido", status: 400 };
  }

  const existing = await prisma.opsAsignacionGuardia.findFirst({
    where: { guardiaId: parsed.data.guardiaId, tenantId: ctx.tenantId, isActive: true },
    include: {
      puesto: { select: { id: true, name: true } },
      installation: {
        select: {
          id: true,
          name: true,
          account: { select: { name: true } },
        },
      },
    },
  });

  return {
    success: true,
    data: {
      hasActiveAssignment: !!existing,
      assignment: existing
        ? {
            id: existing.id,
            puestoName: existing.puesto.name,
            installationName: existing.installation.name,
            accountName: existing.installation.account?.name ?? null,
            slotNumber: existing.slotNumber,
            startDate: existing.startDate,
          }
        : null,
    },
  };
}

/**
 * List assignments for a given filter.
 */
export async function listAsignaciones(
  tenantId: string,
  filters: {
    installationId?: string;
    puestoId?: string;
    guardiaId?: string;
    activeOnly?: boolean;
  },
) {
  return prisma.opsAsignacionGuardia.findMany({
    where: {
      tenantId,
      ...(filters.installationId ? { installationId: filters.installationId } : {}),
      ...(filters.puestoId ? { puestoId: filters.puestoId } : {}),
      ...(filters.guardiaId ? { guardiaId: filters.guardiaId } : {}),
      ...(filters.activeOnly !== false ? { isActive: true } : {}),
    },
    include: {
      guardia: {
        select: {
          id: true,
          code: true,
          status: true,
          lifecycleStatus: true,
          persona: {
            select: { firstName: true, lastName: true, rut: true },
          },
        },
      },
      puesto: {
        select: {
          id: true,
          name: true,
          shiftStart: true,
          shiftEnd: true,
          requiredGuards: true,
        },
      },
      installation: {
        select: {
          id: true,
          name: true,
          account: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });
}
