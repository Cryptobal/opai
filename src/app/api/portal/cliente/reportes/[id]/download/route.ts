import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ClienteSession } from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("portal_cliente_session")?.value;
  if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });

  let session: ClienteSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { id } = await params;

  const reporte = await prisma.portalClienteReporte.findUnique({
    where: { id },
    select: { id: true, accountId: true, pdfUrl: true },
  });

  if (!reporte || reporte.accountId !== session.accountId) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (!reporte.pdfUrl) {
    return NextResponse.json({ error: "PDF no disponible aun" }, { status: 404 });
  }

  return NextResponse.redirect(reporte.pdfUrl);
}
