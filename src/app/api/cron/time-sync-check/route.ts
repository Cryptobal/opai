/**
 * GET/POST /api/cron/time-sync-check
 * Art. 11 — verificación de desfase. También invocado desde
 * /api/cron/marcacion-emails porque Vercel ya supera el tope de crons.
 */

import { NextRequest, NextResponse } from "next/server";
import { runTimeSyncCheck } from "@/lib/time-sync/check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return unauthorized();
  }
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const result = await runTimeSyncCheck();
  return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
}
