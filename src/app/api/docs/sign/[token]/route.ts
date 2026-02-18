/**
 * API Route: /api/docs/sign/[token]
 * GET  - Obtener documento y estado para firma pública
 * POST - Registrar firma de firmante público
 */

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signDocumentSchema } from "@/lib/validations/docs";
import {
  sendSignatureAllCompletedEmail,
  sendSignatureCompletedNotifyEmail,
  sendSignatureRequestEmail,
} from "@/lib/docs-signature-email";

function canSignNow(currentOrder: number, recipients: Array<{ role: string; signingOrder: number; status: string }>) {
  const previousSigners = recipients.filter(
    (r) => r.role === "signer" && r.signingOrder < currentOrder
  );
  return previousSigners.every((r) => r.status === "signed");
}

/** Formatea fecha para mostrar en documento (ej. 10 feb 2026) */
function formatSignDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

type SignerForResolve = {
  id: string;
  name: string;
  signingOrder: number;
  status: string;
  signedAt: Date | null;
};

/**
 * Recorre el JSON del documento (TipTap) y reemplaza nodos contractToken
 * de firma por texto resuelto:
 * - signature.sentDate / signature.signedDate: fechas
 * - signature.signer_N: "[Tu firma aquí]" para el firmante actual, "[Firmado por X el dd]" si ya firmó, "[Pendiente]" si no.
 */
function resolveSignatureTokensInContent(
  content: unknown,
  ctx: {
    sentAt: Date | null;
    signedAt: Date | null;
    currentRecipientId: string;
    signers: SignerForResolve[];
  }
): unknown {
  if (!content || typeof content !== "object") return content;
  const node = content as { type?: string; attrs?: { tokenKey?: string }; content?: unknown[] };
  if (Array.isArray(content)) {
    return (content as unknown[]).map((child) => resolveSignatureTokensInContent(child, ctx));
  }
  if (node.type === "contractToken" && node.attrs?.tokenKey) {
    const key = node.attrs.tokenKey as string;
    if (key === "signature.sentDate")
      return { type: "text", text: formatSignDate(ctx.sentAt) };
    if (key === "signature.signedDate")
      return { type: "text", text: formatSignDate(ctx.signedAt) };
    // Compat: "Espacio para firma" (antiguo) = mismo criterio que firmante 1
    const effectiveKey = key === "signature.placeholder" ? "signature.signer_1" : key;
    const signerMatch = /^signature\.signer_(\d+)$/.exec(effectiveKey);
    if (signerMatch) {
      const order = parseInt(signerMatch[1], 10);
      const signer = ctx.signers.find((s) => s.signingOrder === order);
      if (!signer) return { type: "text", text: "[—]" };
      if (signer.id === ctx.currentRecipientId)
        return { type: "text", text: "[Tu firma aquí]" };
      if (signer.status === "signed")
        return {
          type: "text",
          text: `[Firmado por ${signer.name} el ${formatSignDate(signer.signedAt)}]`,
        };
      return { type: "text", text: "[Pendiente]" };
    }
  }
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map((child) => resolveSignatureTokensInContent(child, ctx)),
    };
  }
  return content;
}

