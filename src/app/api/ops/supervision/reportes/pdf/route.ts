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
  renderVisitReportPdf,
} from "@/lib/ops/client-report";

const Body = z.object({
  accountId: z.string().min(1),
  installationIds: z.array(z.string()).min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  preset: z.enum(["last_week", "this_week", "last_month", "custom"]).optional(),
});

function resolvePeriod(body: z.infer<typeof Body>) {
  const preset = body.preset ?? "last_week";
  if (preset === "last_month") return previousClosedMonth();
  if (preset === "custom" && body.from && body.to) {
    return parseYmdRange(body.from, body.to);
  }
  if (preset === "this_week") return currentOpenWeek();
  return previousClosedWeek();
}

export async function POST(request: NextRequest) {
  const gate = await requireClientReportAuth();
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

  const period = resolvePeriod(parsed.data);
  const data = await collectVisitReport({
    tenantId: ctx.tenantId,
    accountId: account.id,
    installationIds: ids,
    period,
  });
  const pdf = await renderVisitReportPdf(data);
  const filename = `informe-visitas-${period.key.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
