/**
 * API Route: /api/cpq/bundles/[id]
 * GET   - Detalle + totales consolidados + sync status
 * PATCH - Actualizar metadata (name, validUntil, status, portal, …)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit, requireQuoteDelete } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  BUNDLE_CONDITION_PATCH_KEYS,
  BundleDeleteBlockedError,
  BundleServiceError,
  deleteBundle,
  getBundleById,
  syncStatusFromBundle,
  totalsFromBundle,
  updateBundle,
} from "@/modules/cpq/bundles/bundle.service";
import { propagateBundleConditions } from "@/modules/cpq/bundles/propagate-bundle-conditions";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    try {
      const bundle = await getBundleById({
        tenantId: ctx.tenantId,
        bundleId: id,
      });
      const totals = totalsFromBundle(bundle);
      const sync = syncStatusFromBundle(bundle);

      let deal: { id: string; title: string } | null = null;
      let account: { id: string; name: string } | null = null;
      let contact: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
      } | null = null;

      if (bundle.dealId) {
        deal = await prisma.crmDeal.findFirst({
          where: { id: bundle.dealId, tenantId: ctx.tenantId },
          select: { id: true, title: true },
        });
      }
      if (bundle.accountId) {
        account = await prisma.crmAccount.findFirst({
          where: { id: bundle.accountId, tenantId: ctx.tenantId },
          select: { id: true, name: true },
        });
      }
      if (bundle.contactId) {
        contact = await prisma.crmContact.findFirst({
          where: { id: bundle.contactId, tenantId: ctx.tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          ...bundle,
          totals,
          conditionsSynced: sync.synced,
          deal,
          account,
          contact,
        },
      });
    } catch (e) {
      if (e instanceof BundleServiceError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: e.status },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[cpq/bundles/[id] GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener propuesta" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    try {
      const updated = await updateBundle({
        tenantId: ctx.tenantId,
        bundleId: id,
        data: {
          name: body?.name,
          validUntil: body?.validUntil,
          status: body?.status,
          visibleInClientPortal: body?.visibleInClientPortal,
          notes: body?.notes,
          contactId: body?.contactId,
          currency: body?.currency,
          paymentTerms: body?.paymentTerms,
          serviceStartDays: body?.serviceStartDays,
          contractDuration: body?.contractDuration,
          isOngoingService: body?.isOngoingService,
          adjustmentType: body?.adjustmentType,
          adjustmentFreq: body?.adjustmentFreq,
          ipcWeight: body?.ipcWeight,
          imoWeight: body?.imoWeight,
          insurancePolicyUF: body?.insurancePolicyUF,
          liabilityMonths: body?.liabilityMonths,
          realAnnualIncrement: body?.realAnnualIncrement,
          paymentDays: body?.paymentDays,
          paymentDayMode: body?.paymentDayMode,
          financialEnabled: body?.financialEnabled,
          financialRatePct: body?.financialRatePct,
        },
      });

      // Condiciones/financiero a nivel propuesta → propagación automática a
      // todas las hijas + recálculo (sin botón "Aplicar a todas").
      const conditionKeys = BUNDLE_CONDITION_PATCH_KEYS.filter(
        (key) => body?.[key] !== undefined,
      );
      if (conditionKeys.length > 0) {
        await propagateBundleConditions({
          tenantId: ctx.tenantId,
          bundleId: id,
        });
        await createCrmHistoryLog({
          tenantId: ctx.tenantId,
          entityType: "bundle",
          entityId: id,
          action: "bundle_conditions_updated",
          details: {
            fields: conditionKeys,
            values: Object.fromEntries(
              conditionKeys.map((key) => [key, body?.[key] ?? null]),
            ),
          },
          createdBy: ctx.userId ?? null,
        });
      }

      return NextResponse.json({ success: true, data: updated });
    } catch (e) {
      if (e instanceof BundleServiceError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: e.status },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[cpq/bundles/[id] PATCH]", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar propuesta" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
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
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "cascade" ? "cascade" : "unlink";
    const force = url.searchParams.get("force") === "true";
    const reason = url.searchParams.get("reason")?.trim() || null;

    try {
      const result = await deleteBundle({
        tenantId: ctx.tenantId,
        bundleId: id,
        mode,
        userId: ctx.userId,
        force,
        reason,
      });
      return NextResponse.json({ success: true, data: result });
    } catch (e) {
      if (e instanceof BundleDeleteBlockedError) {
        return NextResponse.json(
          {
            success: false,
            error: "La propuesta tiene cotizaciones con dependencias que impiden eliminarlas",
            blockers: e.blockers,
          },
          { status: 409 },
        );
      }
      if (e instanceof BundleServiceError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: e.status },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[cpq/bundles/[id] DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar propuesta" },
      { status: 500 },
    );
  }
}
