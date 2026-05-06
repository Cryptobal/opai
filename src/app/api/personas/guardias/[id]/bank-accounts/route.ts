import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import {
  createGuardiaBankAccountSchema,
  updateGuardiaBankAccountSchema,
} from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { isValidChileanRut, normalizeNullable, normalizeRut } from "@/lib/personas";

type Params = { id: string };

async function ensureGuardia(tenantId: string, guardiaId: string) {
  return prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId },
    select: { id: true, persona: { select: { rut: true } } },
  });
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

    const guardia = await ensureGuardia(ctx.tenantId, id);
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const accounts = await prisma.opsCuentaBancaria.findMany({
      where: { tenantId: ctx.tenantId, guardiaId: id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error("[PERSONAS] Error listing bank accounts:", error);
    return NextResponse.json({ success: false, error: "No se pudieron obtener las cuentas" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;

    const guardia = await ensureGuardia(ctx.tenantId, id);
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const parsed = await parseBody(request, createGuardiaBankAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const existingCount = await prisma.opsCuentaBancaria.count({
      where: { tenantId: ctx.tenantId, guardiaId: id },
    });
    if (existingCount > 0) {
      return NextResponse.json(
        { success: false, error: "Solo se permite una cuenta bancaria por trabajador. Edite la existente." },
        { status: 400 }
      );
    }

    let finalHolderRut: string | null;
    let finalHolderName: string;
    if (body.isThirdParty && body.holderRut) {
      const normalizedRut = normalizeRut(body.holderRut);
      if (!isValidChileanRut(normalizedRut)) {
        return NextResponse.json(
          { success: false, error: "RUT del tercero inválido" },
          { status: 400 },
        );
      }
      finalHolderRut = normalizedRut;
      finalHolderName = body.holderName;
    } else {
      finalHolderRut = normalizeNullable(guardia.persona?.rut);
      finalHolderName = body.holderName;
    }

    const created = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.opsCuentaBancaria.updateMany({
          where: { tenantId: ctx.tenantId, guardiaId: id, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.opsCuentaBancaria.create({
        data: {
          tenantId: ctx.tenantId,
          guardiaId: id,
          bankCode: body.bankCode,
          bankName: body.bankName,
          accountType: body.accountType,
          accountNumber: body.accountNumber,
          holderName: finalHolderName,
          holderRut: finalHolderRut,
          isDefault: body.isDefault,
        },
      });
    });

    const acctLast4 = created.accountNumber ? created.accountNumber.slice(-4) : null;
    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: id,
        eventType: body.isThirdParty
          ? "bank_account_thirdparty_set"
          : "bank_account_created",
        newValue: {
          bankCode: created.bankCode,
          bankName: created.bankName,
          accountType: created.accountType,
          isDefault: created.isDefault,
          isThirdParty: !!body.isThirdParty,
          holderName: created.holderName,
          holderRut: created.holderRut,
          accountNumberLast4: acctLast4,
        },
        createdBy: ctx.userId,
      },
    });

    await createOpsAuditLog(ctx, "personas.guardia.bank_account.created", "ops_guardia", id, {
      bankCode: body.bankCode,
      accountType: body.accountType,
      isDefault: body.isDefault,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[PERSONAS] Error creating bank account:", error);
    return NextResponse.json({ success: false, error: "No se pudo crear la cuenta bancaria" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ success: false, error: "accountId es requerido" }, { status: 400 });
    }

    const guardia = await ensureGuardia(ctx.tenantId, id);
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const existing = await prisma.opsCuentaBancaria.findFirst({
      where: { id: accountId, guardiaId: id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Cuenta bancaria no encontrada" }, { status: 404 });
    }

    const parsed = await parseBody(request, updateGuardiaBankAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    let resolvedHolderRut: string | null | undefined = undefined;
    if (body.isThirdParty === true) {
      if (!body.holderRut) {
        return NextResponse.json(
          { success: false, error: "RUT del tercero es requerido para cuenta de tercero" },
          { status: 400 },
        );
      }
      const normalizedRut = normalizeRut(body.holderRut);
      if (!isValidChileanRut(normalizedRut)) {
        return NextResponse.json(
          { success: false, error: "RUT del tercero inválido" },
          { status: 400 },
        );
      }
      resolvedHolderRut = normalizedRut;
    } else if (body.isThirdParty === false) {
      // Volver a usar el RUT del guardia
      resolvedHolderRut = normalizeNullable(guardia.persona?.rut);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.opsCuentaBancaria.updateMany({
          where: { tenantId: ctx.tenantId, guardiaId: id, isDefault: true, NOT: { id: accountId } },
          data: { isDefault: false },
        });
      }

      return tx.opsCuentaBancaria.update({
        where: { id: accountId },
        data: {
          bankCode: body.bankCode ?? undefined,
          bankName: body.bankName ?? undefined,
          accountType: body.accountType ?? undefined,
          accountNumber: body.accountNumber ?? undefined,
          holderName: body.holderName ?? undefined,
          holderRut: resolvedHolderRut,
          isDefault: body.isDefault ?? undefined,
        },
      });
    });

    const rutChanged = existing.holderRut !== updated.holderRut;
    const acctLast4 = updated.accountNumber ? updated.accountNumber.slice(-4) : null;
    const eventType = rutChanged
      ? "bank_account_thirdparty_changed"
      : "bank_account_updated";

    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: id,
        eventType,
        previousValue: {
          bankCode: existing.bankCode,
          accountType: existing.accountType,
          isDefault: existing.isDefault,
          holderName: existing.holderName,
          holderRut: existing.holderRut,
        },
        newValue: {
          bankCode: updated.bankCode,
          bankName: updated.bankName,
          accountType: updated.accountType,
          isDefault: updated.isDefault,
          isThirdParty: !!body.isThirdParty,
          holderName: updated.holderName,
          holderRut: updated.holderRut,
          accountNumberLast4: acctLast4,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PERSONAS] Error updating bank account:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar la cuenta bancaria" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ success: false, error: "accountId es requerido" }, { status: 400 });
    }

    const existing = await prisma.opsCuentaBancaria.findFirst({
      where: { id: accountId, guardiaId: id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Cuenta bancaria no encontrada" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.opsCuentaBancaria.delete({ where: { id: accountId } });

      if (existing.isDefault) {
        const fallback = await tx.opsCuentaBancaria.findFirst({
          where: { tenantId: ctx.tenantId, guardiaId: id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (fallback) {
          await tx.opsCuentaBancaria.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }

      await tx.opsGuardiaHistory.create({
        data: {
          tenantId: ctx.tenantId,
          guardiaId: id,
          eventType: "bank_account_deleted",
          previousValue: {
            bankCode: existing.bankCode,
            accountType: existing.accountType,
          },
          createdBy: ctx.userId,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PERSONAS] Error deleting bank account:", error);
    return NextResponse.json({ success: false, error: "No se pudo eliminar la cuenta bancaria" }, { status: 500 });
  }
}
