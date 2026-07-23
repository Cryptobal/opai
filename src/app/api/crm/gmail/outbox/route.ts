/**
 * GET /api/crm/gmail/outbox — items del outbox del usuario (PR-12).
 * `?status=scheduled` → solo programados pendientes (vista "Programados");
 * default → pendientes + fallidos recientes (visibilidad de errores, no silencio).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import type { EmailOutboxPayload } from "@/modules/crm/email/email-outbox";

export async function GET(req: NextRequest) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const statusParam = req.nextUrl.searchParams.get("status");
  const where =
    statusParam === "scheduled"
      ? { status: "held" }
      : {
          OR: [
            { status: { in: ["queued", "held", "sending"] } },
            {
              status: "failed",
              updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
            },
          ],
        };

  const rows = await prisma.crmEmailOutbox.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, ...where },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({
    items: rows.map((row) => {
      const payload = row.payload as EmailOutboxPayload;
      return {
        id: row.id,
        status: row.status,
        to: payload.to,
        cc: payload.cc,
        subject: payload.subject,
        threadId: payload.threadId,
        attachmentCount: payload.attachments?.length ?? 0,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        undoUntil: row.undoUntil?.toISOString() ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  });
}
