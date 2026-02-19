/**
 * API Route: /api/docs/documents/[id]/signature-request
 * GET  - Obtener solicitudes de firma del documento
 * POST - Crear solicitud de firma para el documento
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createSignatureRequestSchema } from "@/lib/validations/docs";
import { hasRoleOrHigher, type Role } from "@/lib/rbac";
import { sendSignatureRequestEmail } from "@/lib/docs-signature-email";

function forbidden() {
  return NextResponse.json({ success: false, error: "No autorizado para esta acción" }, { status: 403 });
}

function requireAdminRole(role: string) {
  return hasRoleOrHigher(role as Role, "admin");
}

function buildSignatureSummary(recipients: Array<{ name: string; email: string; rut: string | null }>, requestId: string) {
  return {
    requestId,
    totalSigners: recipients.filter((r) => r.email).length,
    signedCount: 0,
    signers: recipients.map((r) => ({
      name: r.name,
      email: r.email,
      rut: r.rut,
      signedAt: null,
      method: null,
    })),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    if (!requireAdminRole(ctx.userRole)) return forbidden();

    const { id } = await params;
    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const requests = await prisma.docSignatureRequest.findMany({
      where: { documentId: id, tenantId: ctx.tenantId },
      include: {
        recipients: {
          orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const active = requests.find((r) => ["pending", "in_progress"].includes(r.status)) ?? null;

    return NextResponse.json({
      success: true,
      data: {
        active,
        requests,
      },
    });
  } catch (error) {
    console.error("Error fetching signature request:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener solicitud de firma" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    if (!requireAdminRole(ctx.userRole)) return forbidden();

    const { id } = await params;
    const parsed = await parseBody(request, createSignatureRequestSchema);
    if (parsed.error) return parsed.error;

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, title: true, signatureStatus: true },
    });

    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const activeRequest = await prisma.docSignatureRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        documentId: id,
        status: { in: ["pending", "in_progress"] },
      },
      select: { id: true, status: true },
    });

    if (activeRequest) {
      return NextResponse.json(
        { success: false, error: "Ya existe una solicitud de firma activa para este documento" },
        { status: 409 }
      );
    }

    const payload = parsed.data;
    const signerCount = payload.recipients.filter((r) => r.role === "signer").length;
    if (signerCount === 0) {
      return NextResponse.json(
        { success: false, error: "Debe incluir al menos un firmante con rol signer" },
        { status: 400 }
      );
    }

    const uniqueRecipients = new Set<string>();

    for (const recipient of payload.recipients) {
      const dedupeKey = `${recipient.email.toLowerCase()}::${recipient.signingOrder}`;
      if (uniqueRecipients.has(dedupeKey)) {
        return NextResponse.json(
          { success: false, error: `Firmante duplicado en mismo orden: ${recipient.email}` },
          { status: 400 }
        );
      }
      uniqueRecipients.add(dedupeKey);
    }

    const created = await prisma.$transaction(async (tx) => {
      const signatureRequest = await tx.docSignatureRequest.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: id,
          status: "pending",
          message: payload.message ?? null,
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
          createdBy: ctx.userId,
        },
      });

      const recipientsData = payload.recipients.map((r) => ({
        requestId: signatureRequest.id,
        token: randomBytes(24).toString("hex"),
        name: r.name,
        email: r.email.toLowerCase(),
        rut: r.rut ?? null,
        role: r.role,
        signingOrder: r.signingOrder,
        status: "pending",
      }));

      await tx.docSignatureRecipient.createMany({ data: recipientsData });

      await tx.document.update({
        where: { id },
        data: {
          signatureStatus: "pending",
          signatureData: buildSignatureSummary(recipientsData, signatureRequest.id),
        },
      });

      await tx.docHistory.create({
        data: {
          documentId: id,
          action: "signature_request_created",
          details: {
            requestId: signatureRequest.id,
            recipients: recipientsData.map((r) => ({
              email: r.email,
              name: r.name,
              role: r.role,
              signingOrder: r.signingOrder,
            })),
            expiresAt: payload.expiresAt ?? null,
          },
          createdBy: ctx.userId,
        },
      });

      return tx.docSignatureRequest.findUnique({
        where: { id: signatureRequest.id },
        include: {
          recipients: {
            orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    });

    if (created) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://opai.gard.cl";
      const signerOrders = created.recipients
        .filter((r) => r.role === "signer")
        .map((r) => r.signingOrder);
      const activeOrder = Math.min(...signerOrders);
      const recipientsToSend = created.recipients.filter(
        (r) => r.role === "signer" && r.signingOrder === activeOrder
      );

      for (const recipient of recipientsToSend) {
        const signingUrl = `${siteUrl}/sign/${recipient.token}`;
        const result = await sendSignatureRequestEmail({
          to: recipient.email,
          recipientName: recipient.name,
          documentTitle: document.title,
          signingUrl,
          senderName: "OPAI",
          expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
          message: created.message,
        });

        await prisma.docSignatureRecipient.update({
          where: { id: recipient.id },
          data: {
            sentAt: new Date(),
            status: result.ok ? "sent" : recipient.status,
          },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating signature request:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear solicitud de firma" },
      { status: 500 }
    );
  }
}
