/**
 * API Route: /api/crm/email-dead-letters/[id]/retry
 * POST - Reintenta enviar un email fallido. Si el envío tiene éxito,
 *        marca el dead-letter como resuelto. Si falla, incrementa retryCount
 *        y deja la entrada para próxima vez.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

type SendArgs = Parameters<typeof resend.emails.send>[0];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const entry = await prisma.emailDeadLetter.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!entry) {
      return NextResponse.json(
        { success: false, error: "Dead letter no encontrado" },
        { status: 404 }
      );
    }
    if (entry.resolved) {
      return NextResponse.json(
        { success: false, error: "Esta entrada ya fue resuelta" },
        { status: 400 }
      );
    }

    try {
      const args = entry.payload as unknown as SendArgs;
      const { data, error } = await resend.emails.send(args);
      if (error) throw error;

      const updated = await prisma.emailDeadLetter.update({
        where: { id },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          retryCount: { increment: 1 },
        },
      });
      return NextResponse.json({
        success: true,
        data: { ...updated, messageId: data?.id },
      });
    } catch (sendErr) {
      const errorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      await prisma.emailDeadLetter.update({
        where: { id },
        data: {
          retryCount: { increment: 1 },
          errorMessage,
        },
      });
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Error retrying email dead letter:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retry dead letter" },
      { status: 500 }
    );
  }
}
