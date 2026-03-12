import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  const { tenantId } = result.data;

  const guardias = await prisma.guardia.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      persona: { select: { firstName: true, lastName: true } },
    },
    orderBy: [
      { persona: { lastName: "asc" } },
      { persona: { firstName: "asc" } },
    ],
  });

  return NextResponse.json({
    success: true,
    data: guardias.map((g) => ({
      id: g.id,
      firstName: g.persona.firstName,
      lastName: g.persona.lastName,
    })),
  });
}
