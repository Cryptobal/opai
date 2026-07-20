import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.googleDriveWorkspace.updateMany({
    where: { tenantId: session.user.tenantId, status: "ACTIVE" },
    data: { status: "REVOKED" },
  });

  return NextResponse.json({ ok: true });
}
