/**
 * POST /api/finance/billing/preview-pdf
 *
 * Genera un PDF "vista previa" del DTE a partir del shape del DteForm
 * SIN tocar BD, SIN reservar folio, SIN llamar al SII. El propósito
 * es que el usuario valide visualmente antes de gastar el folio.
 *
 * Body (JSON):
 *   {
 *     dteType: number,
 *     date?: string (YYYY-MM-DD),
 *     receptor: { rut, razonSocial, giro?, direccion?, comuna?, ciudad? },
 *     currency: "CLP" | "UF",
 *     ufOverride?: number,
 *     lines: [{ itemName, quantity, unitPrice, unitPriceUf?, discountPct?, isExempt? }],
 *     references?: [{ tipoDocRef, folioRef, fchRef?, razonRef? }],
 *     notes?: string,
 *   }
 *
 * Internamente:
 *   1. Calcula montos exactos con `computeDteAmounts` (mismo helper
 *      que la emisión real → garantiza que el PDF refleja lo que se
 *      va a emitir).
 *   2. Carga `TenantDteConfig` para obtener emisor (RUT, razón social,
 *      dirección, etc.) + logoBase64.
 *   3. Llama a `renderDtePreviewPdf` que genera el PDF con marca
 *      "VISTA PREVIA · NO EMITIDO".
 *
 * Devuelve `application/pdf` inline para mostrar en iframe.
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
import { prisma } from "@/lib/prisma";
import { computeDteAmounts } from "@/modules/finance/billing/dte-amounts.helper";
import {
  renderDtePreviewPdf,
  type DtePreviewInput,
} from "@/lib/dte-pdf-preview-renderer";

export const runtime = "nodejs";

const previewLineSchema = z.object({
  itemName: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().nullable(),
  quantity: z.number().positive(),
  unit: z.string().trim().max(20).optional().nullable(),
  unitPrice: z.number().min(0),
  unitPriceUf: z.number().positive().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  isExempt: z.boolean().optional(),
});

const previewSchema = z.object({
  dteType: z
    .number()
    .int()
    .refine((v) => [33, 34, 39, 41, 52, 56, 61].includes(v), {
      message: "Tipo de DTE inválido",
    }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD")
    .optional()
    .nullable(),
  currency: z.enum(["CLP", "USD", "UF"]).default("CLP"),
  receptor: z.object({
    rut: z.string().trim().min(2).max(20),
    razonSocial: z.string().trim().min(1).max(200),
    giro: z.string().trim().max(120).optional().nullable(),
    direccion: z.string().trim().max(200).optional().nullable(),
    comuna: z.string().trim().max(80).optional().nullable(),
    ciudad: z.string().trim().max(80).optional().nullable(),
  }),
  lines: z.array(previewLineSchema).min(1, "Debe incluir al menos una línea"),
  references: z
    .array(
      z.object({
        tipoDocRef: z.string().trim().min(1).max(10),
        folioRef: z.string().trim().min(1).max(40),
        fchRef: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD")
          .optional()
          .nullable(),
        razonRef: z.string().trim().max(120).optional().nullable(),
      }),
    )
    .max(30)
    .optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /**
   * UF override para preview con UF distinta a la del día (usado por
   * recurring template preview donde aplicamos una UF policy).
   */
  ufOverride: z.number().positive().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, previewSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  try {
    // Cálculo de montos: misma fuente de verdad que la emisión real.
    // strict=true: si el form pasó algún unitPrice CLP con decimales,
    // el preview falla con el mismo error que vería al emitir.
    const calc = await computeDteAmounts(
      {
        dteType: body.dteType,
        currency: body.currency,
        lines: body.lines.map((l) => ({
          itemName: l.itemName,
          description: l.description ?? undefined,
          quantity: l.quantity,
          unit: l.unit ?? undefined,
          unitPrice: l.unitPrice,
          unitPriceUf: l.unitPriceUf,
          discountPct: l.discountPct,
          isExempt: l.isExempt,
        })),
      },
      { strict: true, ufOverride: body.ufOverride },
    );

    // Datos del emisor desde TenantDteConfig (ya configurado por el
    // usuario en /opai/configuracion/finanzas/dte). Si falta, mostramos
    // placeholders para que el preview siga funcionando aunque la
    // config esté incompleta.
    const tenantConfig = await prisma.tenantDteConfig.findUnique({
      where: { tenantId: ctx.tenantId },
      select: {
        emisorRut: true,
        emisorRazonSocial: true,
        emisorGiro: true,
        emisorDireccion: true,
        emisorComuna: true,
        emisorCiudad: true,
        emisorTelefono: true,
        emisorEmail: true,
        logoBase64: true,
      },
    });

    const previewInput: DtePreviewInput = {
      dteType: body.dteType,
      date: body.date ?? null,
      emisor: {
        rut: tenantConfig?.emisorRut ?? "—",
        razonSocial: tenantConfig?.emisorRazonSocial ?? "[Razón social no configurada]",
        giro: tenantConfig?.emisorGiro,
        direccion: tenantConfig?.emisorDireccion,
        comuna: tenantConfig?.emisorComuna,
        ciudad: tenantConfig?.emisorCiudad,
        telefono: tenantConfig?.emisorTelefono,
        correo: tenantConfig?.emisorEmail,
        logoBase64: tenantConfig?.logoBase64,
      },
      receptor: body.receptor,
      lines: calc.lines.map((l, i) => ({
        itemName: body.lines[i]?.itemName ?? l.itemName,
        description: body.lines[i]?.description ?? l.description ?? null,
        quantity: l.quantity,
        unit: body.lines[i]?.unit ?? l.unit ?? null,
        unitPrice: l.unitPrice,
        netAmount: l.netAmount,
        isExempt: l.isExempt,
      })),
      totals: {
        totalNet: calc.totalNet,
        totalExempt: calc.totalExempt,
        taxRate: calc.taxRate,
        taxAmount: calc.taxAmount,
        totalAmount: calc.totalAmount,
        currency: body.currency === "USD" ? "CLP" : body.currency,
        ufValue: calc.ufValue,
      },
      references: body.references?.map((r) => ({
        tipoDocRef: r.tipoDocRef,
        folioRef: r.folioRef,
        fchRef: r.fchRef ?? null,
        razonRef: r.razonRef ?? null,
      })),
      notes: body.notes ?? null,
    };

    const pdf = await renderDtePreviewPdf(previewInput);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"vista-previa-dte.pdf\"",
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[Finance/Billing/PreviewPdf] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Error al generar vista previa",
      },
      { status: 400 },
    );
  }
}
