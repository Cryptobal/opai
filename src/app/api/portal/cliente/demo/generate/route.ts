import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AIService } from "@/lib/ai-service";
import { ClienteSession } from "@/lib/portal-cliente";

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

const DEMO_PROMPT = `Generate realistic security service monitoring data for a Chilean B2B client company.
Return ONLY valid JSON (no markdown) with this exact structure:
{
  "installations": [
    { "name": "Edificio Central", "address": "Av. Apoquindo 4500, Las Condes", "guardCount": 3 },
    { "name": "Bodega Norte", "address": "Ruta 5 Norte km 12, Quilicura", "guardCount": 2 }
  ],
  "kpis": {
    "compliance": 94.5,
    "trustScore": 87,
    "alerts": 2,
    "rounds": 48
  },
  "recentActivity": [
    { "type": "ronda", "description": "Ronda completada - Edificio Central", "time": "Hace 2 horas" },
    { "type": "incidente", "description": "Alerta resuelta - Acceso no autorizado", "time": "Hace 5 horas" }
  ]
}`;

export async function POST() {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("portal_cliente_session")?.value;
    if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });

    let session: ClienteSession;
    try {
      session = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    if (!session.isProspect) {
      return NextResponse.json({ error: "Only for prospects" }, { status: 403 });
    }

    let demoData: object;
    try {
      const ai = new AIService();
      demoData = await ai.generateJSON(DEMO_PROMPT, 800);
    } catch {
      demoData = STATIC_DEMO_DATA;
    }

    await prisma.portalClienteDemoData.upsert({
      where: { contactId: session.contactId },
      create: {
        tenantId: session.tenantId,
        contactId: session.contactId,
        demoData,
        generatedAt: new Date(),
      },
      update: {
        demoData,
        generatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: demoData });
  } catch (err) {
    console.error("[demo/generate]", err);
    return NextResponse.json({ success: true, data: STATIC_DEMO_DATA });
  }
}
