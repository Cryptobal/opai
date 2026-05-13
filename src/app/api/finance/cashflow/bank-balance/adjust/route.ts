import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const adjustSchema = z.object({
  bankAccountId: z.string().uuid(),
  balance: z.number().finite(),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "banking_manage")) {
    return NextResponse.json(
      { success: false, error: "Forbidden — requiere banking_manage" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(req, adjustSchema);
  if (parsed.error) return parsed.error;
  const { bankAccountId, balance, note } = parsed.data;

  const account = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId: ctx.tenantId, isActive: true },
    select: { id: true, currency: true },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Cuenta bancaria no encontrada" },
      { status: 404 },
    );
  }
  if (account.currency !== "CLP") {
    return NextResponse.json(
      { success: false, error: "Sólo cuentas CLP son ajustables desde flujo de caja" },
      { status: 400 },
    );
  }

  const today = new Date();
  const asOfDate = new Date(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  const snapshot = await prisma.financeBankAccountBalance.create({
    data: {
      tenantId: ctx.tenantId,
      bankAccountId,
      asOfDate,
      balance,
      source: "MANUAL",
      note: note ?? null,
      createdById: ctx.userId,
    },
  });

  await prisma.financeBankAccount.update({
    where: { id: bankAccountId },
    data: { currentBalance: balance, balanceUpdatedAt: today },
  });

  // Invalida el data cache del server component que sirve la projection,
  // para que el siguiente render del cliente (router.refresh) reciba el
  // saldo recién guardado y no la versión cacheada.
  revalidatePath("/finanzas/flujo-caja");
  revalidatePath("/finanzas");

  return NextResponse.json({
    success: true,
    data: { snapshotId: snapshot.id, balance, asOfDate },
  });
}
