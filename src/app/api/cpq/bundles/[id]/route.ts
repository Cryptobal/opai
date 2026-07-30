/**
 * API Route: /api/cpq/bundles/[id]
 * GET   - Detalle + totales consolidados + sync status
 * PATCH - Actualizar metadata (name, validUntil, status, portal, …)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  BundleServiceError,
  getBundleById,
  syncStatusFromBundle,
  totalsFromBundle,
  updateBundle,
} from "@/modules/cpq/bundles/bundle.service";
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
        },
      });
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
