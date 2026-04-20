/**
 * API Route: POST /api/docs/documents/[id]/send-review
 *
 * Sends a "review draft" email to the client (one or more recipients).
 * Reuses the existing `Document.contractClientToken` and the public
 * `/contrato/[token]` portal page — the client opens the same view they'd
 * see at signature time, but can submit suggestions via the existing
 * `contract-suggestions` API.
 *
 * Body: { recipients?: Array<{ name: string; email: string }>, message?: string }
 *   When `recipients` is omitted, defaults to the primary contact of the
 *   associated CRM account.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { hasRoleOrHigher, type Role } from "@/lib/rbac";
import { sendContractReviewRequestEmail } from "@/lib/docs-signature-email";

function forbidden() {
  return NextResponse.json(
    { success: false, error: "No autorizado para esta acción" },
    { status: 403 }
  );
}

function buildToken() {
  return randomBytes(24).toString("base64url");
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    if (!hasRoleOrHigher(ctx.userRole as Role, "admin")) return forbidden();

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      recipients?: Array<{ name?: string; email?: string }>;
      message?: string | null;
    };

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        title: true,
        contractClientToken: true,
        status: true,
      },
    });
    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    // Ensure a token exists — older docs may have been created before the
    // contractClientToken column was wired up.
    let token = document.contractClientToken;
    if (!token) {
      token = buildToken();
      await prisma.document.update({
        where: { id },
        data: { contractClientToken: token },
      });
    }

    // Resolve recipients. When the caller omits them, fall back to the
    // primary contact of the associated CRM account so the most common
    // case (one click → email goes out) just works.
    let recipients = (body.recipients ?? [])
      .map((r) => ({
        name: (r.name ?? "").trim(),
        email: (r.email ?? "").trim(),
      }))
      .filter((r) => r.email);

    if (recipients.length === 0) {
      const accountAssoc = await prisma.docAssociation.findFirst({
        where: { documentId: id, entityType: "crm_account" },
        select: { entityId: true },
      });
      if (accountAssoc?.entityId) {
        const contact = await prisma.crmContact.findFirst({
          where: {
            accountId: accountAssoc.entityId,
            tenantId: ctx.tenantId,
            email: { not: null },
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: { firstName: true, lastName: true, email: true },
        });
        if (contact?.email) {
          recipients = [
            {
              name: [contact.firstName, contact.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "Estimado(a)",
              email: contact.email,
            },
          ];
        }
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No hay destinatario para enviar la revisión. Agrega un contacto con email a la cuenta o pásalo en `recipients`.",
        },
        { status: 400 }
      );
    }

    // Sender identity for the email signature.
    const sender = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true, email: true },
    });
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    });

    const siteUrl = getSiteUrl();
    const reviewUrl = `${siteUrl}/contrato/${token}`;

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const recipient of recipients) {
      const send = await sendContractReviewRequestEmail({
        to: recipient.email,
        recipientName: recipient.name || "Estimado(a)",
        documentTitle: document.title,
        reviewUrl,
        senderName: sender?.name ?? sender?.email ?? "Equipo OPAI",
        senderCompany: tenant?.name ?? undefined,
        message: body.message?.trim() || null,
      });
      results.push({
        email: recipient.email,
        ok: send.ok,
        error: send.ok ? undefined : send.error,
      });
    }

    // Move the document to a "in review" status so the timeline / UI can
    // reflect that there's an open review cycle. We store `in_review` in
    // the existing `status` field — keeps the schema unchanged.
    if (document.status === "draft") {
      await prisma.document.update({
        where: { id },
        data: { status: "in_review" },
      });
    }

    await prisma.docHistory.create({
      data: {
        documentId: id,
        action: "review_requested",
        details: {
          recipients: recipients.map((r) => r.email),
          message: body.message ?? null,
          results,
        },
        createdBy: ctx.userId,
      },
    });

    const allOk = results.every((r) => r.ok);
    return NextResponse.json({
      success: allOk,
      data: {
        token,
        reviewUrl,
        results,
      },
      ...(allOk ? {} : { error: "Algunos correos no se pudieron enviar." }),
    });
  } catch (error) {
    console.error("[send-review]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `No se pudo enviar la revisión: ${error.message}`
            : "No se pudo enviar la revisión",
      },
      { status: 500 }
    );
  }
}