function buildSummary(
  requestId: string,
  recipients: Array<{
    name: string;
    email: string;
    rut: string | null;
    status: string;
    signedAt: Date | null;
    signatureMethod: string | null;
  }>
) {
  const signers = recipients.filter((r) => r.status && r.email);
  const signedCount = recipients.filter((r) => r.status === "signed").length;
  return {
    requestId,
    totalSigners: signers.length,
    signedCount,
    completedAt: signedCount === signers.length && signers.length > 0 ? new Date().toISOString() : null,
    signers: recipients.map((r) => ({
      name: r.name,
      email: r.email,
      rut: r.rut,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      method: r.signatureMethod,
      status: r.status,
    })),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const recipient = await prisma.docSignatureRecipient.findUnique({
      where: { token },
      include: {
        request: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                content: true,
                status: true,
                signatureStatus: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            recipients: {
              orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });

    if (!recipient) {
      return NextResponse.json({ success: false, error: "Token inválido o expirado" }, { status: 404 });
    }

    if (recipient.request.status === "cancelled" || recipient.request.status === "expired") {
      return NextResponse.json({ success: false, error: "La solicitud ya no está activa" }, { status: 410 });
    }

    if (recipient.request.expiresAt && recipient.request.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "La solicitud de firma expiró" }, { status: 410 });
    }

    const canSign = recipient.role === "cc"
      ? false
      : canSignNow(recipient.signingOrder, recipient.request.recipients);

    if ((recipient.status === "pending" || recipient.status === "sent") && !recipient.viewedAt) {
      await prisma.docSignatureRecipient.update({
        where: { id: recipient.id },
        data: {
          viewedAt: new Date(),
          status: "viewed",
        },
      });
    }

    const sentAt = recipient.sentAt ?? recipient.request.createdAt;
    const signedAt = recipient.signedAt ?? null;
    const doc = recipient.request.document;
    const signers: SignerForResolve[] = recipient.request.recipients
      .filter((r) => r.role === "signer")
      .map((r) => ({
        id: r.id,
        name: r.name,
        signingOrder: r.signingOrder,
        status: r.status,
        signedAt: r.signedAt,
      }));
    const resolvedContent =
      doc?.content && typeof doc.content === "object"
        ? resolveSignatureTokensInContent(
            JSON.parse(JSON.stringify(doc.content)),
            {
              sentAt,
              signedAt,
              currentRecipientId: recipient.id,
              signers,
            }
          )
        : doc?.content;

    const documentForSign = doc
      ? { ...doc, content: resolvedContent ?? doc.content }
      : doc;

    return NextResponse.json({
      success: true,
      data: {
        recipient: {
          id: recipient.id,
          name: recipient.name,
          email: recipient.email,
          role: recipient.role,
          status: recipient.status,
          signingOrder: recipient.signingOrder,
          signedAt: recipient.signedAt,
        },
        request: {
          id: recipient.request.id,
          status: recipient.request.status,
          message: recipient.request.message,
          expiresAt: recipient.request.expiresAt,
          canSign,
          recipients: recipient.request.recipients.map((r) => ({
            name: r.name,
            email: r.email,
            role: r.role,
            status: r.status,
            signingOrder: r.signingOrder,
            signedAt: r.signedAt,
          })),
        },
        document: documentForSign,
      },
    });
  } catch (error) {
    console.error("Error fetching sign token:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documento para firma" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const raw = await request.json();
    const validation = signDocumentSchema.safeParse({ ...raw, token });
    if (!validation.success) {
      const issues = validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }

    const payload = validation.data;

    if (payload.method === "typed" && !payload.typedName) {
      return NextResponse.json(
        { success: false, error: "typedName es obligatorio para firma escrita" },
        { status: 400 }
      );
    }

    if ((payload.method === "drawn" || payload.method === "uploaded") && !payload.signatureImageUrl) {
      return NextResponse.json(
        { success: false, error: "signatureImageUrl es obligatorio para firma dibujada/subida" },
        { status: 400 }
      );
    }

    const recipient = await prisma.docSignatureRecipient.findUnique({
      where: { token },
      include: {
        request: {
          include: {
            document: true,
            recipients: {
              orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });

    if (!recipient) {
      return NextResponse.json({ success: false, error: "Token inválido o expirado" }, { status: 404 });
    }

    if (recipient.role !== "signer") {
      return NextResponse.json({ success: false, error: "Este destinatario no es firmante" }, { status: 403 });
    }

    if (recipient.request.expiresAt && recipient.request.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "La solicitud de firma expiró" }, { status: 410 });
    }

    if (["signed", "declined", "expired"].includes(recipient.status)) {
      return NextResponse.json(
        { success: false, error: `No se puede firmar un destinatario en estado ${recipient.status}` },
        { status: 409 }
      );
    }

    if (!canSignNow(recipient.signingOrder, recipient.request.recipients)) {
      return NextResponse.json(
        { success: false, error: "Aún no puedes firmar. Hay firmantes previos pendientes." },
        { status: 409 }
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    const userAgent = request.headers.get("user-agent");

    const now = new Date();
    const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://opai.gard.cl";

    const result = await prisma.$transaction(async (tx) => {
      const updatedRecipient = await tx.docSignatureRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "signed",
          signedAt: now,
          signatureMethod: payload.method,
          signatureImageUrl: payload.signatureImageUrl ?? null,
          signatureTypedName: payload.typedName ?? payload.signerName,
          signatureFontFamily: payload.fontFamily ?? null,
          ipAddress,
          userAgent,
          viewedAt: recipient.viewedAt ?? now,
        },
      });

      const refreshedRecipients = await tx.docSignatureRecipient.findMany({
        where: { requestId: recipient.requestId },
        orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
      });

      const signers = refreshedRecipients.filter((r) => r.role === "signer");
      const allSigned = signers.length > 0 && signers.every((r) => r.status === "signed");
      const anySigned = signers.some((r) => r.status === "signed");

      const requestStatus = allSigned ? "completed" : anySigned ? "in_progress" : "pending";
      await tx.docSignatureRequest.update({
        where: { id: recipient.requestId },
        data: {
          status: requestStatus,
          completedAt: allSigned ? now : null,
        },
      });

      const signedViewToken = allSigned ? randomBytes(32).toString("hex") : null;

      // Determinar nuevo status del documento al completar firma
      let newDocStatus: string | undefined;
      if (allSigned) {
        const doc = recipient.request.document;
        const effectiveDate = doc.effectiveDate;
        if (effectiveDate && new Date(effectiveDate) > now) {
          newDocStatus = "approved"; // Firmado pero effectiveDate es futura
        } else {
          newDocStatus = "active"; // Firmado y vigente
        }
      }

      const previousStatus = recipient.request.document.status;
      await tx.document.update({
        where: { id: recipient.request.documentId },
        data: {
          signatureStatus: requestStatus,
          ...(newDocStatus ? { status: newDocStatus } : {}),
          signedAt: allSigned ? now : null,
          signedBy: allSigned && signers.length === 1 ? signers[0].name : allSigned ? "multiple_signers" : null,
          pdfUrl: allSigned
            ? `${publicSiteUrl}/api/docs/documents/${recipient.request.documentId}/signed-pdf`
            : null,
          pdfGeneratedAt: null,
          signedViewToken,
          signatureData: buildSummary(
            recipient.requestId,
            refreshedRecipients
              .filter((r) => r.role === "signer")
              .map((r) => ({
                name: r.name,
                email: r.email,
                rut: r.rut,
                status: r.status,
                signedAt: r.signedAt,
                signatureMethod: r.signatureMethod,
              }))
          ),
        },
      });

      await tx.docHistory.create({
        data: {
          documentId: recipient.request.documentId,
          action: "signed",
          details: {
            requestId: recipient.requestId,
            recipientId: updatedRecipient.id,
            signerName: payload.signerName,
            signerRut: payload.signerRut ?? null,
            method: payload.method,
            signedAt: now.toISOString(),
          },
          createdBy: `external:${recipient.email}`,
        },
      });

      // Registrar cambio automático de status + notificación
      if (allSigned && newDocStatus && newDocStatus !== previousStatus) {
        await tx.docHistory.create({
          data: {
            documentId: recipient.request.documentId,
            action: "status_changed",
            details: {
              from: previousStatus,
              to: newDocStatus,
              automated: true,
              reason: "Firma completada por todos los firmantes",
            },
            createdBy: "system:signature_completed",
          },
        });
      }

      return {
        recipient: updatedRecipient,
        requestStatus,
        allSigned,
        documentId: recipient.request.documentId,
        documentTitle: recipient.request.document.title,
        requestId: recipient.requestId,
        tenantId: recipient.request.tenantId,
        signedViewToken,
        recipients: refreshedRecipients.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          role: r.role,
          status: r.status,
          signingOrder: r.signingOrder,
          token: r.token,
        })),
      };
    });

    const siteUrl = publicSiteUrl;
    const statusUrl = `${siteUrl}/opai/documentos/${result.documentId}`;
    const signedAtText = new Date().toLocaleString("es-CL");
    const signerName = payload.signerName;
    const signerEmail = recipient.email;

    if (result.allSigned) {
      try {
        const { sendNotification } = await import("@/lib/notification-service");
        await sendNotification({
          tenantId: result.tenantId,
          type: "document_signed_completed",
          title: `Documento firmado: ${result.documentTitle}`,
          message: `Todos los firmantes han firmado el documento "${result.documentTitle}".`,
          data: { documentId: result.documentId, requestId: result.requestId },
          link: `/opai/documentos/${result.documentId}`,
        });
      } catch (e) {
        console.warn("Sign: failed to create completion notification", e);
      }
    }

    const notifyTargets: string[] = [];
    try {
      const adminUsers = await prisma.admin.findMany({
        where: { tenantId: result.tenantId, role: { in: ["owner", "admin"] }, status: "active" },
        select: { email: true },
      });
      const ccRecipients = result.recipients.filter((r) => r.role === "cc");
      notifyTargets.push(...new Set([...adminUsers.map((a) => a.email), ...ccRecipients.map((r) => r.email)]));
    } catch (e) {
      console.warn("Sign: could not load notify targets for email", e);
    }

    for (const email of notifyTargets) {
      try {
        await sendSignatureCompletedNotifyEmail({
          to: email,
          documentTitle: result.documentTitle,
          signerName,
          signerEmail,
          signedAt: signedAtText,
          statusUrl,
        });
      } catch (e) {
        console.warn("Sign: failed to send notify email to", email, e);
      }
    }

    if (!result.allSigned) {
      const signedOrders = result.recipients
        .filter((r) => r.role === "signer" && r.status === "signed")
        .map((r) => r.signingOrder);
      const maxSignedOrder = signedOrders.length > 0 ? Math.max(...signedOrders) : 0;
      const nextOrderCandidates = result.recipients
        .filter((r) => r.role === "signer" && ["pending", "sent", "viewed"].includes(r.status))
        .map((r) => r.signingOrder);
      const nextOrder = nextOrderCandidates.length > 0 ? Math.min(...nextOrderCandidates) : null;

      if (nextOrder !== null && nextOrder >= maxSignedOrder) {
        const nextSigners = result.recipients.filter(
          (r) => r.role === "signer" && r.signingOrder === nextOrder && ["pending", "sent", "viewed"].includes(r.status)
        );

        for (const nextSigner of nextSigners) {
          try {
            await sendSignatureRequestEmail({
              to: nextSigner.email,
              recipientName: nextSigner.name,
              documentTitle: result.documentTitle,
              signingUrl: `${siteUrl}/sign/${nextSigner.token}`,
            });
            await prisma.docSignatureRecipient.update({
              where: { id: nextSigner.id },
              data: {
                sentAt: new Date(),
                status: nextSigner.status === "pending" ? "sent" : nextSigner.status,
              },
            });
          } catch (e) {
            console.warn("Sign: failed to send next signer email to", nextSigner.email, e);
          }
        }
      }
    } else {
      const doneAt = new Date().toLocaleString("es-CL");
      const everyone = [...new Set(result.recipients.map((r) => r.email))];
      const publicViewUrl =
        result.signedViewToken &&
        `${siteUrl}/signed/${result.documentId}/${result.signedViewToken}`;
      const pdfDownloadUrl =
        result.signedViewToken &&
        `${siteUrl}/api/docs/documents/${result.documentId}/signed-pdf?viewToken=${result.signedViewToken}`;
      for (const email of everyone) {
        try {
          await sendSignatureAllCompletedEmail({
            to: email,
            documentTitle: result.documentTitle,
            completedAt: doneAt,
            documentUrl: publicViewUrl || statusUrl,
            pdfUrl: pdfDownloadUrl || undefined,
          });
        } catch (e) {
          console.warn("Sign: failed to send completed email to", email, e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        recipientId: result.recipient.id,
        requestStatus: result.requestStatus,
        completed: result.allSigned,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Error signing document:", message, stack ?? "");
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development" ? message : "Error al registrar firma",
      },
      { status: 500 }
    );
  }
}
