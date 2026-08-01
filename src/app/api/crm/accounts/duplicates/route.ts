/**
 * API Route: /api/crm/accounts/duplicates
 * GET ?q=...     — Buscar cuentas con nombres similares a un query
 * GET ?mode=scan — Escanear el tenant y devolver clusters de posibles duplicados
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import {
  clusterDuplicateAccounts,
  normalizeAccountName,
  scoreAccountsAgainstQuery,
  type DuplicateAccountCandidate,
} from "@/lib/crm/account-duplicates";

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  rut: true,
  legalName: true,
  type: true,
  status: true,
  isActive: true,
  createdAt: true,
  _count: {
    select: {
      contacts: true,
      deals: true,
      installations: true,
    },
  },
} as const;

async function loadTenantAccounts(tenantId: string): Promise<DuplicateAccountCandidate[]> {
  return prisma.crmAccount.findMany({
    where: { tenantId },
    select: ACCOUNT_SELECT,
    orderBy: { name: "asc" },
    take: 5000,
  });
}

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "accounts");
    if (forbidden) return forbidden;

    const mode = request.nextUrl.searchParams.get("mode")?.trim() || "search";

    if (mode === "scan") {
      const accounts = await loadTenantAccounts(ctx.tenantId);
      const clusters = clusterDuplicateAccounts(accounts);
      return NextResponse.json({
        success: true,
        data: {
          totalAccounts: accounts.length,
          clusters,
        },
      });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const words = normalizeAccountName(q).split(/\s+/).filter(Boolean);
    const mainWord = words[0] ?? q;

    const accounts = await prisma.crmAccount.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { name: { contains: mainWord, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: ACCOUNT_SELECT,
      orderBy: { name: "asc" },
      take: 100,
    });

    const scored = scoreAccountsAgainstQuery(accounts, q, 0.45);
    return NextResponse.json({ success: true, data: scored });
  } catch (error) {
    console.error("[CRM] Error buscando duplicados:", error);
    return NextResponse.json(
      { success: false, error: "Error buscando duplicados" },
      { status: 500 }
    );
  }
}
