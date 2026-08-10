import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureInitialDriveStructure } from "@/lib/google-workspace/drive-initial-structure";
import { migrateDriveStructure } from "@/lib/google-workspace/drive-migrate-structure";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.user.tenantId;
  const ws = await prisma.googleDriveWorkspace.findUnique({
    where: { tenantId },
    select: { status: true },
  });
  if (ws?.status !== "ACTIVE") {
    return NextResponse.json({ error: "Drive no conectado" }, { status: 400 });
  }

  let action: "create" | "migrate" | "repair" = "create";
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action === "migrate" || body.action === "repair" || body.action === "create") {
      action = body.action;
    }
  } catch {
    /* body vacío → create */
  }

  try {
    if (action === "create") {
      const result = await ensureInitialDriveStructure(tenantId);
      return NextResponse.json({
        ok: true,
        action,
        paths: result.paths,
        skipped: result.skipped,
      });
    }

    const consolidateRoots = action === "repair";
    const result = await migrateDriveStructure(tenantId, { consolidateRoots });
    return NextResponse.json({ ok: true, action, ...result });
  } catch (err) {
    console.error("[drive] ensure-structure:", action, err);
    const msg = err instanceof Error ? err.message : "No se pudo procesar la estructura";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
