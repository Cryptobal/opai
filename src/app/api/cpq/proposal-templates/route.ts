/**
 * API Route: /api/cpq/proposal-templates
 * GET  - Listar templates de propuesta disponibles
 * POST - Crear template personalizado para el tenant
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
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
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const templates = await prisma.cpqProposalTemplate.findMany({
      where: {
        active: true,
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
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

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const name = body?.name?.trim();
    const slug = body?.slug?.trim();
    const sections = body?.sections ?? {};

    if (!name || !slug) {
      return NextResponse.json(
        { success: false, error: "name and slug are required" },
        { status: 400 },
      );
    }

    const template = await prisma.cpqProposalTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        slug,
        description: body?.description?.trim() || null,
        sections,
        isDefault: body?.isDefault ?? false,
        active: true,
      },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un template con ese slug para este tenant" },
        { status: 409 },
      );
    }
    console.error("Error creating proposal template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 },
    );
  }
}
