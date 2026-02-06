/**
 * API Route: Email Preview HTML
 * 
 * GET /api/email-preview
 * 
 * Retorna el HTML renderizado del email para mostrarlo en iframe
 */

import { NextRequest, NextResponse } from 'next/server';
import { PresentationEmail } from '@/emails/PresentationEmail';
import { render } from '@react-email/render';

export async function GET(req: NextRequest) {
  try {
    // Datos de ejemplo
    const exampleData = {
      recipientName: 'Daniel Troncoso',
      companyName: 'Polpaico Soluciones',
      subject: 'Apoyo nocturno Coronel V1',
      presentationUrl: 'https://opai.gard.cl/p/abc123xyz456',
      quoteNumber: 'Q-615789',
      senderName: 'Equipo Comercial Gard',
      expiryDate: '15 de marzo de 2026',
    };

    // Renderizar el email como HTML
    const emailHtml = await render(PresentationEmail(exampleData));

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
