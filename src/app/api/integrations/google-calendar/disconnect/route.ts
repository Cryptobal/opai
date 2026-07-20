import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.googleCalendarAccount.updateMany({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      status: "ACTIVE",
    },
    data: { status: "REVOKED" },
  });

  return NextResponse.json({ ok: true });
}
