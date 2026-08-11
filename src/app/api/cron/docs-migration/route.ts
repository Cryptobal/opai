/**
 * Cron: migración automática legado → Documento unificado.
 * Cada 5 minutos. Reentrante; cambia a completed solo si la paridad pasa.
 */

import { NextRequest, NextResponse } from "next/server";
import { runMigrationCron } from "@/lib/docs/migration";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await runMigrationCron();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[docs-migration] Fatal:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
