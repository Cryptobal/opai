/**
 * API Route: Exportar cotización CPQ como PDF
 * GET  /api/cpq/quotes/[id]/export-pdf?templateSlug=... — preview con template específico
 * POST /api/cpq/quotes/[id]/export-pdf — descarga usando el template guardado en la quote
 *
 * Returns a real PDF (application/pdf) generated with @react-pdf/renderer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  buildQuotationProps,
  normalizeDbSectionsToProposalFormat,
  resolveCanonicalSections,
} from '@/lib/pdf/templates/quotation/build-quotation-props';
import { renderQuotationToBuffer } from '@/lib/pdf/templates/quotation/render-quotation';
import { prisma } from '@/lib/prisma';
import type { ProposalTemplateSections } from '@/types/cpq';

export const runtime = 'nodejs';

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

  if (dbTemplate) {
    const rawSections = (dbTemplate.sections ?? {}) as Record<string, unknown>;
    if (Object.keys(rawSections).length > 0) {
      const normalized = normalizeDbSectionsToProposalFormat(rawSections, templateSlug);
      const canonical = resolveCanonicalSections(templateSlug);
      return canonical ? { ...canonical, ...normalized } : normalized;
    }
    return resolveCanonicalSections(templateSlug) ?? null;
  }

  return resolveCanonicalSections(templateSlug) ?? null;
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
