/**
 * API Route: /api/crm/accounts
 * GET  - Listar clientes
 * POST - Crear cliente
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { createAccountSchema } from "@/lib/validations/crm";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';
import { getInstallationContractCoverage } from "@/lib/crm/installation-contracts";

type AccountLifecycle = "prospect" | "client_active" | "client_inactive";

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

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "accounts");
    if (forbidden) return forbidden;

    const type = request.nextUrl.searchParams.get("type") || undefined;
    const active = request.nextUrl.searchParams.get("active");
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const search = request.nextUrl.searchParams.get("search") || undefined;

    const accounts = await prisma.crmAccount.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(type ? { type } : {}),
        ...(active === "true" ? { isActive: true } : {}),
        ...(active === "false" ? { isActive: false } : {}),
        ...(status ? { status } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      include: {
        installations: {
          orderBy: { name: "asc" },
          // status: necesario para excluir las inactivas/prospect del badge
          // "Contrato X/Y" — el denominador debe contar sólo instalaciones
          // donde un contrato es relevante.
          select: { id: true, status: true },
        },
        _count: { select: { contacts: true, deals: true, installations: true } },
      },
      orderBy: { name: "asc" },
    });

    const contractCoverage = await getInstallationContractCoverage({
      tenantId: ctx.tenantId,
      installationIds: accounts.flatMap((account) => account.installations.map((installation) => installation.id)),
    });

    const data = accounts.map(({ installations, ...account }) => {
      // Sólo las instalaciones activas pesan para el cálculo de cobertura
      // de contratos. Una instalación inactiva o en estado prospect no
      // requiere contrato y no debe contar en el denominador.
      const activeInstallations = installations.filter(
        (installation) => installation.status === "active",
      );
      const statuses = activeInstallations.map(
        (installation) =>
          contractCoverage.get(installation.id)?.status ?? "sin_documento",
      );
      const withContract = statuses.filter((status) => status !== "sin_documento").length;
      const expiredContract = statuses.filter((status) => status === "vencido").length;
      const expiringContract = statuses.filter((status) => status === "por_vencer").length;

      return {
        ...account,
        contractCoverage: {
          totalInstallations: activeInstallations.length,
          withContract,
          missingContract: activeInstallations.length - withContract,
          expiredContract,
          expiringContract,
        },
      };
    });

    return NextResponse.json({ success: true, data });
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
