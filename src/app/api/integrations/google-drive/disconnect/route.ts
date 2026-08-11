import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/google-workspace";

async function revokeGoogleToken(refreshTokenEnc: string): Promise<void> {
  try {
    const token = decryptToken(refreshTokenEnc);
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    if (!res.ok) {
      console.warn("[google-drive] revoke token status:", res.status);
    }
  } catch (err) {
    console.warn("[google-drive] revoke token falló (se continúa):", err);
  }
}

export async function POST() {
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
    select: {
      id: true,
      refreshTokenEnc: true,
      status: true,
      mode: true,
    },
  });

  if (ws?.mode === "SHARED_DRIVE") {
    return NextResponse.json(
      {
        error:
          "En modo unidad compartida no se puede desconectar así. Usá «Cambiar unidad» o desactivá el modo unidad compartida desde soporte (DELETE /shared-drive).",
      },
      { status: 409 },
    );
  }

  if (ws?.refreshTokenEnc) {
    await revokeGoogleToken(ws.refreshTokenEnc);
  }

  await prisma.$transaction([
    prisma.googleDriveWorkspace.updateMany({
      where: { tenantId },
      data: {
        status: "REVOKED",
        rootFolderId: null,
        structureVersion: 1,
        rootVerifiedAt: null,
      },
    }),
    prisma.driveFolderCache.deleteMany({ where: { tenantId } }),
  ]);

  return NextResponse.json({ ok: true });
}
