import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emailAttachmentPrefix } from "@/modules/crm/email/gmail-outbound-attachments";
import { deleteStagedEmailFilesOlderThanPrefix } from "@/modules/crm/email/gmail-staging-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accounts = await prisma.crmEmailAccount.findMany({
    where: { provider: "gmail" },
    distinct: ["tenantId", "userId"],
    select: { tenantId: true, userId: true },
    take: 200,
  });
  const before = new Date(Date.now() - 24 * 60 * 60_000);
  let deleted = 0;
  let failed = 0;
  for (const account of accounts) {
    try {
      deleted += await deleteStagedEmailFilesOlderThanPrefix({
        prefix: emailAttachmentPrefix(account.tenantId, account.userId),
        before,
        limit: 500,
      });
    } catch (error) {
      failed += 1;
      console.warn("[gmail-attachments] cleanup falló", account, error);
    }
  }
  return NextResponse.json({ ok: true, deleted, failed });
}
