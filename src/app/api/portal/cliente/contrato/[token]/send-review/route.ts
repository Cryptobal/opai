import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST — Client submits a batch review: all pending suggestions get sent
 * together to the company in a single consolidated email/notification.
 *
 * Uses contractMetadata.reviewSubmittedAt to track when the latest batch was
 * sent; only suggestions created after that timestamp (or all pending if null)
 * are included. Idempotent-ish: if there are no new suggestions, returns an
 * informative error instead of spamming.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const document = await prisma.document.findFirst({
      where: { contractClientToken: token },
      select: {
        id: true,
        tenantId: true,
        title: true,
        status: true,
        contractMetadata: true,
        contractSuggestions: {
          where: { status: "pending" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            clauseNumber: true,
            clauseTitle: true,
            originalContent: true,
            suggestedContent: true,
            clientNote: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Contrato no encontrado" },
        { status: 404 }
      );
    }

    // Accept "in_review" (set by the company when pushing to the client),
    // "review" (legacy alias), and "draft" (auto-generated drafts). Everything
    // else means the contract has advanced beyond review (approved / active).
    if (!["draft", "review", "in_review"].includes(document.status)) {
      return NextResponse.json(
        { success: false, error: "El contrato ya no acepta nuevas revisiones" },
        { status: 400 }
      );
    }

    const metadata = (document.contractMetadata ?? {}) as Record<string, unknown>;
    const lastSubmittedAtRaw = metadata.reviewSubmittedAt;
    const lastSubmittedAt =
      typeof lastSubmittedAtRaw === "string" ? new Date(lastSubmittedAtRaw) : null;

    const newSuggestions = document.contractSuggestions.filter((s) => {
      if (!lastSubmittedAt || Number.isNaN(lastSubmittedAt.getTime())) return true;
      return s.createdAt > lastSubmittedAt;
    });

    if (newSuggestions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No hay sugerencias nuevas para enviar. Agregue al menos un cambio antes de enviar la revisión.",
        },
        { status: 400 }
      );
    }

    const now = new Date();

    // Update document: mark as "review" and record submission timestamp
    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "review",
        contractMetadata: {
          ...metadata,
          reviewSubmittedAt: now.toISOString(),
          reviewBatchCount: ((metadata.reviewBatchCount as number) ?? 0) + 1,
        },
      },
    });

    await prisma.docHistory.create({
      data: {
        documentId: document.id,
        action: "review_submitted",
        details: {
          from: document.status,
          to: "review",
          suggestionsCount: newSuggestions.length,
          reason: "client_batch_review",
        },
        createdBy: "portal_client",
      },
    });

    // Consolidated notification (bell + push). Email keeps a separate template
    // below because it needs the diff list for each suggestion.
    try {
      const { notify } = await import("@/lib/notifications/notify");
      await notify({
        tenantId: document.tenantId,
        type: "contract_suggestion",
        title: `Revisión recibida: ${newSuggestions.length} cambio(s) al contrato`,
        body: `El cliente envió sus comentarios en "${document.title}".`,
        link: `/opai/docs/documentos/${document.id}`,
        data: {
          documentId: document.id,
          suggestionsCount: newSuggestions.length,
          batch: true,
        },
        forceChannels: { email: false }, // dedicated email below
      });
    } catch (e) {
      console.warn("Failed to notify contract_suggestion:", e);
    }

    // Consolidated email to admins
    try {
      const admins = await prisma.admin.findMany({
        where: {
          tenantId: document.tenantId,
          role: { in: ["owner", "admin"] },
          status: "active",
        },
        select: { email: true },
      });

      if (admins.length > 0) {
        const { resend, getTenantEmailConfig } = await import("@/lib/resend");
        const emailConfig = await getTenantEmailConfig(document.tenantId);
        const siteUrl =
          process.env.NEXT_PUBLIC_SITE_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "";

        const escapeHtml = (s: string) =>
          s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        const suggestionsHtml = newSuggestions
          .map(
            (s) => `
              <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="font-weight:600;color:#0f172a;margin-bottom:6px;">
                  Cláusula ${escapeHtml(s.clauseNumber)}${s.clauseTitle ? ` — ${escapeHtml(s.clauseTitle)}` : ""}
                </div>
                ${
                  s.clientNote
                    ? `<div style="font-size:13px;color:#475569;margin-bottom:8px;"><em>Nota del cliente:</em> ${escapeHtml(s.clientNote)}</div>`
                    : ""
                }
                <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Propuesta:</div>
                <div style="background:#f1f5f9;border-radius:6px;padding:8px;font-size:13px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(
                  s.suggestedContent.slice(0, 600)
                )}${s.suggestedContent.length > 600 ? "…" : ""}</div>
              </div>
            `
          )
          .join("");

        for (const admin of admins) {
          await resend.emails
            .send({
              from: emailConfig.from,
              replyTo: emailConfig.replyTo,
              to: admin.email,
              subject: `Revisión del contrato "${document.title}" — ${newSuggestions.length} cambio(s)`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
                  <h2 style="color:#0d9488;margin-bottom:4px;">Revisión recibida</h2>
                  <p style="color:#475569;margin-top:0;">
                    El cliente envió <strong>${newSuggestions.length}</strong> cambio(s) al contrato
                    <strong>"${escapeHtml(document.title)}"</strong>.
                  </p>
                  ${suggestionsHtml}
                  <p style="margin-top:24px;">
                    <a href="${siteUrl}/opai/documentos/${document.id}"
                       style="display:inline-block;padding:10px 20px;background:#0d9488;color:white;border-radius:6px;text-decoration:none;font-weight:600;">
                      Revisar sugerencias
                    </a>
                  </p>
                  <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
                    Recibirá los comentarios del cliente en este formato consolidado cada vez que envíe una revisión.
                  </p>
                </div>
              `,
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Failed to send batch review email:", e);
    }

    return NextResponse.json({
      success: true,
      data: {
        submittedCount: newSuggestions.length,
        submittedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error submitting contract review batch:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
