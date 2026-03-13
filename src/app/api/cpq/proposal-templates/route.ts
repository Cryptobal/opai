/**
 * API Route: /api/cpq/proposal-templates
 * GET - Listar templates de propuesta disponibles
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_TEMPLATES = [
  {
    id: "__default_standard",
    name: "Estándar",
    slug: "standard",
    description: "Tabla resumen, ideal para retail y oficinas",
    sections: {
      showCoverPage: true,
      showCompanyIntro: true,
      showPositionsTable: true,
      showCostBreakdown: false,
      showCostSummaryByCategory: false,
      showLaborDetail: false,
      showEquipmentDetail: false,
      showVehicleDetail: false,
      showAdditionalServices: true,
      showConditions: true,
      showIncludedItems: true,
      showSignature: true,
      showComplianceSection: false,
      numberedSections: false,
      headerStyle: "standard",
    },
  },
  {
    id: "__default_detailed",
    name: "Detallado",
    slug: "detailed",
    description: "Desglose por categoría, transparencia total",
    sections: {
      showCoverPage: true,
      showCompanyIntro: true,
      showPositionsTable: true,
      showCostBreakdown: true,
      showCostSummaryByCategory: true,
      showLaborDetail: true,
      showEquipmentDetail: true,
      showVehicleDetail: true,
      showAdditionalServices: true,
      showConditions: true,
      showIncludedItems: true,
      showSignature: true,
      showComplianceSection: false,
      numberedSections: false,
      headerStyle: "detailed",
    },
  },
  {
    id: "__default_tender",
    name: "Licitación",
    slug: "tender",
    description: "Formato formal con cumplimiento normativo",
    sections: {
      showCoverPage: true,
      showCompanyIntro: true,
      showPositionsTable: true,
      showCostBreakdown: true,
      showCostSummaryByCategory: true,
      showLaborDetail: true,
      showEquipmentDetail: true,
      showVehicleDetail: true,
      showAdditionalServices: true,
      showConditions: true,
      showIncludedItems: true,
      showSignature: true,
      showComplianceSection: true,
      numberedSections: true,
      headerStyle: "formal",
    },
  },
];

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const templates = await prisma.cpqProposalTemplate.findMany({
      where: {
        active: true,
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
      },
      orderBy: { name: "asc" },
    });

    if (templates.length === 0) {
      return NextResponse.json({ success: true, data: DEFAULT_TEMPLATES });
    }

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("Error fetching proposal templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch templates" },
      { status: 500 },
    );
  }
}
