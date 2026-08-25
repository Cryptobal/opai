import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendSignatureRequestEmail } from "@/lib/docs-signature-email";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { stampDueRecipients } from "./auto-stamp";

export async function notifyDueSigners(input: {
  requestId: string;
  tenantId: string;
  documentTitle: string;
  createdBy: string;
}): Promise<{ allSigned: boolean; emailed: number }> {
  const stamped = await stampDueRecipients({
    requestId: input.requestId,
    tenantId: input.tenantId,
    createdBy: input.createdBy,
  });

  const request = await prisma.docSignatureRequest.findFirst({
    where: { id: input.requestId, tenantId: input.tenantId },
    include: { recipients: { orderBy: { signingOrder: "asc" } } },
  });
  if (!request) return { allSigned: false, emailed: 0 };

  const signers = request.recipients.filter((r) => r.role === "signer");
  const allSigned = signers.length > 0 && signers.every((r) => r.status === "signed");
  if (allSigned) {
    if (request.status !== "completed") {
      await markRequestCompleted(request.documentId, request.id);
    }
    return { allSigned: true, emailed: 0 };
  }

  const unsigned = signers.filter((r) => ["pending", "sent", "viewed"].includes(r.status));
  const dueOrder =
    request.signingMode === "parallel"
      ? null
      : Math.min(...unsigned.map((r) => r.signingOrder));
  const toEmail = unsigned.filter((r) =>
    request.signingMode === "parallel" ? !r.sentAt : r.signingOrder === dueOrder && !r.sentAt,
  );

  const siteUrl = getCanonicalSiteUrl();
  let emailed = 0;
  for (const recipient of toEmail) {
    const result = await sendSignatureRequestEmail({
      to: recipient.email,
      recipientName: recipient.name,
      documentTitle: input.documentTitle,
      signingUrl: `${siteUrl}/sign/${recipient.token}`,
    });
    await prisma.docSignatureRecipient.update({
      where: { id: recipient.id },
      data: { sentAt: new Date(), status: result.ok ? "sent" : recipient.status },
    });
    emailed += 1;
  }
  return { allSigned: stamped.allSigned, emailed };
}

async function markRequestCompleted(documentId: string, requestId: string) {
  const now = new Date();
  const token = randomBytes(32).toString("hex");
  const siteUrl = getCanonicalSiteUrl();
  await prisma.$transaction([
    prisma.docSignatureRequest.update({
      where: { id: requestId },
      data: { status: "completed", completedAt: now },
    }),
    prisma.document.update({
      where: { id: documentId },
      data: {
        signatureStatus: "completed",
        status: "active",
        signedAt: now,
        signedBy: "multiple_signers",
        pdfUrl: `${siteUrl}/api/docs/documents/${documentId}/signed-pdf`,
        signedViewToken: token,
      },
    }),
  ]);
}
