/**
 * API Route: Exportar cotización CPQ como PDF
 * GET  /api/cpq/quotes/[id]/export-pdf?templateSlug=... — preview con template específico
 * POST /api/cpq/quotes/[id]/export-pdf — descarga usando el template guardado en la quote
 *
 * Returns a real PDF (application/pdf) generated with @react-pdf/renderer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildQuotationProps } from '@/lib/pdf/templates/quotation/build-quotation-props';
import { renderQuotationToBuffer } from '@/lib/pdf/templates/quotation/render-quotation';
import { prisma } from '@/lib/prisma';
import type { ProposalTemplateSections } from '@/types/cpq';

export const runtime = 'nodejs';

const DEFAULT_TEMPLATES_MAP: Record<string, Partial<ProposalTemplateSections>> = {
  standard: {
    showCoverPage: true, showCompanyIntro: true, showPositionsTable: true,
    showCostBreakdown: false, showCostSummaryByCategory: false, showLaborDetail: false,
    showEquipmentDetail: false, showVehicleDetail: false, showAdditionalServices: true,
    showConditions: true, showIncludedItems: true, showSignature: true,
    showComplianceSection: false, numberedSections: false, headerStyle: 'standard',
  },
  detailed: {
    showCoverPage: true, showCompanyIntro: true, showPositionsTable: true,
    showCostBreakdown: true, showCostSummaryByCategory: true, showLaborDetail: true,
    showEquipmentDetail: true, showVehicleDetail: true, showAdditionalServices: true,
    showConditions: true, showIncludedItems: true, showSignature: true,
    showComplianceSection: false, numberedSections: false, headerStyle: 'detailed',
  },
  tender: {
    showCoverPage: true, showCompanyIntro: true, showPositionsTable: true,
    showCostBreakdown: true, showCostSummaryByCategory: true, showLaborDetail: true,
    showEquipmentDetail: true, showVehicleDetail: true, showAdditionalServices: true,
    showConditions: true, showIncludedItems: true, showSignature: true,
    showComplianceSection: true, numberedSections: true, headerStyle: 'formal',
  },
};

async function resolveTemplateSections(
  templateSlug: string,
  tenantId: string,
): Promise<Partial<ProposalTemplateSections> | null> {
  const dbTemplate = await prisma.cpqProposalTemplate.findFirst({
    where: {
      slug: templateSlug,
      active: true,
      OR: [{ tenantId }, { tenantId: null }],
    },
  });
  if (dbTemplate) return (dbTemplate.sections ?? {}) as Partial<ProposalTemplateSections>;
  return DEFAULT_TEMPLATES_MAP[templateSlug] ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const templateSlug = request.nextUrl.searchParams.get('templateSlug');

    let templateSectionsOverride: Partial<ProposalTemplateSections> | undefined;
    if (templateSlug) {
      const sections = await resolveTemplateSections(templateSlug, tenantId);
      if (!sections) {
        return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
      }
      templateSectionsOverride = sections;
    }

    const { fileName, ...props } = await buildQuotationProps(id, tenantId, {
      templateSectionsOverride,
    });
    const pdfBuffer = await renderQuotationToBuffer(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating CPQ PDF preview:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: `Failed to generate PDF: ${msg}` }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const tenantId = session.user.tenantId;
    const { fileName, ...props } = await buildQuotationProps(id, tenantId);
    const pdfBuffer = await renderQuotationToBuffer(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating CPQ PDF:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Failed to generate PDF: ${msg}` },
      { status: 500 },
    );
  }
}
