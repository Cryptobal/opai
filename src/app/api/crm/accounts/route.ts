/**
 * API Route: /api/crm/accounts
 * GET  - Listar clientes
 * POST - Crear cliente
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { canView } from "@/lib/permissions";
import { createAccountSchema } from "@/lib/validations/crm";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';
import {
  listCrmAccounts,
  type AccountLifecycle,
  type AccountSort,
} from "@/lib/crm/list-accounts";

function normalizeLifecycle(input?: string | null): AccountLifecycle | null {
  if (input === "prospect" || input === "client_active" || input === "client_inactive") {
    return input;
  }
  return null;
}

function resolveLifecycleFromInput(input: {
  status?: string | null;
  type?: "prospect" | "client" | null;
  isActive?: boolean | null;
}): AccountLifecycle {
  const normalized = normalizeLifecycle(input.status);
  if (normalized) return normalized;
  if (input.type === "prospect") return "prospect";
  if (input.type === "client" && input.isActive === false) return "client_inactive";
  if (input.status === "inactive") return "client_inactive";
  return "client_active";
}

function lifecycleToLegacyFields(lifecycle: AccountLifecycle) {
  if (lifecycle === "prospect") {
    return { type: "prospect" as const, isActive: false, status: "prospect" };
  }
  if (lifecycle === "client_inactive") {
    return { type: "client" as const, isActive: false, status: "client_inactive" };
  }
  return { type: "client" as const, isActive: true, status: "client_active" };
}

function parseLifecycle(raw: string | null): AccountLifecycle | "all" | undefined {
  if (!raw) return undefined;
  if (raw === "all" || raw === "prospect" || raw === "client_active" || raw === "client_inactive") {
    return raw;
  }
  return undefined;
}

function parseSort(raw: string | null): AccountSort | undefined {
  if (raw === "az" || raw === "za" || raw === "newest" || raw === "oldest") return raw;
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "accounts");
    if (forbidden) return forbidden;

    const perms = await resolveApiPerms(ctx);
    const canSeeLeads = canView(perms, "crm", "leads");

    const sp = request.nextUrl.searchParams;
    const type = sp.get("type") || undefined;
    const activeRaw = sp.get("active");
    const active = activeRaw === "true" || activeRaw === "false" ? activeRaw : undefined;
    const status = sp.get("status") || undefined;
    const search = sp.get("search") || undefined;
    const lifecycle = parseLifecycle(sp.get("lifecycle"));
    const sort = parseSort(sp.get("sort"));
    const includeCounts = sp.get("includeCounts") === "true";

    // Paginación opt-in: `limit`/`page`/`pageSize`. Sin ellos se mantiene
    // el comportamiento legacy (lista completa) para dropdowns y consumidores.
    const limitRaw = sp.get("limit") ?? sp.get("pageSize");
    const pageRaw = sp.get("page");
    const paginated = limitRaw != null || pageRaw != null;
    const pageSize = limitRaw != null ? Number.parseInt(limitRaw, 10) : undefined;
    const page = pageRaw != null ? Number.parseInt(pageRaw, 10) : undefined;

    const result = await listCrmAccounts({
      tenantId: ctx.tenantId,
      canSeeLeads,
      lifecycle,
      search,
      sort,
      type,
      active,
      status,
      includeCounts: includeCounts || paginated,
      ...(paginated
        ? {
            page: Number.isFinite(page) ? page : 1,
            pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
          }
        : {}),
    });

    if (!paginated) {
      return NextResponse.json({ success: true, data: result.accounts });
    }

    return NextResponse.json({
      success: true,
      data: result.accounts,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.hasMore,
        counts: result.counts,
      },
    });
  } catch (error) {
    console.error("Error fetching CRM accounts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch accounts" },
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
    const forbidden = await requireCrmEdit(ctx, "accounts");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const lifecycle = resolveLifecycleFromInput({
      status: body.status,
      type: body.type,
      isActive: body.isActive,
    });
    const legacy = lifecycleToLegacyFields(lifecycle);

    const account = await prisma.crmAccount.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        rut: body.rut || null,
        legalName: body.legalName || null,
        legalRepresentativeName: body.legalRepresentativeName || null,
        legalRepresentativeRut: body.legalRepresentativeRut || null,
        industry: body.industry || null,
        giro: body.giro || null,
        segment: body.segment || null,
        ownerId: ctx.userId,
        type: legacy.type,
        status: legacy.status,
        isActive: legacy.isActive,
        website: body.website || null,
        address: body.address || null,
        commune: body.commune || null,
        city: body.city || null,
        notes: body.notes || null,
      },
    });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "account",
      entityId: account.id,
      action: "account_created",
      details: {
        name: account.name,
        type: account.type,
        status: account.status,
        isActive: account.isActive,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create account" },
      { status: 500 }
    );
  }
}
