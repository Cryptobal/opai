/**
 * API Route: /api/cpq/quotes/trash/[id]/restore
 * POST - Restaura una cotización desde la papelera (reasignando código si colisiona).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireQuoteDelete } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  restoreQuoteFromTrash,
  QuoteTrashError,
} from "@/modules/cpq/quote-trash.service";

const ERROR_STATUS: Record<string, number> = {
  TRASH_NOT_FOUND: 404,
  QUOTE_NOT_FOUND: 404,
  ALREADY_RESTORED: 409,
  EXPIRED: 410,
};

const ERROR_MESSAGE: Record<string, string> = {
  TRASH_NOT_FOUND: "Registro de papelera no encontrado",
  QUOTE_NOT_FOUND: "Cotización no encontrada",
  ALREADY_RESTORED: "La cotización ya fue restaurada",
  EXPIRED: "El plazo de restauración expiró",
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireQuoteDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    try {
      const result = await restoreQuoteFromTrash({
        tenantId: ctx.tenantId,
        trashId: id,
        userId: ctx.userId,
      });
      return NextResponse.json({ success: true, data: result });
    } catch (e) {
      if (e instanceof QuoteTrashError) {
        return NextResponse.json(
          { success: false, error: ERROR_MESSAGE[e.code] ?? e.code },
          { status: ERROR_STATUS[e.code] ?? 400 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[cpq/quotes/trash/[id]/restore POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al restaurar la cotización" },
      { status: 500 },
    );
  }
}
