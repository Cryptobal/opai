import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { hasCapability } from "@/lib/permissions";
import {
  enviarAlertaWhatsApp,
  isWhatsAppConfigured,
} from "@/lib/alertas-cobertura/whatsapp.service";

/**
 * POST — Send a test WhatsApp message to verify Twilio integration.
 * Body: { telefono: "+56912345678" }
 * Auth: requires alerta_cobertura_config capability (owner/admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "alerta_cobertura_config")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para testear WhatsApp" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const telefono = body?.telefono;
    if (!telefono || typeof telefono !== "string") {
      return NextResponse.json(
        { success: false, error: "Campo 'telefono' requerido (ej: +56912345678)" },
        { status: 400 },
      );
    }

    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { success: false, error: "Twilio WhatsApp no está configurado (faltan env vars)" },
        { status: 503 },
      );
    }

    const resultado = await enviarAlertaWhatsApp({
      telefono,
      instalacion: "Edificio Corporate",
      direccion: "Av. Providencia 1234, Providencia",
      horario: "Lun 31 Mar | 20:00 - 08:00",
      monto: "$45.000 CLP",
      modalidad: "Guardia de Seguridad (GGSS)",
      funciones: "Control de acceso y rondas perimetrales (TEST)",
      urlPath: "test-123?token=test",
    });

    return NextResponse.json({
      success: resultado.success,
      messageSid: resultado.messageSid,
      error: resultado.error,
    });
  } catch (error) {
    console.error("[AlertasCobertura] Error en test WhatsApp:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar mensaje de prueba" },
      { status: 500 },
    );
  }
}
