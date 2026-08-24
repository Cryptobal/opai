import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireClientReportAuth } from "@/lib/ops/client-report/auth";
import {
  collectVisitReport,
  currentOpenWeek,
  parseYmdRange,
  previousClosedMonth,
  previousClosedWeek,
} from "@/lib/ops/client-report";

const Query = z.object({
  accountId: z.string().min(1),
  installationIds: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  preset: z.enum(["last_week", "this_week", "last_month", "custom"]).optional(),
});

export async function GET(request: NextRequest) {
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx } = gate.auth;

  const parsed = Query.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  const account = await prisma.crmAccount.findFirst({
    where: { id: parsed.data.accountId, tenantId: ctx.tenantId },
    select: {
      id: true,
      installations: {
        where: { status: "active" },
        select: { id: true },
      },
    },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Cliente no encontrado" },
      { status: 404 }
    );
  }

  const allowed = new Set(account.installations.map((i) => i.id));
  let ids = parsed.data.installationIds
    ? parsed.data.installationIds.split(",").map((s) => s.trim()).filter(Boolean)
    : [...allowed];
  ids = ids.filter((id) => allowed.has(id));
  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "Selecciona al menos una instalación" },
      { status: 400 }
    );
  }

  const preset = parsed.data.preset ?? "last_week";
  let period =
    preset === "last_month"
      ? previousClosedMonth()
      : preset === "this_week"
        ? currentOpenWeek()
        : previousClosedWeek();
  if (preset === "custom" && parsed.data.from && parsed.data.to) {
    period = parseYmdRange(parsed.data.from, parsed.data.to);
  }

  const data = await collectVisitReport({
    tenantId: ctx.tenantId,
    accountId: account.id,
    installationIds: ids,
    period,
  });

  return NextResponse.json({
    success: true,
    data,
    period: { key: period.key, label: period.label },
  });
}
