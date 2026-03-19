/**
 * API Route: Descargar Propuesta Técnica PDF (Portal Cliente)
 * GET /api/portal/cliente/cotizaciones/[id]/proposal-pdf
 *
 * Misma lógica que CPQ admin pero con auth de portal (email + PIN).
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { parsePortalClienteSessionCookie } from '@/lib/portal-cliente';
import { renderProposalToBufferFromProps } from '@/lib/pdf/templates/proposal/render-proposal';
import { buildProposalProps } from '@/lib/pdf/templates/proposal/build-proposal-props';
import { cpqQuoteListedInClientPortalWhere } from '@/lib/cpq-portal-visibility';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get('portal_cliente_session')?.value
    );
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;

    const quote = await prisma.cpqQuote.findFirst({
      where: {
        id,
        accountId: session.accountId,
        tenantId: session.tenantId,
        ...cpqQuoteListedInClientPortalWhere(),
      },
      select: { id: true, code: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    }

    const { fileName, ...props } = await buildProposalProps(id, session.tenantId);
    const pdfBuffer = await renderProposalToBufferFromProps(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('[Portal Cliente] Error generating proposal PDF:', error);
    const raw = error instanceof Error ? error.message : String(error);
    let userMessage =
      'No pudimos generar la propuesta técnica. Intenta de nuevo en unos minutos o contacta a tu ejecutivo.';
    if (
      raw.includes('Cannot find module') ||
      raw.includes("'sharp'") ||
      raw.includes('"sharp"') ||
      raw.includes('MODULE_NOT_FOUND')
    ) {
      userMessage =
        'El generador de documentos no está disponible en este momento. Tu ejecutivo puede enviarte el PDF por correo.';
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
