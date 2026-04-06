/**
 * API Route: Descargar Propuesta Técnica PDF
 * GET /api/cpq/quotes/[id]/proposal-pdf
 *
 * Genera el PDF de propuesta técnica (20 páginas) con contenido AI.
 * Puede tardar unos segundos por la generación de contenido AI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { renderProposalToBufferFromProps } from '@/lib/pdf/templates/proposal/render-proposal';
import { buildProposalProps } from '@/lib/pdf/templates/proposal/build-proposal-props';
import { prisma } from '@/lib/prisma';
import { requireTenantModule } from '@/lib/require-module';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 401 });
    }

    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      select: { id: true, code: true },
    });

    if (!quote) {
      return NextResponse.json({ success: false, error: 'Cotización no encontrada' }, { status: 404 });
    }

    const { fileName, ...props } = await buildProposalProps(id, tenantId);
    const pdfBuffer = await renderProposalToBufferFromProps(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('[Proposal PDF] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Error al generar propuesta técnica: ${msg}` },
      { status: 500 }
    );
  }
}
