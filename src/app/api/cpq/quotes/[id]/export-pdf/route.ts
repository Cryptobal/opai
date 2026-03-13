/**
 * API Route: Exportar cotización CPQ como PDF
 * POST /api/cpq/quotes/[id]/export-pdf
 *
 * Returns a real PDF (application/pdf) generated with @react-pdf/renderer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildQuotationProps } from '@/lib/pdf/templates/quotation/build-quotation-props';
import { renderQuotationToBuffer } from '@/lib/pdf/templates/quotation/render-quotation';

export const runtime = 'nodejs';

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
