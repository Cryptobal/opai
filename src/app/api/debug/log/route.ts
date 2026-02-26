import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEBUG_LOG_PATH = "/opt/cursor/logs/debug.log";

type DebugLogBody = {
  hypothesisId?: unknown;
  location?: unknown;
  message?: unknown;
  data?: unknown;
  timestamp?: unknown;
  runId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DebugLogBody;
    const entry = {
      hypothesisId: typeof body.hypothesisId === "string" ? body.hypothesisId : "UNKNOWN",
      location: typeof body.location === "string" ? body.location : "unknown",
      message: typeof body.message === "string" ? body.message : "missing-message",
      data: body.data && typeof body.data === "object" ? body.data : {},
      timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
      runId: typeof body.runId === "string" ? body.runId : "unknown-run",
    };
    await mkdir(dirname(DEBUG_LOG_PATH), { recursive: true });
    await appendFile(DEBUG_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to write debug log" }, { status: 500 });
  }
}
