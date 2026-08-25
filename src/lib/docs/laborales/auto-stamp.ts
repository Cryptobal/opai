import { prisma } from "@/lib/prisma";
import { getFileBuffer } from "@/lib/storage";

function toDataUrl(buffer: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function stampRecipient(input: {
  recipientId: string;
  tenantId: string;
  createdBy: string;
}): Promise<boolean> {
  const recipient = await prisma.docSignatureRecipient.findFirst({
    where: { id: input.recipientId },
    include: {
      request: { select: { tenantId: true, documentId: true } },
    },
  });
  if (!recipient || recipient.request.tenantId !== input.tenantId) return false;
  if (!recipient.autoStamp || recipient.status === "signed") return false;

  const signer = await prisma.docTenantSigner.findFirst({
    where: {
      tenantId: input.tenantId,
      email: recipient.email,
      isActive: true,
      signatureStorageKey: { not: null },
    },
  });
  if (!signer?.signatureStorageKey) return false;

  const buffer = await getFileBuffer(signer.signatureStorageKey, 2 * 1024 * 1024);
  const imageUrl = toDataUrl(buffer, "image/png");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.docSignatureRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "signed",
        signedAt: now,
        signatureMethod: "stamped",
        signatureImageUrl: imageUrl,
        userAgent: "auto-stamp",
      },
    });
    await tx.docHistory.create({
      data: {
        documentId: recipient.request.documentId,
        action: "signed",
        details: { method: "stamped", recipientId: recipient.id, email: recipient.email },
        createdBy: input.createdBy,
      },
    });
  });
  return true;
}

export function dueAutoStampIds(
  signingMode: string,
  recipients: Array<{ id: string; role: string; status: string; signingOrder: number; autoStamp: boolean }>,
): string[] {
  const unsigned = recipients.filter(
    (r) => r.role === "signer" && !["signed", "declined", "expired"].includes(r.status),
  );
  if (unsigned.length === 0) return [];
  if (signingMode === "parallel") {
    return unsigned.filter((r) => r.autoStamp).map((r) => r.id);
  }
  const minOrder = Math.min(...unsigned.map((r) => r.signingOrder));
  return unsigned.filter((r) => r.signingOrder === minOrder && r.autoStamp).map((r) => r.id);
}

export async function stampDueRecipients(input: {
  requestId: string;
  tenantId: string;
  createdBy: string;
}): Promise<{ stamped: number; allSigned: boolean }> {
  let stamped = 0;
  for (let i = 0; i < 20; i++) {
    const request = await prisma.docSignatureRequest.findFirst({
      where: { id: input.requestId, tenantId: input.tenantId },
      include: { recipients: { orderBy: { signingOrder: "asc" } } },
    });
    if (!request) break;
    const ids = dueAutoStampIds(request.signingMode, request.recipients);
    if (ids.length === 0) {
      const signers = request.recipients.filter((r) => r.role === "signer");
      return {
        stamped,
        allSigned: signers.length > 0 && signers.every((r) => r.status === "signed"),
      };
    }
    for (const id of ids) {
      if (await stampRecipient({ recipientId: id, tenantId: input.tenantId, createdBy: input.createdBy })) {
        stamped += 1;
      } else {
        return { stamped, allSigned: false };
      }
    }
  }
  return { stamped, allSigned: false };
}
