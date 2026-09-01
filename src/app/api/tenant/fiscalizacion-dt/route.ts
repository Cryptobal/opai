import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  dtNoticeEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  dtDailyReportEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
});

export async function GET() {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tenantId },
    select: { dtNoticeEmail: true, dtDailyReportEmail: true },
  });
  return NextResponse.json({ success: true, data: tenant });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  if (!["owner", "admin"].includes(auth.userRole)) {
    return NextResponse.json({ success: false, error: "Solo owner o admin" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Email inválido" }, { status: 400 });
  }

  const data: { dtNoticeEmail?: string | null; dtDailyReportEmail?: string | null } = {};
  if ("dtNoticeEmail" in parsed.data) {
    data.dtNoticeEmail = parsed.data.dtNoticeEmail ? parsed.data.dtNoticeEmail : null;
  }
  if ("dtDailyReportEmail" in parsed.data) {
    data.dtDailyReportEmail = parsed.data.dtDailyReportEmail ? parsed.data.dtDailyReportEmail : null;
  }

  const tenant = await prisma.tenant.update({
    where: { id: auth.tenantId },
    data,
    select: { dtNoticeEmail: true, dtDailyReportEmail: true },
  });

  await logAudit({
    userId: auth.userId,
    userEmail: auth.userEmail,
    action: "UPDATE",
    entity: "Tenant",
    entityId: auth.tenantId,
    details: { type: "DT_FISCALIZACION_EMAILS", ...data },
    tenantId: auth.tenantId,
    request,
  });

  return NextResponse.json({ success: true, data: tenant });
}
