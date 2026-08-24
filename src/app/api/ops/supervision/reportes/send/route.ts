import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireClientReportAuth } from "@/lib/ops/client-report/auth";
import {
  buildAndSendVisitReport,
  collectVisitReport,
  currentOpenWeek,
  parseYmdRange,
  previousClosedMonth,
  previousClosedWeek,
} from "@/lib/ops/client-report";

const Body = z.object({
  accountId: z.string().min(1),
  installationIds: z.array(z.string()).min(1),
  emails: z.array(z.string().email()).min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  preset: z.enum(["last_week", "this_week", "last_month", "custom"]).optional(),
});

function periodOf(body: z.infer<typeof Body>) {
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
      name: true,
      contacts: {
        where: { email: { not: null } },
        select: { email: true, firstName: true, lastName: true, recibeOperacional: true },
      },
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

  const period = periodOf(parsed.data);
  const data = await collectVisitReport({
    tenantId: ctx.tenantId,
    accountId: account.id,
    installationIds: ids,
    period,
  });

  const sent = await buildAndSendVisitReport({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    accountId: account.id,
    installationIds: ids,
    periodKey: period.key,
    data,
    to: parsed.data.emails,
  });

  if (!sent.ok) {
    return NextResponse.json(
      { success: false, error: sent.error ?? "No se pudo enviar" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, sentTo: parsed.data.emails });
}

export async function GET(request: NextRequest) {
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx } = gate.auth;
  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { success: false, error: "accountId requerido" },
      { status: 400 }
    );
  }
  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId: ctx.tenantId,
      accountId,
      email: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      roleTitle: true,
      isPrimary: true,
      recibeOperacional: true,
    },
    orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
  });
  return NextResponse.json({
    success: true,
    data: contacts.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email!,
      roleTitle: c.roleTitle,
      isPrimary: c.isPrimary,
      recibeOperacional: c.recibeOperacional,
    })),
  });
}
