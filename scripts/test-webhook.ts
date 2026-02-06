/**
 * Script de prueba: Envía webhook a Make.com con datos de última propuesta
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Cargar variables de entorno desde .env.local
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const prisma = new PrismaClient();

async function testWebhook() {
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
      console.log('❌ No se encontró ninguna propuesta enviada en la base de datos.');
      return;
    }

    const clientData = lastPresentation.clientData as any;
    const zohoData = clientData;

    // Extraer datos
    const zohoQuoteId = zohoData.quote_id || zohoData.quote?.id || zohoData.quote?.Quote_Number;
    const quoteNumber = zohoData.quote?.Quote_Number;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://docs.gard.cl';
    const presentationUrl = `${siteUrl}/p/${lastPresentation.uniqueId}`;

    console.log('📊 Datos de la propuesta:');
    console.log('─────────────────────────────────────');
    console.log(`ID Propuesta:       ${lastPresentation.id}`);
    console.log(`Unique ID:          ${lastPresentation.uniqueId}`);
    console.log(`Zoho Quote ID:      ${zohoQuoteId}`);
    console.log(`Quote Number:       ${quoteNumber}`);
    console.log(`Destinatario:       ${lastPresentation.recipientName} (${lastPresentation.recipientEmail})`);
    console.log(`Empresa:            ${zohoData.account?.Account_Name || 'N/A'}`);
    console.log(`Enviado:            ${lastPresentation.emailSentAt?.toLocaleString('es-CL')}`);
    console.log(`URL Propuesta:      ${presentationUrl}`);
    console.log('─────────────────────────────────────\n');

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

    console.log('📤 Payload del webhook:');
    console.log(JSON.stringify(webhookPayload, null, 2));
    console.log('\n');

    // Enviar webhook a Make.com
    const makeWebhookUrl = 'https://hook.us1.make.com/55vrqwe4q8y4si5qz9wsj2881n48jequ';
    
    console.log(`🚀 Enviando webhook a Make.com...`);
    console.log(`URL: ${makeWebhookUrl}\n`);

    const response = await fetch(makeWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    if (response.ok) {
      console.log('✅ Webhook enviado exitosamente!');
      console.log(`Status: ${response.status} ${response.statusText}`);
      
      try {
        const responseText = await response.text();
        if (responseText) {
          console.log('Respuesta:', responseText);
        }
      } catch (e) {
        // Respuesta vacía está OK
      }
    } else {
      console.log('❌ Error al enviar webhook');
      console.log(`Status: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      if (errorText) {
        console.log('Error:', errorText);
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
testWebhook();
