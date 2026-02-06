/**
 * API Route para generar PDF de propuesta económica
 * Usa @react-pdf/renderer (funciona en Vercel)
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { PricingPDF } from '@/components/pdf/PricingPDF';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientName, quoteNumber, pricing, quoteDate, contactEmail, contactPhone } = body;
    
    if (!pricing) {
      return NextResponse.json(
        { error: 'Faltan datos de pricing' },
        { status: 400 }
      );
    }
    
    // Generar PDF usando react-pdf
    const pdfBuffer = await renderToBuffer(
      PricingPDF({
        clientName: clientName || 'Cliente',
        quoteNumber: quoteNumber || 'COT-000',
        quoteDate: quoteDate || new Date().toLocaleDateString('es-CL'),
        pricing,
        contactEmail,
        contactPhone,
      })
    );
    
    const fileName = `Propuesta_${clientName?.replace(/\s+/g, '_') || 'Cliente'}_${quoteNumber || 'COT'}.pdf`;
    
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
    
  } catch (error: any) {
    console.error('Error generando PDF:', error);
    return NextResponse.json(
      { error: 'Error generando PDF', details: error.message },
      { status: 500 }
    );
  }
}
