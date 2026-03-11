/**
 * API: /api/ops/marcacion/test-email
 * POST - Envía emails de prueba de marcación al email del usuario logueado
 *
 * body: { type: "digital" | "manual" | "both" }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { sendMarcacionComprobante, sendAvisoMarcaManual } from "@/lib/marcacion-email";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const type: string = body.type ?? "both";
    const targetEmail = body.email ?? ctx.userEmail;

    if (!targetEmail) {
      return NextResponse.json(
        { success: false, error: "No hay email destino. Indica un email en el body o asegúrate de tener email en tu perfil." },
        { status: 400 }
      );
    }

    const results: { type: string; status: string; error?: string }[] = [];
    const now = new Date();
    const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);

    // ── Test: Comprobante digital ──
    if (type === "digital" || type === "both") {
      try {
        await sendMarcacionComprobante({
          guardiaName: "Guardia de Prueba (TEST)",
          guardiaEmail: targetEmail,
          guardiaRut: "12.345.678-9",
          installationName: "Instalación Test — Camino Lo Boza",
          tipo: "entrada",
          timestamp: now,
          geoValidada: true,
          geoDistanciaM: 15,
          gpsStatus: "dentro_rango",
          lat: -33.4489,
          lng: -70.6693,
          hashIntegridad: "TEST_" + "a1b2c3d4e5f6".repeat(5) + "_" + now.getTime(),
        });
        results.push({ type: "digital", status: "sent" });
        console.log(`[TEST EMAIL] Comprobante digital enviado a ${targetEmail}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ type: "digital", status: "error", error: msg });
        console.error("[TEST EMAIL] Error enviando comprobante digital:", msg);
      }
    }

    // ── Test: Aviso marca manual ──
    if (type === "manual" || type === "both") {
      try {
        await sendAvisoMarcaManual({
          guardiaName: "Guardia de Prueba (TEST)",
          guardiaEmail: targetEmail,
          guardiaRut: "12.345.678-9",
          installationName: "Instalación Test — Camino Lo Boza",
          empresaName: tenantCfg.companyName,
          empresaRut: tenantCfg.rut,
          tipo: "entrada",
          fechaMarca: now.toISOString().slice(0, 10),
          horaMarca: now.toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "America/Santiago",
          }),
          tipoAjuste: "Prueba (TEST)",
          motivo: "Email de prueba enviado desde configuración",
          hashIntegridad: "TEST_" + "f6e5d4c3b2a1".repeat(5) + "_" + now.getTime(),
          registradoPor: ctx.userEmail ?? "Supervisor (Test)",
          clausulaLegal:
            "Si transcurridas las 48 horas de recibir esta notificación usted no se hubiera opuesto al nuevo ajuste, ésta será considerada válida para los efectos de cálculo de su jornada.",
        });
        results.push({ type: "manual", status: "sent" });
        console.log(`[TEST EMAIL] Aviso marca manual enviado a ${targetEmail}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ type: "manual", status: "error", error: msg });
        console.error("[TEST EMAIL] Error enviando aviso marca manual:", msg);
      }
    }

    const allSent = results.every((r) => r.status === "sent");

    return NextResponse.json({
      success: true,
      data: {
        targetEmail,
        results,
        allSent,
        message: allSent
          ? `${results.length} email(s) de prueba enviado(s) a ${targetEmail}`
          : `Algunos emails fallaron. Revisa los detalles.`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TEST EMAIL] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
