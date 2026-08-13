/**
 * API Route: /api/cpq/bundles/[id]/send-presentation
 * POST - Envía propuesta consolidada al portal (PIN por destinatario) + PDF opcional
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  sendBundleToPortal,
  SendBundleToPortalError,
} from "@/modules/cpq/send/send-bundle-to-portal";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id: bundleId } = await params;
    const body = await request.json().catch(() => ({}));
    const followUpDecision = body?.followUp as
      | { include: boolean; targetStageId: string | null; skipAll?: boolean }
      | undefined;
    const ccEmails: string[] = Array.isArray(body?.ccEmails)
      ? body.ccEmails.filter(Boolean)
      : [];
    const bccEmails: string[] = Array.isArray(body?.bccEmails)
      ? body.bccEmails.filter(Boolean)
      : [];
    const recipientContactId =
      typeof body?.recipientContactId === "string" && body.recipientContactId.length > 0
        ? body.recipientContactId
        : undefined;
    const recipientContactIds: string[] = Array.isArray(body?.recipientContactIds)
      ? body.recipientContactIds.filter(
          (x: unknown) => typeof x === "string" && x.length > 0,
        )
      : [];
    const ccContactIds: string[] = Array.isArray(body?.ccContactIds)
      ? body.ccContactIds.filter((x: unknown) => typeof x === "string")
      : [];
    const emailSubject =
      typeof body?.emailSubject === "string" ? body.emailSubject : undefined;

    const result = await sendBundleToPortal({
      bundleId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      followUp: followUpDecision,
      ccEmails,
      bccEmails,
      recipientContactId,
      recipientContactIds: recipientContactIds.length > 0 ? recipientContactIds : undefined,
      ccContactIds,
      includeProposalPdf: Boolean(body?.includeProposalPdf),
      includeQuotationPdf: Boolean(body?.includeQuotationPdf),
      emailSubject,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[cpq/bundles/send-presentation]", error);
    const msg = error instanceof Error ? error.message : String(error);
    const status = error instanceof SendBundleToPortalError ? 400 : 500;
    if (msg === "BUNDLE_EMPTY") {
      return NextResponse.json(
        { success: false, error: "No hay cotizaciones incluidas" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: msg.startsWith("Error") ? msg : `Error al enviar propuesta: ${msg}` },
      { status },
    );
  }
}
