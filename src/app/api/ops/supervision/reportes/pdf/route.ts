import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVisitReportAuth } from "@/lib/ops/client-report/auth";
import {
  buildAndSendVisitReport,
  collectVisitReport,
  periodFromPreset,
} from "@/lib/ops/client-report";

const Body = z.object({
  accountId: z.string().min(1),
  installationIds: z.array(z.string()).min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  preset: z.enum(["last_week", "this_week", "last_month", "custom"]).optional(),
});

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const gate = await requireVisitReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx } = gate.auth;

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Cuerpo inválido" },
      { status: 400 }
    );
  }

  const account = await prisma.crmAccount.findFirst({
    where: { id: parsed.data.accountId, tenantId: ctx.tenantId },
    select: {
      id: true,
      installations: { where: { status: "active" }, select: { id: true } },
    },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Cliente no encontrado" },
      { status: 404 }
    );
  }
  const allowed = new Set(account.installations.map((i) => i.id));
  const ids = parsed.data.installationIds.filter((id) => allowed.has(id));
  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "Instalaciones inválidas" },
      { status: 400 }
    );
  }

  const period = periodFromPreset({
    preset: parsed.data.preset,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  const data = await collectVisitReport({
    tenantId: ctx.tenantId,
    accountId: account.id,
    installationIds: ids,
    period,
  });

  const stored = await buildAndSendVisitReport({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    accountId: account.id,
    installationIds: ids,
    periodKey: period.key,
    data,
    to: [],
  });

  const filename = `informe-visitas-${period.key.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(stored.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
