/**
 * API Route: /api/crm/accounts/merge-preview
 * GET  - Devuelve datos completos de ambas cuentas para el wizard de merge:
 *        campos, contactos, negocios, instalaciones, cotizaciones y alertas de similitud.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s@.]/g, "")
    .trim();
}

function stringSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const la = na.length;
  const lb = nb.length;
  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = na[i - 1] === nb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[la][lb] / Math.max(la, lb);
}

type SimilarityAlert = {
  masterRecordId: string;
  duplicateRecordId: string;
  reason: string;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "accounts");
    if (forbidden) return forbidden;

    const masterId = request.nextUrl.searchParams.get("masterId");
    const duplicateId = request.nextUrl.searchParams.get("duplicateId");

    if (!masterId || !duplicateId) {
      return NextResponse.json(
        { success: false, error: "masterId y duplicateId son requeridos" },
        { status: 400 }
      );
    }

    const [master, duplicate] = await Promise.all([
      prisma.crmAccount.findFirst({
        where: { id: masterId, tenantId: ctx.tenantId },
        include: {
          contacts: { orderBy: { createdAt: "asc" } },
          deals: { include: { stage: true }, orderBy: { createdAt: "asc" } },
          installations: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.crmAccount.findFirst({
        where: { id: duplicateId, tenantId: ctx.tenantId },
        include: {
          contacts: { orderBy: { createdAt: "asc" } },
          deals: { include: { stage: true }, orderBy: { createdAt: "asc" } },
          installations: { orderBy: { createdAt: "asc" } },
        },
      }),
    ]);

    if (!master || !duplicate) {
      return NextResponse.json(
        { success: false, error: "Una o ambas cuentas no fueron encontradas" },
        { status: 404 }
      );
    }

    // Fetch quotes for both accounts
    const [masterQuotes, dupQuotes] = await Promise.all([
      prisma.cpqQuote.findMany({
        where: { tenantId: ctx.tenantId, accountId: masterId },
        select: { id: true, code: true, status: true, clientName: true, monthlyCost: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.cpqQuote.findMany({
        where: { tenantId: ctx.tenantId, accountId: duplicateId },
        select: { id: true, code: true, status: true, clientName: true, monthlyCost: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // ── Detect similarities ──
    const contactAlerts: SimilarityAlert[] = [];
    const installationAlerts: SimilarityAlert[] = [];
    const dealAlerts: SimilarityAlert[] = [];

    // Contacts: same email OR very similar full name
    for (const dc of duplicate.contacts) {
      for (const mc of master.contacts) {
        const dupName = `${dc.firstName} ${dc.lastName}`.trim();
        const masterName = `${mc.firstName} ${mc.lastName}`.trim();
        const nameSim = stringSimilarity(dupName, masterName);
        const emailMatch = dc.email && mc.email && normalize(dc.email) === normalize(mc.email);
        if (nameSim >= 0.8 || emailMatch) {
          contactAlerts.push({
            masterRecordId: mc.id,
            duplicateRecordId: dc.id,
            reason: emailMatch ? `Mismo email: ${dc.email}` : `Nombre similar (${Math.round(nameSim * 100)}%): "${masterName}"`,
          });
        }
      }
    }

    // Installations: very similar name
    for (const di of duplicate.installations) {
      for (const mi of master.installations) {
        const sim = stringSimilarity(di.name, mi.name);
        if (sim >= 0.75) {
          installationAlerts.push({
            masterRecordId: mi.id,
            duplicateRecordId: di.id,
            reason: `Instalación similar (${Math.round(sim * 100)}%): "${mi.name}"`,
          });
        }
      }
    }

    // Deals: very similar title
    for (const dd of duplicate.deals) {
      for (const md of master.deals) {
        const sim = stringSimilarity(dd.title, md.title);
        if (sim >= 0.75) {
          dealAlerts.push({
            masterRecordId: md.id,
            duplicateRecordId: dd.id,
            reason: `Negocio similar (${Math.round(sim * 100)}%): "${md.title}"`,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        master: { ...master, quotes: masterQuotes },
        duplicate: { ...duplicate, quotes: dupQuotes },
        similarities: {
          contacts: contactAlerts,
          installations: installationAlerts,
          deals: dealAlerts,
        },
      },
    });
  } catch (error) {
    console.error("Error en merge-preview:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener vista previa" },
      { status: 500 }
    );
  }
}
