/**
 * API Route: Test Webhook to Make.com
 * 
 * GET /api/test/send-webhook
 * 
 * Envía un webhook de prueba a Make.com con datos de la última propuesta enviada
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCanonicalSiteUrl } from '@/lib/emails/site-url';

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Buscando última propuesta enviada...\n');

    // Buscar la última presentación enviada
    const lastPresentation = await prisma.presentation.findFirst({
      where: {
        status: 'sent',
        emailSentAt: { not: null },
      },
      orderBy: {
        emailSentAt: 'desc',
      },
    });

    if (!lastPresentation) {
      return NextResponse.json({
        success: false,
        error: 'No se encontró ninguna propuesta enviada en la base de datos.',
      }, { status: 404 });
    }

    const clientData = lastPresentation.clientData as any;
    const zohoData = clientData;

    // Extraer datos
    const zohoQuoteId = zohoData.quote_id || zohoData.quote?.id || zohoData.quote?.Quote_Number;
    const quoteNumber = zohoData.quote?.Quote_Number;
    const siteUrl = getCanonicalSiteUrl();
    const presentationUrl = `${siteUrl}/p/${lastPresentation.uniqueId}`;

    const presentationInfo = {
      id: lastPresentation.id,
      uniqueId: lastPresentation.uniqueId,
      zoho_quote_id: zohoQuoteId,
      quote_number: quoteNumber,
      recipient_name: lastPresentation.recipientName,
      recipient_email: lastPresentation.recipientEmail,
      company_name: zohoData.account?.Account_Name || 'N/A',
      sent_at: lastPresentation.emailSentAt?.toISOString(),
      presentation_url: presentationUrl,
    };

    console.log('📊 Datos de la propuesta:', presentationInfo);

    // Preparar payload del webhook
    const webhookPayload = {
      zoho_quote_id: zohoQuoteId,
      presentation_url: presentationUrl,
      quote_number: quoteNumber,
      recipient_email: lastPresentation.recipientEmail,
      recipient_name: lastPresentation.recipientName,
      company_name: zohoData.account?.Account_Name,
      sent_at: lastPresentation.emailSentAt?.toISOString(),
      session_id: 'test-' + Date.now(),
      test_mode: true, // Indicador de que es una prueba
    };

    // Enviar webhook a Make.com
    const makeWebhookUrl = 'https://hook.us1.make.com/55vrqwe4q8y4si5qz9wsj2881n48jequ';
    
    console.log('🚀 Enviando webhook a Make.com...');

    const response = await fetch(makeWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseOk = response.ok;
    const responseStatus = response.status;
    const responseStatusText = response.statusText;

    let responseBody = null;
    try {
      const text = await response.text();
      if (text) {
        responseBody = text;
      }
    } catch (e) {
      // Respuesta vacía está OK
    }

    if (responseOk) {
      return NextResponse.json({
        success: true,
        message: '✅ Webhook de prueba enviado exitosamente a Make.com',
        presentation_data: presentationInfo,
        webhook_payload: webhookPayload,
        webhook_response: {
          status: responseStatus,
          statusText: responseStatusText,
          body: responseBody,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `❌ Error al enviar webhook (${responseStatus} ${responseStatusText})`,
        presentation_data: presentationInfo,
        webhook_payload: webhookPayload,
        webhook_response: {
          status: responseStatus,
          statusText: responseStatusText,
          body: responseBody,
        },
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message,
    }, { status: 500 });
  }
}
