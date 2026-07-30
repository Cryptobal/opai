/**
 * API Route: /api/cpq/bundles/[id]/quotes
 * POST   - Agregar instalación (existente/nueva) + cotización
 * PATCH  - Reordenar / incluir-excluir del envío
 * DELETE - Desvincular cotización (no borra la CpqQuote)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureCanCreateQuote } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { BundleServiceError } from "@/modules/cpq/bundles/bundle.service";
import {
  addInstallationToBundle,
  patchBundleQuotes,
  removeQuoteFromBundle,
} from "@/modules/cpq/bundles/bundle-members.service";

export const runtime = "nodejs";

export async function POST(
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
    const forbiddenCreate = await ensureCanCreateQuote(ctx);
    if (forbiddenCreate) return forbiddenCreate;

    const { id: bundleId } = await params;
    const body = await request.json().catch(() => ({}));

    try {
      const result = await addInstallationToBundle({
        tenantId: ctx.tenantId,
        bundleId,
        userId: ctx.userId,
        installationId: body?.installationId ?? null,
        newInstallation: body?.newInstallation ?? null,
        cloneFromQuoteId: body?.cloneFromQuoteId ?? null,
        existingQuoteId: body?.existingQuoteId ?? null,
        quoteName: body?.quoteName ?? null,
      });
      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (e) {
      if (e instanceof BundleServiceError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: e.status },
        );
      }
      if (e instanceof Error && e.message === "QUOTE_NOT_FOUND") {
        return NextResponse.json(
          { success: false, error: "Cotización fuente no encontrada" },
          { status: 404 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[cpq/bundles/quotes POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al agregar instalación" },
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

    const { id: bundleId } = await params;
    const body = await request.json().catch(() => ({}));
    const updates = Array.isArray(body?.updates) ? body.updates : null;
    if (!updates) {
      return NextResponse.json(
        { success: false, error: "updates[] es requerido" },
        { status: 400 },
      );
    }

    try {
      const result = await patchBundleQuotes({
        tenantId: ctx.tenantId,
        bundleId,
        updates,
      });
      return NextResponse.json({ success: true, data: result });
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
    console.error("[cpq/bundles/quotes PATCH]", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar miembros" },
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
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id: bundleId } = await params;
    const quoteId =
      new URL(request.url).searchParams.get("quoteId")?.trim() ||
      (await request.json().catch(() => ({})))?.quoteId?.trim();

    if (!quoteId) {
      return NextResponse.json(
        { success: false, error: "quoteId es requerido" },
        { status: 400 },
      );
    }

    try {
      const result = await removeQuoteFromBundle({
        tenantId: ctx.tenantId,
        bundleId,
        quoteId,
      });
      return NextResponse.json({ success: true, data: result });
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
    console.error("[cpq/bundles/quotes DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Error al desvincular cotización" },
      { status: 500 },
    );
  }
}
