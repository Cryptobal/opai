/**
 * POST /api/portal/supervisor/ingreso-te
 * Ingreso rápido de guardia Turno Extra (TE) desde el portal supervisor.
 * Replica la funcionalidad de /api/personas/guardias/te con auth de supervisor.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";
import { createGuardiaTeSchema } from "@/lib/validations/ops";
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data)
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { adminId, tenantId } = result.data;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 });
  }

  const parsed = createGuardiaTeSchema.safeParse(rawBody);
  if (!parsed.success) {
    const err = parsed.error as { issues?: Array<{ message?: string }> };
    const firstMessage = err.issues?.[0]?.message ?? "Datos inválidos";
    return NextResponse.json(
      { success: false, error: firstMessage },
      { status: 400 }
    );
  }
  const body = parsed.data;

  try {
    const normalizedRut = normalizeNullable(body.rut);
    const existingByRut = normalizedRut
      ? await prisma.opsPersona.findFirst({
          where: { tenantId, rut: normalizedRut },
          select: { id: true },
        })
      : null;
    if (existingByRut) {
      return NextResponse.json(
        { success: false, error: "RUT ya ingresado. Comunicarse con recursos humanos." },
        { status: 400 }
      );
    }

    const holderName = (body.holderName?.trim() || normalizedRut) ?? "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let guardiaResult: { id: string; code: string | null } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        guardiaResult = await prisma.$transaction(async (tx) => {
          const persona = await tx.opsPersona.create({
            data: {
              tenantId,
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

          const generatedCode = await generateUniqueGuardiaCode(tx, tenantId);
          const guardia = await tx.opsGuardia.create({
            data: {
              tenantId,
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
              notaEvaluacion: body.notaEvaluacion ?? null,
              comentarioEvaluacion: body.comentarioEvaluacion ?? null,
              teRegistradoPor: adminId,
            },
          });

          await tx.opsCuentaBancaria.create({
            data: {
              tenantId,
              guardiaId: guardia.id,
              bankCode: body.bankCode,
              bankName: body.bankName,
              accountType: body.accountType,
              accountNumber: body.accountNumber,
              holderName: (holderName || normalizedRut) ?? "N/D",
              holderRut: normalizedRut,
              isDefault: true,
            },
          });

          if (body.comentarioEvaluacion?.trim()) {
            await tx.opsComentarioGuardia.create({
              data: {
                tenantId,
                guardiaId: guardia.id,
                comment: `[Evaluación TE] ${body.comentarioEvaluacion.trim()}`,
                createdBy: adminId,
              },
            });
          }

          await tx.opsGuardiaHistory.create({
            data: {
              tenantId,
              guardiaId: guardia.id,
              eventType: "created",
              newValue: {
                lifecycleStatus: "te",
                os10: body.os10,
                estadoUniforme: body.estadoUniforme,
                teRegistradoPor: adminId,
                source: "portal_supervisor",
              },
              createdBy: adminId,
            },
          });

          return { id: guardia.id, code: guardia.code };
        });
        break;
      } catch (error) {
        const duplicateCodeError =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!duplicateCodeError || attempt === 3) throw error;
      }
    }

    return NextResponse.json(
      { success: true, data: guardiaResult },
      { status: 201 }
    );
  } catch (error) {
    console.error("[PORTAL-SUPERVISOR] Error creating guardia TE:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el guardia Turno Extra" },
      { status: 500 }
    );
  }
}
