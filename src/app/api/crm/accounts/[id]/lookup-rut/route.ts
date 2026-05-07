/**
 * API Route: GET /api/crm/accounts/[id]/lookup-rut
 *
 * Consulta los datos oficiales del contribuyente al SII (vía SimpleAPI)
 * usando el RUT actual del CrmAccount. NO actualiza la cuenta — solo
 * devuelve los datos para que el frontend muestre un preview con diff
 * y pida confirmación al usuario antes de aplicar (vía PATCH /accounts/[id]).
 *
 * Útil para:
 *   - Completar campos vacíos (giro, ciudad, dirección) sin tipearlos.
 *   - Verificar que la razón social registrada coincida con el SII.
 *   - Tener disponible la actividad económica formal exigida por SII en DTEs.
 *
 * Permisos: requiere CrmEdit en "accounts" (mismo que el PATCH).
 *
 * Latencia: el SII puede tardar 1-2 min en responder cuando hay colas.
 * Por eso usamos `maxDuration: 120s` y un timeout de 120s en el adapter.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { lookupRutSimpleApi } from "@/modules/finance/shared/adapters/simpleapi-rut";

export const maxDuration = 120;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "accounts");
    if (forbidden) return forbidden;

    const { id } = await params;

    const account = await prisma.crmAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        legalName: true,
        rut: true,
        giro: true,
        address: true,
        commune: true,
        city: true,
      },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 },
      );
    }
    if (!account.rut) {
      return NextResponse.json(
        {
          success: false,
          error: "La cuenta no tiene RUT cargado. Agregalo antes de consultar al SII.",
        },
        { status: 400 },
      );
    }

    const result = await lookupRutSimpleApi(account.rut);

    if (!result.success) {
      // Mapeo fino del status: 400 si SimpleAPI rechazó por RUT inexistente,
      // 502 si fue error del provider, 504 si timeout.
      const status = /timeout/i.test(result.error)
        ? 504
        : result.httpStatus === 400 || /no hay registros|rut inv\u00e1lido/i.test(result.error)
          ? 404
          : result.httpStatus === 401 || result.httpStatus === 403
            ? 502
            : 502;
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          httpStatus: result.httpStatus,
        },
        { status },
      );
    }

    // Computamos un "diff" preliminar (campos donde el SII difiere de
    // lo que está hoy en CRM) para que el frontend pueda destacar lo que
    // cambiaría al aplicar.
    const current = {
      legalName: account.legalName,
      giro: account.giro,
      address: account.address,
      commune: account.commune,
      city: account.city,
    };
    const sii = {
      legalName: result.summary.razonSocial,
      giro: result.summary.giro,
      address: result.summary.direccion,
      commune: result.summary.comuna,
      city: result.summary.ciudad,
    };
    const diff: Record<string, { current: string | null; sii: string | null; changes: boolean }> = {};
    for (const k of Object.keys(sii) as Array<keyof typeof sii>) {
      const cur = (current[k] ?? "").trim();
      const next = (sii[k] ?? "").trim();
      diff[k] = {
        current: cur || null,
        sii: next || null,
        changes: !!next && next !== cur,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        rut: result.rut,
        sii: result.summary,
        // Datos crudos completos para que el frontend pueda mostrar el
        // listado de actividades económicas y domicilios alternativos
        // si el operador quiere elegir uno distinto del primario.
        rawSii: result.raw,
        diff,
      },
    });
  } catch (error) {
    console.error("[CRM/Accounts/LookupRut] Error inesperado:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Error inesperado al consultar al SII",
      },
      { status: 500 },
    );
  }
}
