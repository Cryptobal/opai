/**
 * API Route: Email Preview HTML por Session
 * 
 * GET /api/email-preview/[sessionId]
 * 
 * Retorna el HTML renderizado del email con datos de Zoho
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PresentationEmail } from '@/emails/PresentationEmail';
import { render } from '@react-email/render';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Buscar sesión de webhook
    const webhookSession = await prisma.webhookSession.findUnique({
      where: { sessionId },
    });

    if (!webhookSession) {
      return new NextResponse('Sesión no encontrada', { status: 404 });
    }

    const zohoData = webhookSession.zohoData as any;
    
    const contactName = `${zohoData.contact?.First_Name || ''} ${zohoData.contact?.Last_Name || ''}`.trim();
    const companyName = zohoData.account?.Account_Name || 'Cliente';
    const quoteSubject = zohoData.quote?.Subject || 'Propuesta de Servicios';
    const quoteNumber = zohoData.quote?.Quote_Number || '';
    const validUntil = zohoData.quote?.Valid_Till;

    const emailProps = {
      recipientName: contactName || 'Estimado/a',
      companyName,
      subject: quoteSubject,
      presentationUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/p/preview-example`,
      quoteNumber,
      senderName: 'Equipo Comercial Gard',
      expiryDate: validUntil ? new Date(validUntil).toLocaleDateString('es-CL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) : undefined,
    };

    // Renderizar el email como HTML
    const emailHtml = await render(PresentationEmail(emailProps));

    // Retornar HTML puro
    return new NextResponse(emailHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error al generar preview de email:', error);
    return new NextResponse('Error al generar preview', { status: 500 });
  }
}
