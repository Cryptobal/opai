/**
 * API Route: /api/crm/deals/[id]
 * GET   - Obtener negocio
 * PATCH - Actualizar negocio
 * DELETE - Eliminar negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { createDealSchema } from "@/lib/validations/crm";
import { computeChangedFields, createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';
import {
  buildDealDeleteImpact,
  resolveDealQuoteIds,
} from "@/modules/cpq/quote-delete-impact";
import { deleteQuoteToTrash } from "@/modules/cpq/quote-trash.service";
import {
  cascadeCancelDealAgenda,
  loadDealInstallationImpact,
} from "@/modules/crm/deal-delete-cascade";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;

    const deal = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        stage: true,
        primaryContact: true,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: deal });
  } catch (error) {
    console.error("Error fetching deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch deal" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, createDealSchema.partial());
    if (parsed.error) return parsed.error;

    const raw = parsed.data as Record<string, unknown>;
    const data = { ...raw };
    if (data.expectedCloseDate)
      data.expectedCloseDate = new Date(data.expectedCloseDate as string);
    // Edición directa de la fecha de inicio del servicio (negocio adjudicado).
    // Se acepta null para limpiarla. Fecha-only → mediodía UTC para evitar corrimiento de día por zona horaria.
    if ("serviceStartDate" in raw) {
      const v = raw.serviceStartDate as string | null | undefined;
      data.serviceStartDate = v ? new Date(`${v}T12:00:00Z`) : null;
    }
    if ("fechaEntrega" in raw) {
      const v = raw.fechaEntrega as string | null | undefined;
      data.fechaEntrega = v ? new Date(`${v}T12:00:00Z`) : null;
    }
    // isLicitacion ya no exige fechaEntrega: la entrega se agenda en
    // Agenda del negocio (no como banda all-day sync a Google).

    if ("activeQuotationId" in raw) {
      const nextActiveQuotationId = raw.activeQuotationId as string | null | undefined;
      if (nextActiveQuotationId) {
        const [quoteLink, sentQuote] = await Promise.all([
          prisma.crmDealQuote.findFirst({
            where: {
              tenantId: ctx.tenantId,
              dealId: id,
              quoteId: nextActiveQuotationId,
            },
            select: { id: true },
          }),
          prisma.cpqQuote.findFirst({
            where: {
              tenantId: ctx.tenantId,
              id: nextActiveQuotationId,
              status: { in: ["sent", "approved"] },
            },
            select: { id: true },
          }),
        ]);

        if (!quoteLink || !sentQuote) {
          return NextResponse.json(
            {
              success: false,
              error:
                "La cotización activa debe estar vinculada al negocio y en estado enviada o aprobada.",
            },
            { status: 400 }
          );
        }
      }

      data.activeQuotationId = nextActiveQuotationId ?? null;
    }

    const result = await prisma.crmDeal.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data,
    });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }
    const deal = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        stage: true,
        primaryContact: true,
      },
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      data
    );
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "deal",
      entityId: id,
      action: "deal_updated",
      details: {
        changedFields: diff.changedFields,
        changes: diff.changes,
      },
      createdBy: ctx.userId,
    });

    // Cleanup legacy: cancelar en Google cualquier banda all-day de licitación.
    if ("isLicitacion" in raw || "fechaEntrega" in raw || "status" in raw) {
      void import("@/modules/agenda/agenda-sync").then(({ syncLicitacionToCalendar }) =>
        syncLicitacionToCalendar(ctx.tenantId, id, "delete", { actorUserId: ctx.userId }).catch(
          (err) => console.warn("[deals] licitacion calendar cancel:", err),
        ),
      );
    }

    // Si pasó a licitación (o ya lo es y se editó), asegurar carpeta Drive.
    if (deal?.isLicitacion && ("isLicitacion" in raw || Boolean(existing.isLicitacion))) {
      void import("@/lib/google-workspace/drive-deal-folder").then(({ ensureLicitacionDriveFolder }) =>
        ensureLicitacionDriveFolder(ctx.tenantId, id),
      );
    }

    if ("serviceStartDate" in raw) {
      // Mantener alineadas la ficha CRM, el onboarding y el canvas Slack.
      // El update principal ya persistió el deal; este helper sincroniza las
      // superficies dependientes y evita que onboarding conserve la fecha vieja.
      const { updateDealStartDate } = await import(
        "@/lib/crm/update-deal-start-date"
      );
      const value = raw.serviceStartDate as string | null | undefined;
      await updateDealStartDate({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        dealId: id,
        serviceStartDate: value || null,
      });
    }

    return NextResponse.json({ success: true, data: deal });
  } catch (error) {
    console.error("Error updating deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update deal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const tenantId = ctx.tenantId;
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";
    const reason = url.searchParams.get("reason")?.trim() || null;
    const deleteInstallationParam = url.searchParams.get("deleteInstallation");
    const wantDeleteInstallation = deleteInstallationParam === "true";

    const existing = await prisma.crmDeal.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    // Cotizaciones del negocio: FK directa (dealId) ∪ links crm.deal_quotes.
    const [quoteIds, impact, bundles] = await Promise.all([
      resolveDealQuoteIds(tenantId, id),
      buildDealDeleteImpact(tenantId, id),
      prisma.cpqProposalBundle.findMany({
        where: { tenantId, dealId: id },
        select: { id: true },
      }),
    ]);
    const bundleIds = bundles.map((b) => b.id);

    if (impact && impact.blockers.length > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          error: "El negocio tiene cotizaciones con dependencias que impiden eliminarlas",
          blockers: impact.blockers,
        },
        { status: 409 }
      );
    }

    // Agenda + Google ANTES de borrar el deal (fuera de la transacción).
    const agendaCascade = await cascadeCancelDealAgenda({
      tenantId,
      dealId: id,
      actorUserId: ctx.userId,
    });

    const installationImpact =
      impact?.installation ??
      (await loadDealInstallationImpact(tenantId, id, quoteIds));
    const installationIdToDelete =
      wantDeleteInstallation &&
      installationImpact?.canDelete &&
      installationImpact.id
        ? installationImpact.id
        : null;

    // Cascada real: cada cotización va a la papelera (restaurable), las
    // propuestas se eliminan (unlink — sus membresías caen por FK cascade) y
    // finalmente el negocio (stageHistory, dealQuotes, tasks caen por cascade).
    const trashedQuoteIds: string[] = [];
    let installationDeleted = false;
    await prisma.$transaction(async (tx) => {
      for (const quoteId of quoteIds) {
        await deleteQuoteToTrash({ tx, tenantId, quoteId, userId: ctx.userId, reason });
        trashedQuoteIds.push(quoteId);
      }
      if (bundleIds.length > 0) {
        await tx.cpqProposalBundle.deleteMany({
          where: { id: { in: bundleIds }, tenantId },
        });
      }
      if (installationIdToDelete) {
        // Desvincular cotizaciones en papelera para poder borrar la instalación.
        await tx.cpqQuote.updateMany({
          where: { tenantId, installationId: installationIdToDelete },
          data: { installationId: null },
        });
        await tx.agendaVisita.updateMany({
          where: { tenantId, installationId: installationIdToDelete },
          data: { installationId: null },
        });
        const deleted = await tx.crmInstallation.deleteMany({
          where: { id: installationIdToDelete, tenantId },
        });
        installationDeleted = deleted.count > 0;
      }
      await tx.crmDeal.delete({ where: { id } });
      await createCrmHistoryLog(
        {
          tenantId,
          entityType: "deal",
          entityId: id,
          action: "deal_deleted",
          details: {
            title: existing.title,
            accountId: existing.accountId,
            cascaded: {
              quotes: trashedQuoteIds,
              bundles: bundleIds,
              agendaEvents: agendaCascade.deletedVisitas,
              licitacionLinkDeleted: agendaCascade.licitacionLinkDeleted,
              installationId: installationIdToDelete,
              installationDeleted,
              googleErrors: agendaCascade.googleErrors,
            },
            reason,
          },
          createdBy: ctx.userId,
        },
        tx as unknown as Parameters<typeof createCrmHistoryLog>[1],
      );
    });

    return NextResponse.json({
      success: true,
      cascaded: {
        quotes: trashedQuoteIds.length,
        bundles: bundleIds.length,
        agendaEvents: agendaCascade.deletedVisitas.length,
        licitacionBands: agendaCascade.licitacionLinkDeleted ? 1 : 0,
        installationDeleted,
        googleErrors: agendaCascade.googleErrors.length,
      },
    });
  } catch (error) {
    console.error("Error deleting deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}
