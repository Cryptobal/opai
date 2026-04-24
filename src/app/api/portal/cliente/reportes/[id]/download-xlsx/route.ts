import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const { id } = await params;
  const reporte = await prisma.portalClienteReporte.findUnique({
    where: { id },
    select: { id: true, accountId: true, xlsxUrl: true },
  });

  if (!reporte || reporte.accountId !== session.accountId) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!reporte.xlsxUrl) {
    return NextResponse.json(
      { error: "Excel no disponible aún" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(reporte.xlsxUrl);
}
