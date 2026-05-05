/**
 * POST /api/finance/config/dte-provider/test-connection
 *
 * Hace un ping a SimpleAPI con el RUT del emisor configurado para validar:
 * - SIMPLEAPI_KEY del servidor está configurada
 * - El RUT del emisor está habilitado en SimpleAPI
 * - La red al endpoint de SimpleAPI funciona
 *
 * No requiere certificado: usa /folios/disponibles como ping liviano.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.SIMPLEAPI_BASE_URL ?? "https://api.simpleapi.cl";
const API_KEY = process.env.SIMPLEAPI_KEY ?? "";

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "rendicion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  if (!API_KEY) {
    return NextResponse.json(
      { success: false, error: "SIMPLEAPI_KEY no configurada en el servidor." },
      { status: 500 }
    );
  }

  const config = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  if (!config?.emisorRut) {
    return NextResponse.json(
      { success: false, error: "Falta configurar el RUT del emisor." },
      { status: 400 }
    );
  }

  // Llamada simple a un endpoint de SimpleAPI que valide el ApiKey.
  // Usamos un endpoint ligero (consultar folios disponibles) que sirve como ping.
  try {
    const res = await fetch(`${BASE_URL}/folios/disponibles`, {
      method: "POST",
      headers: { Authorization: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        RutEmisor: config.emisorRut,
        Ambiente: config.environment === "PRODUCTION" ? 1 : 0,
        TipoDTE: 33,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `SimpleAPI respondió HTTP ${res.status}`,
          details: body,
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, data: body });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
