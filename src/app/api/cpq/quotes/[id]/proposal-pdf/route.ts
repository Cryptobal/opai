/**
 * API Route: Descargar Propuesta Técnica PDF
 * GET /api/cpq/quotes/[id]/proposal-pdf?mode=draft|final
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { renderProposalToBufferFromProps } from '@/lib/pdf/templates/proposal/render-proposal';
import { buildProposalProps } from '@/lib/pdf/templates/proposal/build-proposal-props';
import { buildContentDisposition } from '@/lib/pdf/cpq-quote-pdf-filename';
import { prisma } from '@/lib/prisma';
import { requireTenantModule } from '@/lib/require-module';
import { loadQuoteProposal } from '@/lib/cpq/proposal-sections/persist';
import { blockingErrors, validateProposalContent } from '@/lib/cpq/proposal-sections/validate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
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
      select: { id: true, code: true, proposalMode: true, proposalStatus: true },
    });

    if (!quote) {
      return NextResponse.json({ success: false, error: 'Cotización no encontrada' }, { status: 404 });
    }

    const modeParam = (request.nextUrl.searchParams.get('mode') ?? 'draft').toLowerCase();
    const pdfMode: 'draft' | 'final' = modeParam === 'final' ? 'final' : 'draft';

    if (pdfMode === 'final') {
      const { quote: loaded, content } = await loadQuoteProposal({ tenantId, quoteId: id });
      const needsApprovalGate =
        quote.proposalMode === 'licitacion' || content.mode === 'licitacion';
      if (needsApprovalGate) {
        if (content.status !== 'aprobada' && loaded.proposalStatus !== 'aprobada') {
          return NextResponse.json(
            {
              success: false,
              error: 'El PDF final exige la propuesta en estado aprobada. Revisa y aprueba todas las secciones.',
            },
            { status: 422 },
          );
        }
        const blocking = blockingErrors(
          validateProposalContent(content, {
            hasDotacion: loaded.totalGuards > 0 || loaded.totalPositions > 0,
          }),
        );
        if (blocking.length) {
          return NextResponse.json(
            { success: false, error: blocking[0]!.message },
            { status: 422 },
          );
        }
      }
    }

    const { fileName, ...props } = await buildProposalProps(id, tenantId, { pdfMode });
    const pdfBuffer = await renderProposalToBufferFromProps(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': buildContentDisposition(fileName, 'inline'),
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
