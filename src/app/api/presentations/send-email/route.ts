/**
 * API Route: Send Presentation Email
 * 
 * POST /api/presentations/send-email
 * 
 * Envía la presentación por email al contacto y guarda en BD
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDefaultTenantId } from '@/lib/tenant';
import { resend, EMAIL_CONFIG } from '@/lib/resend';
import { PresentationEmail } from '@/emails/PresentationEmail';
import { nanoid } from 'nanoid';
import { render } from '@react-email/render';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, recipientEmail: customEmail, recipientName: customName, ccEmails = [] } = body;

    // 1. Validar sessionId
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId es requerido' },
        { status: 400 }
      );
    }

    // 2. Buscar sesión de webhook
    const webhookSession = await prisma.webhookSession.findUnique({
      where: { sessionId },
    });

    if (!webhookSession) {
      return NextResponse.json(
        { error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }

    // Validar que no esté expirada
    if (new Date() > webhookSession.expiresAt) {
      return NextResponse.json(
        { error: 'Sesión expirada' },
        { status: 410 }
      );
    }

    const zohoData = webhookSession.zohoData as any;

    // 3. Extraer datos del contacto y cotización
    // Usar el email custom si viene del modal, si no usar el de Zoho
    const recipientEmail = customEmail || zohoData.contact?.Email;
    const recipientName = customName || `${zohoData.contact?.First_Name || ''} ${zohoData.contact?.Last_Name || ''}`.trim();
    const recipientPhone = zohoData.contact?.Mobile || zohoData.contact?.Phone || '';
    const companyName = zohoData.account?.Account_Name || 'Cliente';
    const quoteSubject = zohoData.quote?.Subject || 'Propuesta de Servicios';
    const quoteNumber = zohoData.quote?.Quote_Number || '';
    const validUntil = zohoData.quote?.Valid_Till;

    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'Email del destinatario es requerido' },
        { status: 400 }
      );
    }

    // 4. Generar uniqueId para URL pública
    const uniqueId = nanoid(12); // Ej: "xyz123abc456"
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://opai.gard.cl';
    const presentationUrl = `${siteUrl}/p/${uniqueId}`;

    // 5. Obtener template (commercial por defecto, tenant actual)
    const tenantId = await getDefaultTenantId();
    const template = await prisma.template.findFirst({
      where: { slug: 'commercial', active: true, tenantId },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template no encontrado' },
        { status: 404 }
      );
    }

    // 6. Preparar datos del email
    const emailProps = {
      recipientName: recipientName || 'Estimado/a',
      companyName,
      subject: quoteSubject,
      presentationUrl,
      quoteNumber,
      senderName: 'Equipo Comercial Gard',
      expiryDate: validUntil ? new Date(validUntil).toLocaleDateString('es-CL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) : undefined,
    };

    // 7. Renderizar email
    const emailHtml = await render(PresentationEmail(emailProps));
    const emailSubject = `${quoteSubject} - Gard Security`;

    // 8. Enviar email con Resend
    const emailResponse = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: recipientEmail,
      cc: ccEmails.filter((email: string) => email && email.trim()),
      replyTo: EMAIL_CONFIG.replyTo,
      subject: emailSubject,
      html: emailHtml,
      tags: [
        { name: 'type', value: 'presentation' },
        { name: 'session', value: sessionId },
      ],
    });

    if (emailResponse.error) {
      console.error('Error al enviar email:', emailResponse.error);
      return NextResponse.json(
        { error: 'Error al enviar email', details: emailResponse.error },
        { status: 500 }
      );
    }

    // 9. Guardar presentación en BD (con tenant)
    const presentation = await prisma.presentation.create({
      data: {
        uniqueId,
        templateId: template.id,
        tenantId,
        clientData: zohoData,
        status: 'sent',
        recipientEmail,
        recipientName,
        ccEmails: ccEmails.filter((email: string) => email && email.trim()),
        emailSentAt: new Date(),
        emailProvider: 'resend',
        emailMessageId: emailResponse.data?.id || null,
        tags: ['zoho', 'auto-sent'],
      },
    });

    // 10. Actualizar contador de uso del template
    await prisma.template.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 } },
    });

    // 11. Marcar sesión como completada
    await prisma.webhookSession.update({
      where: { sessionId },
      data: { status: 'completed' },
    });

    // 12. Log en audit (con tenant opcional)
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'presentation_sent',
        entity: 'presentation',
        entityId: presentation.id,
        details: {
          recipientEmail,
          recipientName,
          ccEmails,
          companyName,
          quoteNumber,
          emailMessageId: emailResponse.data?.id,
        },
      },
    });

    // 13. Enviar webhook a Make.com
    try {
      const zohoQuoteId = zohoData.quote_id || zohoData.quote?.id || zohoData.quote?.Quote_Number;
      
      const makeWebhookUrl = 'https://hook.us1.make.com/55vrqwe4q8y4si5qz9wsj2881n48jequ';
      
      await fetch(makeWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zoho_quote_id: zohoQuoteId,
          presentation_url: presentationUrl,
          quote_number: quoteNumber,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          company_name: companyName,
          sent_at: new Date().toISOString(),
          session_id: sessionId,
        }),
      });
      
      console.log('Webhook enviado a Make.com:', {
        zoho_quote_id: zohoQuoteId,
        presentation_url: presentationUrl,
      });
    } catch (webhookError: any) {
      // No fallar si el webhook falla, solo registrar el error
      console.error('Error al enviar webhook a Make.com:', webhookError);
      
      // Registrar el error en audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'webhook_error',
          entity: 'presentation',
          entityId: presentation.id,
          details: {
            error: webhookError.message,
            webhook_url: 'Make.com',
            zoho_quote_id: zohoData.quote_id || zohoData.quote?.id,
          },
        },
      });
    }

    // 14. Retornar respuesta exitosa
    return NextResponse.json({
      success: true,
      presentation: {
        id: presentation.id,
        uniqueId,
        publicUrl: presentationUrl,
      },
      email: {
        messageId: emailResponse.data?.id,
        sentTo: recipientEmail,
        cc: ccEmails,
        recipientPhone,
      },
    });

  } catch (error: any) {
    console.error('Error en send-email:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
