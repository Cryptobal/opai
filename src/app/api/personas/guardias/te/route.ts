/**
 * POST /api/personas/guardias/te
 * Ingreso rápido de guardia Turno Extra (TE).
 * Permisos: Supervisor (te_ingreso), Admin, RRHH, Owner (guardias_manage)
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createGuardiaTeSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { normalizeNullable } from "@/lib/personas";

function buildNextGuardiaCode(lastCode?: string | null): string {
  if (!lastCode) return "G-000001";
  const match = /^G-(\d{6})$/.exec(lastCode);
  const next = (match ? Number(match[1]) : 0) + 1;
  return `G-${String(next).padStart(6, "0")}`;
}

async function generateUniqueGuardiaCode(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ code: string | null }>>`
    SELECT code
    FROM ops.guardias
    WHERE tenant_id = ${tenantId}
      AND code ~ '^G-[0-9]{6}$'
    ORDER BY code DESC
    LIMIT 1
  `;
  return buildNextGuardiaCode(rows[0]?.code ?? null);
}

function toNullableDecimal(value?: number | string | null): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Prisma.Decimal(parsed);
}

function toNullableDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const canCreateTe =
      hasOpsCapability(ctx.userRole, "guardias_manage") ||
      hasOpsCapability(ctx.userRole, "guardias_te_ingreso");
    if (!canCreateTe) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para ingresar guardias Turno Extra" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createGuardiaTeSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const normalizedRut = normalizeNullable(body.rut);
    const existingByRut = normalizedRut
      ? await prisma.opsPersona.findFirst({
          where: { tenantId: ctx.tenantId, rut: normalizedRut },
          select: { id: true },
        })
      : null;
    if (existingByRut) {
      return NextResponse.json(
        { success: false, error: "RUT ya ingresado. Comunicarse con recursos humanos." },
        { status: 400 }
      );
    }

    const holderName = body.holderName?.trim() || normalizedRut ?? "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let result: Awaited<ReturnType<typeof prisma.opsGuardia.findUnique>> | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        result = await prisma.$transaction(async (tx) => {
          const persona = await tx.opsPersona.create({
            data: {
              tenantId: ctx.tenantId,
              firstName: body.firstName,
              lastName: body.lastName,
              rut: normalizedRut,
              phoneMobile: body.phoneMobile,
              addressFormatted: body.addressFormatted,
              googlePlaceId: body.googlePlaceId ?? null,
              commune: body.commune ?? null,
              city: body.city ?? null,
              region: body.region ?? null,
              lat: toNullableDecimal(body.lat),
              lng: toNullableDecimal(body.lng),
              birthDate: toNullableDate(body.birthDate),
              addressSource: "google_places",
              status: "active",
            },
          });

          const generatedCode = await generateUniqueGuardiaCode(tx, ctx.tenantId);
          const guardia = await tx.opsGuardia.create({
            data: {
              tenantId: ctx.tenantId,
              personaId: persona.id,
              code: generatedCode,
              lifecycleStatus: "te",
              status: "active",
              hiredAt: today,
              availableExtraShifts: true,
              os10: body.os10,
              estadoUniforme: body.estadoUniforme,
              prendasFaltantes:
                body.estadoUniforme === "incompleto" ? body.prendasFaltantes ?? null : null,
              validadoAntecedentes:
                hasOpsCapability(ctx.userRole, "guardias_manage") && body.validadoAntecedentes != null
                  ? body.validadoAntecedentes
                  : null,
              notaEvaluacion: body.notaEvaluacion ?? null,
              comentarioEvaluacion: body.comentarioEvaluacion ?? null,
              teRegistradoPor: ctx.userId,
            },
          });

          await tx.opsCuentaBancaria.create({
            data: {
              tenantId: ctx.tenantId,
              guardiaId: guardia.id,
              bankCode: body.bankCode,
              bankName: body.bankName,
              accountType: body.accountType,
              accountNumber: body.accountNumber,
              holderName: holderName || normalizedRut ?? "N/D",
              holderRut: normalizedRut,
              isDefault: true,
            },
          });

          if (body.comentarioEvaluacion?.trim()) {
            await tx.opsComentarioGuardia.create({
              data: {
                tenantId: ctx.tenantId,
                guardiaId: guardia.id,
                comment: `[Evaluación TE] ${body.comentarioEvaluacion.trim()}`,
                createdBy: ctx.userId,
              },
            });
          }

          await tx.opsGuardiaHistory.create({
            data: {
              tenantId: ctx.tenantId,
              guardiaId: guardia.id,
              eventType: "created",
              newValue: {
                lifecycleStatus: "te",
                os10: body.os10,
                estadoUniforme: body.estadoUniforme,
                teRegistradoPor: ctx.userId,
              },
              createdBy: ctx.userId,
            },
          });

          return tx.opsGuardia.findUnique({
            where: { id: guardia.id },
            include: {
              persona: true,
              bankAccounts: true,
            },
          });
        });
        break;
      } catch (error) {
        const duplicateCodeError =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!duplicateCodeError || attempt === 3) throw error;
      }
    }

    await createOpsAuditLog(ctx, "personas.guardia.te_created", "ops_guardia", result?.id, {
      rut: normalizedRut,
      code: result?.code ?? null,
      lifecycleStatus: "te",
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[PERSONAS] Error creating guardia TE:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el guardia Turno Extra" },
      { status: 500 }
    );
  }
}
