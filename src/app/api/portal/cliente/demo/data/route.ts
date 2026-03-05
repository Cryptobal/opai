import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

const STATIC_DEMO_DATA = {
  installations: [
    { name: "Edificio Corporativo", address: "Av. Providencia 1234, Santiago", guardCount: 3 },
    { name: "Planta de Operaciones", address: "Ruta 68 km 20, Pudahuel", guardCount: 2 },
  ],
  kpis: { compliance: 92.0, trustScore: 85, alerts: 1, rounds: 36 },
  recentActivity: [
    { type: "ronda", description: "Ronda completada - Edificio Corporativo", time: "Hace 1 hora" },
    { type: "posta", description: "Cambio de turno registrado", time: "Hace 3 horas" },
  ],
};

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

    const existing = await prisma.portalClienteDemoData.findUnique({
      where: { contactId: session.contactId },
    });

    if (existing) {
      return NextResponse.json({ success: true, data: existing.demoData });
    }

    return NextResponse.json({ success: true, data: STATIC_DEMO_DATA });
  } catch (err) {
    console.error("[demo/data]", err);
    return NextResponse.json({ success: true, data: STATIC_DEMO_DATA });
  }
}
