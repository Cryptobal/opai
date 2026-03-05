import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await prisma.crmAccount.update({
    where: { id: session.accountId },
    data: { portalTourShown: true },
  });

  return NextResponse.json({ success: true });
}
