import { NextRequest, NextResponse } from "next/server";
import { flushGmailSyncJobs } from "@/modules/crm/email/gmail-sync-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await flushGmailSyncJobs({
    limit: 20,
    deadlineMs: Date.now() + 50_000,
  });
  return NextResponse.json({ ok: true, ...result });
}
