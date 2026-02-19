/**
 * GET - Obtener documento firmado para vista pública (sin login).
 * Valida signedViewToken y devuelve documento + registro de firma.
 * Resuelve tokens de firma en el contenido antes de enviar.
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function formatSignDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

type SignerCtx = { name: string; signingOrder: number; signedAt: Date | null; signatureImageUrl: string | null; signatureTypedName: string | null; signatureFontFamily: string | null; signatureMethod: string | null };

function resolveSignatureTokens(content: unknown, ctx: { sentAt: Date | null; signers: SignerCtx[] }): unknown {
  if (!content || typeof content !== "object") return content;
  if (Array.isArray(content)) return content.map((c) => resolveSignatureTokens(c, ctx));
  const node = content as { type?: string; attrs?: { tokenKey?: string }; content?: unknown[] };
  if (node.type === "contractToken" && node.attrs?.tokenKey) {
    const key = node.attrs.tokenKey;
    if (key === "signature.sentDate") return { type: "text", text: formatSignDate(ctx.sentAt) };
    if (key === "signature.signedDate") {
      const last = ctx.signers.reduce((p, s) => (!p || (s.signedAt && (!p.signedAt || s.signedAt > p.signedAt)) ? s : p), null as SignerCtx | null);
      return { type: "text", text: formatSignDate(last?.signedAt ?? null) };
    }
    const effectiveKey = key === "signature.placeholder" || key === "signature.firmaGuardia" ? "signature.signer_1" : key;
    const m = /^signature\.signer_(\d+)$/.exec(effectiveKey);
    if (m) {
      const order = parseInt(m[1], 10);
      const signer = ctx.signers.find((s) => s.signingOrder === order);
      if (!signer) return { type: "text", text: "[—]" };
      return { type: "text", text: `[Firmado por ${signer.name} el ${formatSignDate(signer.signedAt)}]` };
    }
  }
  if (node.content && Array.isArray(node.content)) {
    return { ...node, content: node.content.map((c) => resolveSignatureTokens(c, ctx)) };
  }
  return content;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string; viewToken: string }> }
) {
  try {
    const { documentId, viewToken } = await params;
    const doc = await prisma.document.findFirst({
      where: { id: documentId, signedViewToken: viewToken },
      include: {
        signatureRequests: {
          where: { status: "completed" },
          orderBy: { completedAt: "desc" },
          take: 1,
          include: {
            recipients: {
              where: { role: "signer" },
              orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });

    if (!doc) {
      return NextResponse.json({ success: false, error: "Enlace inválido o expirado" }, { status: 404 });
    }

    const request = doc.signatureRequests[0];
    const signers: SignerCtx[] = (request?.recipients ?? []).map((r) => ({
      name: r.name,
      signingOrder: r.signingOrder,
      signedAt: r.signedAt,
      signatureImageUrl: r.signatureImageUrl,
      signatureTypedName: r.signatureTypedName,
      signatureFontFamily: r.signatureFontFamily,
      signatureMethod: r.signatureMethod,
    }));
    const sentAt = request?.createdAt ?? null;
    const resolvedContent =
      doc.content && typeof doc.content === "object"
        ? resolveSignatureTokens(JSON.parse(JSON.stringify(doc.content)), { sentAt, signers })
        : doc.content;

    const contentHash = createHash("sha256").update(JSON.stringify(doc.content)).digest("hex");

    return NextResponse.json({
      success: true,
      data: {
        document: {
          id: doc.id,
          title: doc.title,
          content: resolvedContent,
          signedAt: doc.signedAt,
          signatureStatus: doc.signatureStatus,
        },
        signers: (request?.recipients ?? []).map((r) => ({
          name: r.name,
          email: r.email,
          rut: r.rut,
          signingOrder: r.signingOrder,
          signedAt: r.signedAt,
          signatureMethod: r.signatureMethod,
          signatureTypedName: r.signatureTypedName,
          signatureFontFamily: r.signatureFontFamily,
          signatureImageUrl: r.signatureImageUrl,
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
        })),
        completedAt: request?.completedAt ?? doc.signedAt,
        contentHash,
        verificationUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl"}/signed/${documentId}/${viewToken}`,
      },
    });
  } catch (error) {
    console.error("Error fetching signed view:", error);
    return NextResponse.json({ success: false, error: "Error al cargar documento" }, { status: 500 });
  }
}
