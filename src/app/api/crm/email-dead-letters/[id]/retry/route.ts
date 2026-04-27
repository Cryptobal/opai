/**
 * API Route: /api/crm/email-dead-letters/[id]/retry
 * POST - Reintenta envío del email persistido. Si éxito, marca resolved=true.
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
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;

    const item = await prisma.emailDeadLetter.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Dead letter not found" },
        { status: 404 }
      );
    }
    if (item.resolved) {
      return NextResponse.json(
        { success: false, error: "Already resolved" },
        { status: 400 }
      );
    }

    try {
      const args = item.payload as unknown as SendArgs;
      const { data, error } = await resend.emails.send(args);
      if (error) throw error;
      await prisma.emailDeadLetter.update({
        where: { id },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          retryCount: { increment: 1 },
        },
      });
      return NextResponse.json({ success: true, messageId: data?.id });
    } catch (err) {
      await prisma.emailDeadLetter.update({
        where: { id },
        data: {
          retryCount: { increment: 1 },
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Retry failed",
        },
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
