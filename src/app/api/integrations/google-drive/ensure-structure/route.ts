import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureInitialDriveStructure } from "@/lib/google-workspace/drive-initial-structure";

export async function POST() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ws = await prisma.googleDriveWorkspace.findUnique({
    where: { tenantId: session.user.tenantId },
    select: { status: true },
  });
  if (ws?.status !== "ACTIVE") {
    return NextResponse.json({ error: "Drive no conectado" }, { status: 400 });
  }

  try {
    const result = await ensureInitialDriveStructure(session.user.tenantId);
    return NextResponse.json({ ok: true, paths: result.paths });
  } catch (err) {
    console.error("[drive] ensure-structure:", err);
    return NextResponse.json({ error: "No se pudo crear la estructura" }, { status: 500 });
  }
}
