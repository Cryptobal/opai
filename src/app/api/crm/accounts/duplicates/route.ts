/**
 * API Route: /api/crm/accounts/duplicates
 * GET  - Buscar cuentas con nombres similares (para deduplicación)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // Levenshtein distance
  const la = na.length;
  const lb = nb.length;
  if (la === 0 || lb === 0) return 0;

  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] =
        na[i - 1] === nb[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  const maxLen = Math.max(la, lb);
  return 1 - dp[la][lb] / maxLen;
}

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "accounts");
    if (forbidden) return forbidden;

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Traer todas las cuentas que contengan alguna palabra clave
    const words = normalize(q).split(/\s+/).filter(Boolean);
    const mainWord = words[0] ?? q;

    const accounts = await prisma.crmAccount.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { name: { contains: mainWord, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
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
      },
      orderBy: { name: "asc" },
      take: 100,
    });

    // Calcular similitud con el query y filtrar
    const THRESHOLD = 0.45;
    const scored = accounts
      .map((acc) => ({ ...acc, score: similarity(acc.name, q) }))
      .filter((acc) => acc.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({ success: true, data: scored });
  } catch (error) {
    console.error("Error buscando duplicados:", error);
    return NextResponse.json(
      { success: false, error: "Error buscando duplicados" },
      { status: 500 }
    );
  }
}
