/**
 * GET/POST /api/cron/alerta-falta-marcacion
 * Art. 45.1 — falta de marcación a los 30 min. También invocado desde
 * /api/cron/marcacion-emails porque Vercel rechaza un 67.º cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAlertaFaltaMarcacion } from "@/lib/marcacion-alerta-falta";

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

  const result = await runAlertaFaltaMarcacion();
  return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
}
