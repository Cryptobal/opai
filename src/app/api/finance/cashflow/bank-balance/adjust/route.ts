import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { todayInChile, utcDateFromYmd } from "@/lib/dates-cl";
import { prisma } from "@/lib/prisma";
import { syncCurrentBalanceFromMovements } from "@/modules/finance/banking/bank-balance.service";

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

  const now = new Date();
  // Snapshot "as of" en calendario Chile (no UTC) — crítico mid-week.
  const asOfDate = utcDateFromYmd(todayInChile(now));

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

  const resolved = await syncCurrentBalanceFromMovements(
    ctx.tenantId,
    bankAccountId,
    now,
  );

  // Invalida caches de FC (legacy + planilla v3).
  revalidatePath("/finanzas/flujo-caja");
  revalidatePath("/finanzas/flujo-caja/planilla");
  revalidatePath("/finanzas");

  return NextResponse.json({
    success: true,
    data: {
      snapshotId: snapshot.id,
      balance: resolved.resolvedBalanceClp,
      asOfDate: todayInChile(now),
    },
  });
}
