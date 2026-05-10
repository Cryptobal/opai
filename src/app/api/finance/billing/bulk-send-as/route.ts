/**
 * POST /api/finance/billing/bulk-send-as
 *
 * Envía documento de cobro a varios DTEs (drafts y/o emitidos) en una
 * sola request. Procesa hasta 50 DTEs con concurrencia limitada.
 *
 * Permisos: facturacion_create_draft o facturacion_resend_email.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { sendBillingDocument } from "@/modules/finance/billing/billing-document-send.service";

const bulkSchema = z.object({
  variant: z.enum(["PROFORMA", "ESTADO_DE_PAGO"]),
  dteIds: z.array(z.string().uuid()).min(1).max(50),
  customSubject: z.string().max(200).optional(),
  customIntroHtml: z.string().max(5000).optional(),
  signerOverrides: z.array(z.string()).max(3).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 60;

const CONCURRENCY = 5;

async function runBatched<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const results = await Promise.allSettled(slice.map(fn));
    for (const r of results) {
      if (r.status === "fulfilled") out.push(r.value);
      else out.push({ success: false, error: String(r.reason) } as unknown as R);
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_create_draft") &&
      !hasFacturacionCapability(perms, "facturacion_resend_email")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, bulkSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const results = await runBatched(body.dteIds, CONCURRENCY, async (dteId) => {
      const result = await sendBillingDocument(ctx.tenantId, {
        dteId,
        variant: body.variant,
        customSubject: body.customSubject ?? null,
        customIntroHtml: body.customIntroHtml ?? null,
        signerOverrides: body.signerOverrides,
        triggeredBy: ctx.userId,
      });
      return { dteId, ...result };
    });

    const sent = results.filter((r) => r.success).length;
    const failed = results
      .filter((r) => !r.success)
      .map((r) => ({ dteId: r.dteId, error: r.error ?? "Unknown error" }));

    return NextResponse.json({
      success: true,
      data: { sent, failed },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
