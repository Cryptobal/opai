/**
 * API Route: /api/crm/installations
 * GET  - Listar instalaciones (filtro por accountId)
 * POST - Crear instalación
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { createInstallationSchema } from "@/lib/validations/crm";
import { toSentenceCase } from "@/lib/text-format";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';
import { canView } from "@/lib/permissions";
import {
  listCrmInstallations,
  type InstallationStatusFilter,
  type InstallationListSort,
} from "@/lib/crm/list-installations";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "installations");
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;
    const accountId = sp.get("accountId") || undefined;
    const search = sp.get("search") || undefined;
    const statusRaw = sp.get("status");
    const status = (
      statusRaw === "all" || statusRaw === "active" || statusRaw === "inactive"
        ? statusRaw
        : undefined
    ) as InstallationStatusFilter | undefined;
    const sortRaw = sp.get("sort");
    const sort = (
      sortRaw === "az" || sortRaw === "za" || sortRaw === "newest" || sortRaw === "oldest"
        ? sortRaw
        : undefined
    ) as InstallationListSort | undefined;
    const includeCounts = sp.get("includeCounts") === "true";
    const limitRaw = sp.get("limit") ?? sp.get("pageSize");
    const pageRaw = sp.get("page");
    const paginated = limitRaw != null || pageRaw != null;

    const perms = await resolveApiPerms(ctx);
    const canSeeDeals = canView(perms, "crm", "deals");

    const result = await listCrmInstallations({
      tenantId: ctx.tenantId,
      accountId,
      search,
      status,
      sort,
      canSeeDeals,
      includeCounts: includeCounts || paginated,
      ...(paginated
        ? {
            page: pageRaw != null ? Number.parseInt(pageRaw, 10) : 1,
            pageSize: limitRaw != null ? Number.parseInt(limitRaw, 10) : undefined,
          }
        : {}),
    });

    if (!paginated) {
      return NextResponse.json({ success: true, data: result.installations });
    }

    return NextResponse.json({
      success: true,
      data: result.installations,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.hasMore,
        counts: result.counts,
      },
    });
  } catch (error) {
    console.error("Error fetching installations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch installations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "installations");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createInstallationSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;
    const installationName = toSentenceCase(body.name);
    if (!installationName) {
      return NextResponse.json(
        { success: false, error: "Nombre de instalación inválido" },
        { status: 400 }
      );
    }

    // Verify account belongs to tenant
    const account = await prisma.crmAccount.findFirst({
      where: { id: body.accountId, tenantId: ctx.tenantId },
      select: { id: true, isActive: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }
    if (body.status === "active" && !account.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "No puedes crear una instalación activa para una cuenta inactiva",
        },
        { status: 400 }
      );
    }

    const status = body.status ?? "prospect";
    const isActive = status === "active";
    const installation = await prisma.crmInstallation.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: body.accountId,
        name: installationName,
        address: body.address || null,
        city: body.city || null,
        commune: body.commune || null,
        lat: body.lat || null,
        lng: body.lng || null,
        status,
        geoRadiusM: body.geoRadiusM ?? 1000,
        teMontoClp: body.teMontoClp ?? 0,
        notes: body.notes || null,
        nocturnoEnabled: isActive,
        chatEnabled: isActive,
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        geoRadiusM: true,
        teMontoClp: true,
        notes: true,
        accountId: true,
        account: { select: { id: true, name: true, type: true, status: true, isActive: true } },
      },
    });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "installation",
      entityId: installation.id,
      action: "installation_created",
      details: {
        name: installation.name,
        accountId: installation.accountId,
        status: installation.status,
      },
      createdBy: ctx.userId,
    });

    // Auto-create finance cost center for active installations
    if (installation.status === "active") {
      await prisma.financeCostCenter.create({
        data: {
          tenantId: ctx.tenantId,
          name: installation.name,
          installationId: installation.id,
          accountId: installation.accountId ?? null,
          active: true,
        },
      });
    }

    return NextResponse.json({ success: true, data: installation }, { status: 201 });
  } catch (error) {
    console.error("Error creating installation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create installation" },
      { status: 500 }
    );
  }
}
