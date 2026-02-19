import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, createOpsAuditLog } from "@/lib/ops";
import { createRefuerzoSchema, listRefuerzoQuerySchema } from "@/lib/validations/ops";
import { createRefuerzoSolicitud, resolveRefuerzoStatus } from "@/lib/ops-refuerzos";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const date: { gte?: Date; lte?: Date } = {};
  if (from) date.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) date.lte = new Date(`${to}T23:59:59.999Z`);
  return date;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const paramsObject = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsedQuery = listRefuerzoQuerySchema.safeParse(paramsObject);
    if (!parsedQuery.success) {
      return NextResponse.json(
        { success: false, error: parsedQuery.error.issues.map((i) => i.message).join("; ") },
        { status: 400 }
      );
    }
    const query = parsedQuery.data;

    const rows = await prisma.opsRefuerzoSolicitud.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(query.installationId ? { installationId: query.installationId } : {}),
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(query.guardiaId ? { guardiaId: query.guardiaId } : {}),
        ...(query.from || query.to ? { startAt: normalizeDateRange(query.from, query.to) } : {}),
      },
      include: {
        installation: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        puesto: { select: { id: true, name: true } },
        guardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        turnoExtra: { select: { id: true, status: true, amountClp: true, paidAt: true } },
      },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    const now = new Date();
    const normalized = rows.map((row) => {
      const effectiveStatus = resolveRefuerzoStatus(row.status, row.endAt, now);
      return {
        ...row,
        status: effectiveStatus,
        rateClp: row.rateClp == null ? null : toNumber(row.rateClp),
        estimatedTotalClp: toNumber(row.estimatedTotalClp),
        guardPaymentClp: toNumber(row.guardPaymentClp),
        turnoExtra: row.turnoExtra
          ? { ...row.turnoExtra, amountClp: toNumber(row.turnoExtra.amountClp) }
          : null,
      };
    });

    const filtered = normalized.filter((row) => {
      if (query.status && row.status !== query.status) return false;
      if (query.pendingBilling && row.status === "facturado") return false;
      if (query.q) {
        const text = `${row.installation?.name ?? ""} ${row.account?.name ?? ""} ${row.guardia.persona.firstName} ${row.guardia.persona.lastName} ${row.requestedByName ?? ""}`.toLowerCase();
        if (!text.includes(query.q.toLowerCase())) return false;
      }
      return true;
    });

    return NextResponse.json({ success: true, data: filtered });
  } catch (error) {
    console.error("[OPS] Error listing refuerzos:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los turnos de refuerzo" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createRefuerzoSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const created = await createRefuerzoSolicitud(ctx, body);

    await createOpsAuditLog(ctx, "ops.refuerzo.post_api", "ops_refuerzo_solicitud", created.id);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating refuerzo:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "No se pudo crear la solicitud",
      },
      { status: 400 }
    );
  }
}
