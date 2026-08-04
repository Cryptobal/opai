import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createDraftDte } from "@/modules/finance/billing/dte-draft.service";
import {
  isTemplateLinkRequiredError,
  templateLinkRequiredResponse,
} from "@/modules/finance/billing/template-link-error-response";
import { formatDateOnlyUtcYmd } from "@/lib/fx-date";

/**
 * POST /api/finance/billing/issued/[id]/duplicate-as-draft
 *
 * Crea un borrador con los mismos datos de un DTE emitido. Útil para
 * recurrentes ad-hoc o para corregir errores rápido (duplicar → editar →
 * emitir nuevo). NO copia el folio, ni el siiTrackId, ni la referencia
 * al DTE original (es un DTE independiente).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_create_draft") &&
      !hasFacturacionCapability(perms, "facturacion_issue")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permiso para crear borradores" },
        { status: 403 },
      );
    }
    const { id } = await params;

    const original = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId, siiStatus: { not: "DRAFT" } },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    if (!original) {
      return NextResponse.json(
        { success: false, error: "DTE no encontrado o ya es borrador" },
        { status: 404 },
      );
    }

    // Preservar referencias en el duplicado. Dos bloques distintos:
    //   1. La referencia escalar al DTE original (referenceType/Folio/...),
    //      típica de NC/ND. Sólo la reconstruimos si viene poblada.
    //   2. Las referencias adicionales no-DTE (OC, HES, Contrato...) que van
    //      en el JSON `additionalReferences`. Su shape persistido ya es
    //      { tipoDocRef, folioRef, fchRef, razonRef }; lo pasamos con un
    //      guard defensivo. Sin esto el borrador salía sin OC/HES.
    const reference =
      original.referenceType != null && original.referenceFolio != null
        ? {
            docId: original.referenceDteId ?? undefined,
            type: original.referenceType,
            folio: original.referenceFolio,
            date: original.referenceDate
              ? formatDateOnlyUtcYmd(original.referenceDate)
              : "",
            code: (original.referenceCode ?? 1) as 1 | 2 | 3,
            reason: original.referenceReason ?? "",
          }
        : undefined;
    const additionalReferences = Array.isArray(original.additionalReferences)
      ? (original.additionalReferences as Array<Record<string, unknown>>)
          .filter((r) => r && typeof r === "object" && r.tipoDocRef != null)
          .map((r) => ({
            tipoDocRef: String(r.tipoDocRef),
            folioRef: r.folioRef != null ? String(r.folioRef) : "",
            fchRef: typeof r.fchRef === "string" ? r.fchRef : "",
            razonRef: typeof r.razonRef === "string" ? r.razonRef : "",
          }))
      : undefined;

    const draft = await createDraftDte(ctx.tenantId, ctx.userId, {
      dteType: original.dteType,
      reference,
      additionalReferences,
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      receiverEmail: original.receiverEmail ?? undefined,
      receiverEmailCc: original.receiverEmailCc,
      receiverGiro: original.receiverGiro ?? undefined,
      receiverDireccion: original.receiverDireccion ?? undefined,
      receiverComuna: original.receiverComuna ?? undefined,
      receiverCiudad: original.receiverCiudad ?? undefined,
      crmAccountId: original.crmAccountId ?? undefined,
      installationId: original.installationId ?? undefined,
      currency: original.currency,
      notes: original.notes ?? undefined,
      // Reemisión (típico tras NC): hereda la cuota (programación, período) del
      // original, así la factura rehecha ocupa el MISMO período y no duplica ni
      // libera la proyección. Si es una factura ad-hoc distinta, el usuario lo
      // cambia en el editor (el control es obligatorio).
      recurringTemplateId: original.recurringTemplateId ?? undefined,
      billingPeriod: original.billingPeriod ?? undefined,
      lines: original.lines.map((l) => ({
        itemCode: l.itemCode ?? undefined,
        itemName: l.itemName,
        description: l.description ?? undefined,
        quantity: l.quantity.toNumber(),
        unit: l.unit ?? undefined,
        unitPrice: l.unitPrice.toNumber(),
        unitPriceUf: l.unitPriceUf?.toNumber(),
        discountPct: l.discountPct.toNumber(),
        isExempt: l.isExempt,
        accountId: l.accountId ?? undefined,
      })),
    });

    return NextResponse.json({ success: true, data: draft }, { status: 201 });
  } catch (error) {
    if (isTemplateLinkRequiredError(error)) {
      return templateLinkRequiredResponse(error);
    }
    console.error("[Finance/Billing] Duplicate-as-draft error:", error);
    const message = error instanceof Error ? error.message : "Error al duplicar";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
