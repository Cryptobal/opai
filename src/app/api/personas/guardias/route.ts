import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createGuardiaSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess, ensureOpsCapability } from "@/lib/ops";
import { lifecycleToLegacyStatus, normalizeNullable } from "@/lib/personas";

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

function toNullableDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNullablePercent(value?: number | string | null): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Prisma.Decimal(parsed);
}

function toNullableDecimal(value?: number | string | null): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  return new Prisma.Decimal(value);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const status = request.nextUrl.searchParams.get("status") || undefined;
    const blacklisted = request.nextUrl.searchParams.get("blacklisted");
    const search = request.nextUrl.searchParams.get("search")?.trim() || undefined;

    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status } : {}),
        ...(blacklisted === "true" ? { isBlacklisted: true } : {}),
        ...(blacklisted === "false" ? { isBlacklisted: false } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { persona: { firstName: { contains: search, mode: "insensitive" } } },
                { persona: { lastName: { contains: search, mode: "insensitive" } } },
                { persona: { rut: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        persona: true,
        bankAccounts: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
        _count: {
          select: {
            flags: true,
            comments: true,
            turnosExtra: true,
          },
        },
      },
      orderBy: [{ isBlacklisted: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: guardias });
  } catch (error) {
    console.error("[PERSONAS] Error listing guardias:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los guardias" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createGuardiaSchema);
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
              email: normalizeNullable(body.email),
              phone: normalizeNullable(body.phone),
              phoneMobile: normalizeNullable(body.phoneMobile),
              addressFormatted: normalizeNullable(body.addressFormatted),
              googlePlaceId: normalizeNullable(body.googlePlaceId),
              addressLine1: normalizeNullable(body.addressLine1),
              commune: normalizeNullable(body.commune),
              city: normalizeNullable(body.city),
              region: normalizeNullable(body.region),
              sex: normalizeNullable(body.sex),
              lat: toNullableDecimal(body.lat),
              lng: toNullableDecimal(body.lng),
              birthDate: toNullableDate(body.birthDate),
              afp: normalizeNullable(body.afp),
              healthSystem: normalizeNullable(body.healthSystem),
              isapreName: normalizeNullable(body.isapreName),
              isapreHasExtraPercent: body.isapreHasExtraPercent ?? false,
              isapreExtraPercent: toNullablePercent(body.isapreExtraPercent),
              hasMobilization: body.hasMobilization ?? false,
              addressSource: "google_places",
              status: "active",
            },
          });

          const lifecycleStatus = body.lifecycleStatus;
          const generatedCode = await generateUniqueGuardiaCode(tx, ctx.tenantId);
          const guardia = await tx.opsGuardia.create({
            data: {
              tenantId: ctx.tenantId,
              personaId: persona.id,
              code: generatedCode,
              lifecycleStatus,
              status: lifecycleToLegacyStatus(lifecycleStatus),
              availableExtraShifts: body.availableExtraShifts ?? false,
              hiredAt: lifecycleStatus === "contratado" ? new Date() : null,
            },
          });

          const holderName = body.holderName?.trim() || normalizedRut;
          if (body.bankCode && body.accountType && body.accountNumber && holderName) {
            await tx.opsCuentaBancaria.create({
              data: {
                tenantId: ctx.tenantId,
                guardiaId: guardia.id,
                bankCode: body.bankCode,
                bankName: body.bankName || body.bankCode,
                accountType: body.accountType,
                accountNumber: body.accountNumber,
                holderName,
                holderRut: normalizedRut,
                isDefault: true,
              },
            });
          }

          await tx.opsGuardiaHistory.create({
            data: {
              tenantId: ctx.tenantId,
              guardiaId: guardia.id,
              eventType: "created",
              newValue: {
                lifecycleStatus,
                isBlacklisted: false,
                code: guardia.code,
              },
              createdBy: ctx.userId,
            },
          });

          if (body.notes && body.notes.trim()) {
            await tx.opsComentarioGuardia.create({
              data: {
                tenantId: ctx.tenantId,
                guardiaId: guardia.id,
                comment: body.notes.trim(),
                createdBy: ctx.userId,
              },
            });
          }

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
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (!duplicateCodeError || attempt === 3) throw error;
      }
    }

    await createOpsAuditLog(ctx, "personas.guardia.created", "ops_guardia", result?.id, {
      rut: normalizedRut,
      code: result?.code ?? null,
      lifecycleStatus: body.lifecycleStatus,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[PERSONAS] Error creating guardia:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el guardia" },
      { status: 500 }
    );
  }
}
