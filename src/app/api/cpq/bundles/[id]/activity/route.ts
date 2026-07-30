/**
 * API Route: /api/cpq/bundles/[id]/activity
 * GET - Auditoría consolidada: eventos del bundle + de todas sus cotizaciones
 *       hijas, ordenados por fecha desc.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_EVENTS = 200;

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
    const bundle = await prisma.cpqProposalBundle.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!bundle) {
      return NextResponse.json(
        { success: false, error: "Propuesta no encontrada" },
        { status: 404 },
      );
    }

    const members = await prisma.cpqProposalBundleQuote.findMany({
      where: { bundleId: id, tenantId: ctx.tenantId },
      orderBy: { displayOrder: "asc" },
      select: {
        quoteId: true,
        quote: {
          select: { code: true, installation: { select: { name: true } } },
        },
      },
    });
    const quoteLabels = new Map(
      members.map((m) => [
        m.quoteId,
        m.quote.installation?.name || m.quote.code,
      ]),
    );

    const logs = await prisma.crmHistoryLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { entityType: "bundle", entityId: id },
          {
            entityType: "quote",
            entityId: { in: members.map((m) => m.quoteId) },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTS,
    });

    const actorIds = Array.from(
      new Set(logs.map((l) => l.createdBy).filter((v): v is string => Boolean(v))),
    );
    const actors = actorIds.length
      ? await prisma.admin.findMany({
          where: { tenantId: ctx.tenantId, id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.name]));

    return NextResponse.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        details: {
          ...((log.details as Record<string, unknown>) ?? {}),
          ...(log.entityType === "quote"
            ? { instalación: quoteLabels.get(log.entityId) ?? null }
            : {}),
        },
        scope: log.entityType === "bundle" ? "propuesta" : "instalación",
        scopeLabel:
          log.entityType === "bundle"
            ? "Propuesta"
            : quoteLabels.get(log.entityId) ?? "Instalación",
        createdAt: log.createdAt.toISOString(),
        createdBy: log.createdBy ?? null,
        createdByName: log.createdBy ? actorMap.get(log.createdBy) ?? null : null,
      })),
    });
  } catch (error) {
    console.error("[cpq/bundles/activity]", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar la auditoría" },
      { status: 500 },
    );
  }
}
