import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updateGuardiaSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess, ensureOpsCapability } from "@/lib/ops";
import { hasOpsCapability } from "@/lib/ops-rbac";
import {
  lifecycleToLegacyStatus,
  normalizeNullable,
  type GuardiaLifecycleStatus,
} from "@/lib/personas";
import { encryptPersonaFields, decryptPersonaFields } from "@/lib/persona-encryption";

type Params = { id: string };

function toNullableDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNullableDecimal(value?: number | string | null): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  return new Prisma.Decimal(value);
}

function toNullablePercent(value?: number | string | null): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Prisma.Decimal(parsed);
}

function dateOnlyIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

const PLAN_SELECCION_KEYS = new Set(["intendedInstallationId", "intendedContractDate"]);

function isPlanSeleccionOnlyBody(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined);
  return keys.length > 0 && keys.every((k) => PLAN_SELECCION_KEYS.has(k));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        persona: true,
        bankAccounts: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        },
        intendedPlanUpdatedBy: { select: { id: true, name: true } },
        flags: {
          where: { active: true },
          orderBy: [{ createdAt: "desc" }],
        },
        comments: {
          orderBy: [{ createdAt: "desc" }],
          take: 20,
        },
        documents: {
          orderBy: [{ createdAt: "desc" }],
          take: 20,
        },
        historyEvents: {
          orderBy: [{ createdAt: "desc" }],
          take: 50,
        },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    // Sanitizar: no enviar el hash del PIN, solo indicar si existe
    const { marcacionPin, ...guardiaRest } = guardia;
    const sanitized = {
      ...guardiaRest,
      // Descifrar campos sensibles (Ley 21.719)
      persona: decryptPersonaFields(guardiaRest.persona),
      marcacionPin: marcacionPin ? "[configurado]" : null,
    };

    return NextResponse.json({ success: true, data: sanitized });
  } catch (error) {
    console.error("[PERSONAS] Error fetching guardia:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el guardia" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenModule = await ensureOpsAccess(ctx);
    if (forbiddenModule) return forbiddenModule;

    const { id } = await params;
    const parsed = await parseBody(request, updateGuardiaSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const canManage = hasOpsCapability(ctx.userRole, "guardias_manage");
    const canPlanSeleccion = hasOpsCapability(ctx.userRole, "guardias_plan_seleccion");
    const planOnly = isPlanSeleccionOnlyBody(body as Record<string, unknown>);
    if (canManage) {
      /* edición completa */
    } else if (canPlanSeleccion && planOnly) {
      /* solo plan de selección */
    } else {
      return NextResponse.json(
        {
          success: false,
          error:
            "Sin permisos para editar estos datos. El plan de selección lo pueden editar supervisores y roles superiores.",
        },
        { status: 403 }
      );
    }

    const existing = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { persona: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    if (body.intendedInstallationId !== undefined && body.intendedInstallationId !== null) {
      const inst = await prisma.crmInstallation.findFirst({
        where: {
          id: body.intendedInstallationId,
          tenantId: ctx.tenantId,
          status: "active",
          account: { type: "client", isActive: true },
        },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "La instalación indicada no existe o no está activa" },
          { status: 400 }
        );
      }
    }

    const nextInstallationId =
      body.intendedInstallationId === undefined
        ? existing.intendedInstallationId
        : body.intendedInstallationId;
    const installationChanged =
      body.intendedInstallationId !== undefined &&
      nextInstallationId !== existing.intendedInstallationId;

    const nextContractDateIso =
      body.intendedContractDate === undefined
        ? dateOnlyIso(existing.intendedContractDate)
        : body.intendedContractDate || null;
    const contractDateChanged =
      body.intendedContractDate !== undefined &&
      nextContractDateIso !== dateOnlyIso(existing.intendedContractDate);

    const planFieldsPresent =
      body.intendedInstallationId !== undefined || body.intendedContractDate !== undefined;
    const planAuditData =
      planFieldsPresent && (installationChanged || contractDateChanged)
        ? { intendedPlanUpdatedAt: new Date() as Date, intendedPlanUpdatedById: ctx.userId }
        : {};

    const result = await prisma.$transaction(async (tx) => {
      const prevLifecycle = existing.lifecycleStatus;
      const nextLifecycle = (body.lifecycleStatus ?? prevLifecycle) as GuardiaLifecycleStatus;

      if (!planOnly) {
      await tx.opsPersona.update({
        where: { id: existing.personaId },
        data: encryptPersonaFields({
          firstName: body.firstName ?? undefined,
          lastName: body.lastName ?? undefined,
          rut: body.rut !== undefined ? normalizeNullable(body.rut) : undefined,
          email: body.email !== undefined ? normalizeNullable(body.email) : undefined,
          phone: body.phone !== undefined ? normalizeNullable(body.phone) : undefined,
          phoneMobile: body.phoneMobile !== undefined ? normalizeNullable(body.phoneMobile) : undefined,
          addressFormatted: normalizeNullable(body.addressFormatted) ?? undefined,
          googlePlaceId: normalizeNullable(body.googlePlaceId) ?? undefined,
          addressLine1: body.addressLine1 !== undefined ? normalizeNullable(body.addressLine1) : undefined,
          commune: body.commune !== undefined ? normalizeNullable(body.commune) : undefined,
          city: body.city !== undefined ? normalizeNullable(body.city) : undefined,
          region: body.region !== undefined ? normalizeNullable(body.region) : undefined,
          sex: body.sex !== undefined ? normalizeNullable(body.sex) : undefined,
          nacionalidad: body.nacionalidad !== undefined ? normalizeNullable(body.nacionalidad) : undefined,
          lat: body.lat !== undefined ? toNullableDecimal(body.lat) : undefined,
          lng: body.lng !== undefined ? toNullableDecimal(body.lng) : undefined,
          birthDate: body.birthDate !== undefined ? toNullableDate(body.birthDate) : undefined,
          afp: body.afp !== undefined ? normalizeNullable(body.afp) : undefined,
          healthSystem: body.healthSystem !== undefined ? normalizeNullable(body.healthSystem) : undefined,
          isapreName: body.isapreName !== undefined ? normalizeNullable(body.isapreName) : undefined,
          isapreHasExtraPercent:
            body.isapreHasExtraPercent !== undefined ? body.isapreHasExtraPercent : undefined,
          isapreExtraPercent:
            body.isapreExtraPercent !== undefined
              ? toNullablePercent(body.isapreExtraPercent)
              : undefined,
          hasMobilization: body.hasMobilization !== undefined ? body.hasMobilization : undefined,
          shoeSize: body.shoeSize !== undefined ? normalizeNullable(body.shoeSize) : undefined,
          pantsSize: body.pantsSize !== undefined ? normalizeNullable(body.pantsSize) : undefined,
          tshirtSize: body.tshirtSize !== undefined ? normalizeNullable(body.tshirtSize) : undefined,
          shirtSize: body.shirtSize !== undefined ? normalizeNullable(body.shirtSize) : undefined,
          geologoSize: body.geologoSize !== undefined ? normalizeNullable(body.geologoSize) : undefined,
          polarSize: body.polarSize !== undefined ? normalizeNullable(body.polarSize) : undefined,
          jacketSize: body.jacketSize !== undefined ? normalizeNullable(body.jacketSize) : undefined,
          heightCm: body.heightCm !== undefined ? toNullableDecimal(body.heightCm) : undefined,
          weightKg: body.weightKg !== undefined ? toNullableDecimal(body.weightKg) : undefined,
          regimenPrevisional: body.regimenPrevisional !== undefined ? normalizeNullable(body.regimenPrevisional) : undefined,
          tipoPension: body.tipoPension !== undefined ? normalizeNullable(body.tipoPension) : undefined,
          isJubilado: body.isJubilado !== undefined ? body.isJubilado : undefined,
          cotizaAFP: body.cotizaAFP !== undefined ? body.cotizaAFP : undefined,
          cotizaAFC: body.cotizaAFC !== undefined ? body.cotizaAFC : undefined,
          cotizaSalud: body.cotizaSalud !== undefined ? body.cotizaSalud : undefined,
          personalEmail: body.personalEmail !== undefined ? normalizeNullable(body.personalEmail) : undefined,
        }),
      });
      }

      // Also save personalEmail on OpsGuardia for direct access
      if (!planOnly && body.personalEmail !== undefined) {
        await tx.opsGuardia.update({
          where: { id },
          data: { personalEmail: normalizeNullable(body.personalEmail) },
        });
      }

      const updated = await tx.opsGuardia.update({
        where: { id },
        data: planOnly
          ? {
              intendedInstallationId:
                body.intendedInstallationId === undefined ? undefined : body.intendedInstallationId,
              intendedContractDate:
                body.intendedContractDate === undefined
                  ? undefined
                  : toNullableDate(body.intendedContractDate),
              ...planAuditData,
            }
          : {
              lifecycleStatus: nextLifecycle,
              status: body.status ?? lifecycleToLegacyStatus(nextLifecycle),
              hiredAt:
                body.hiredAt !== undefined
                  ? toNullableDate(body.hiredAt)
                  : nextLifecycle === "contratado" && !existing.hiredAt
                    ? new Date()
                    : undefined,
              terminatedAt:
                body.terminatedAt !== undefined
                  ? toNullableDate(body.terminatedAt)
                  : undefined,
              terminationReason:
                body.terminationReason !== undefined
                  ? normalizeNullable(body.terminationReason)
                  : undefined,
              availableExtraShifts:
                body.availableExtraShifts ?? undefined,
              intendedInstallationId:
                body.intendedInstallationId === undefined ? undefined : body.intendedInstallationId,
              intendedContractDate:
                body.intendedContractDate === undefined
                  ? undefined
                  : toNullableDate(body.intendedContractDate),
              ...planAuditData,
            },
        include: {
          persona: true,
          bankAccounts: {
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          },
          intendedInstallation: {
            select: { id: true, name: true, account: { select: { id: true, name: true } } },
          },
          intendedPlanUpdatedBy: { select: { id: true, name: true } },
        },
      });

      if (prevLifecycle !== nextLifecycle) {
        await tx.opsGuardiaHistory.create({
          data: {
            tenantId: ctx.tenantId,
            guardiaId: id,
            eventType: "lifecycle_changed",
            previousValue: { lifecycleStatus: prevLifecycle },
            newValue: { lifecycleStatus: nextLifecycle, from: prevLifecycle, to: nextLifecycle },
            reason: normalizeNullable(body.terminationReason),
            createdBy: ctx.userId,
          },
        });
      }

      // Log personal data changes
      const personalFields = [
        "firstName", "lastName", "rut", "email", "phoneMobile", "sex", "nacionalidad",
        "birthDate", "afp", "healthSystem", "isapreName", "isapreHasExtraPercent",
        "isapreExtraPercent", "hasMobilization", "shoeSize", "pantsSize", "tshirtSize",
        "shirtSize", "geologoSize", "polarSize", "jacketSize", "heightCm", "weightKg",
        "addressFormatted", "commune", "city",
        "region", "regimenPrevisional", "tipoPension", "isJubilado", "cotizaAFP",
        "cotizaAFC", "cotizaSalud", "availableExtraShifts",
      ];
      const changedFields = personalFields.filter((f) => (body as Record<string, unknown>)[f] !== undefined);
      if (changedFields.length > 0) {
        await tx.opsGuardiaHistory.create({
          data: {
            tenantId: ctx.tenantId,
            guardiaId: id,
            eventType: "personal_data_updated",
            newValue: { changedFields },
            createdBy: ctx.userId,
          },
        });
      }

      if (body.notes && body.notes.trim()) {
        await tx.opsComentarioGuardia.create({
          data: {
            tenantId: ctx.tenantId,
            guardiaId: id,
            comment: body.notes.trim(),
            createdBy: ctx.userId,
          },
        });
      }

      return updated;
    });

    await createOpsAuditLog(ctx, "personas.guardia.updated", "ops_guardia", id, {
      changes: body,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[PERSONAS] Error updating guardia:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el guardia" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, personaId: true, persona: { select: { firstName: true, lastName: true, rut: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Delete guardia (cascade deletes related records like flags, docs, comments, history, bank accounts)
      await tx.opsGuardia.delete({ where: { id } });
      // Delete the persona record as well
      await tx.opsPersona.delete({ where: { id: existing.personaId } });
    });

    await createOpsAuditLog(ctx, "personas.guardia.deleted", "ops_guardia", id, {
      firstName: existing.persona.firstName,
      lastName: existing.persona.lastName,
      rut: existing.persona.rut,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PERSONAS] Error deleting guardia:", error);

    const msg = error instanceof Error ? error.message : "No se pudo eliminar el guardia";
    const isPrismaFK =
      error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2003";
    if (isPrismaFK) {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar: el guardia tiene registros asociados (marcaciones, asistencia, rondas, etc.). Desvincularlo en su lugar." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
