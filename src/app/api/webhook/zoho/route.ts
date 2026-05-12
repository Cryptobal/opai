/**
 * API Route: /api/webhook/zoho
 * 
 * POST - Recibir datos de Zoho CRM y crear sesión de webhook
 * 
 * Este endpoint recibe datos de una cotización de Zoho CRM,
 * los valida, y crea una sesión temporal para generar la presentación.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDefaultTenantId } from '@/lib/tenant';
import { nanoid } from 'nanoid';
import { createHmac } from 'crypto';

/**
 * Verifica HMAC signature del webhook
 */
function verifyHmacSignature(
  payload: string,
  timestamp: string,
  receivedSignature: string,
  secret: string
): boolean {
  try {
    const dataToSign = payload + timestamp;
    const expectedSignature = createHmac('sha256', secret)
      .update(dataToSign)
      .digest('hex');
    
    return expectedSignature === receivedSignature;
  } catch (error) {
    console.error('Error verificando HMAC:', error);
    return false;
  }
}

/**
 * Verifica que el timestamp no sea muy antiguo (protección replay attack)
 */
function isTimestampValid(timestamp: string, maxAgeMinutes: number = 720): boolean {
  try {
    // Zoho envía timestamp en hora local de Chile (GMT-3)
    // Necesitamos asumir timezone Chile para parsear correctamente
    let requestTime: number;
    
    // Si el timestamp no tiene timezone, asumimos GMT-3 (Chile)
    if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('GMT')) {
      // Formato: "2026-02-05T20:57:59" → Asumimos GMT-3
      requestTime = new Date(timestamp + '-03:00').getTime();
    } else {
      // Ya tiene timezone explícita
      requestTime = new Date(timestamp).getTime();
    }
    
    const now = Date.now();
    const diffMinutes = (now - requestTime) / (1000 * 60);
    
    // Permitir timestamps con amplio margen (timezone differences)
    // Acepta: -60 minutos (futuro) hasta +720 minutos (pasado) = 12 horas
    const isValid = diffMinutes >= -60 && diffMinutes <= maxAgeMinutes;
    
    return isValid;
  } catch (error) {
    console.error('Error validando timestamp:', error);
    return false;
  }
}

// POST /api/webhook/zoho
export async function POST(request: NextRequest) {
  try {
    // 1. Leer body RAW (necesario para HMAC)
    const bodyText = await request.text();
    const body = JSON.parse(bodyText);
    
    // 2. Validar autenticación (HMAC o Bearer token)
    const secret = process.env.ZOHO_WEBHOOK_SECRET;
    if (!secret) {
      console.error('❌ ZOHO_WEBHOOK_SECRET no configurado');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const signature = request.headers.get('x-zoho-signature');
    const timestamp = request.headers.get('x-zoho-timestamp');
    const authHeader = request.headers.get('authorization');

    let authenticated = false;

    // Método 1: HMAC Signature (preferido - más seguro)
    if (signature && timestamp) {
      console.log('🔐 Verificando HMAC signature...');
      
      // Verificar signature usando el body RAW tal como llega de Zoho
      if (verifyHmacSignature(bodyText, timestamp, signature, secret)) {
        console.log('✅ HMAC signature válida');
        
        authenticated = true;
      } else {
        console.error('❌ HMAC signature inválida');
        return NextResponse.json(
          { success: false, error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }
    // Método 2: Bearer Token (legacy - mantener compatibilidad)
    else if (authHeader) {
      console.log('🔑 Verificando Bearer token (legacy)...');
      const expectedToken = `Bearer ${secret}`;
      
      if (authHeader === expectedToken) {
        console.log('✅ Bearer token válido');
        authenticated = true;
      } else {
        console.error('❌ Bearer token inválido');
        return NextResponse.json(
          { success: false, error: 'Invalid authentication token' },
          { status: 401 }
        );
      }
    }
    // Sin autenticación
    else {
      console.error('❌ No se proporcionó autenticación (HMAC o Bearer)');
      return NextResponse.json(
        { success: false, error: 'Authentication required (X-Zoho-Signature or Authorization header)' },
        { status: 401 }
      );
    }

    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }
    
    // 3. Validar que venga al menos el quote
    if (!body.quote) {
      console.error('❌ Missing quote data');
      return NextResponse.json(
        { success: false, error: 'Missing quote data' },
        { status: 400 }
      );
    }

    console.log('✅ Autenticación exitosa, procesando webhook...');

    // 4. Generar sessionId único
    const sessionId = `whs_${nanoid(16)}`;

    // 5. Calcular fecha de expiración (24 horas)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // 6. Guardar sesión en base de datos (con tenant por defecto)
    const tenantId = await getDefaultTenantId();
    const webhookSession = await prisma.webhookSession.create({
      data: {
        sessionId,
        zohoData: body, // Guardar todo el payload
        status: 'pending',
        expiresAt,
        tenantId,
      },
    });

    // 7. Construir URL de preview
    // Prioridad: SITE_URL > dominio hardcoded
    // En producción usar opai.gard.cl
    let baseUrl: string;
    
    if (process.env.SITE_URL) {
      baseUrl = process.env.SITE_URL;
    } else if (process.env.VERCEL_ENV === 'production') {
      baseUrl = 'https://opai.gard.cl';
    } else if (process.env.NEXT_PUBLIC_SITE_URL) {
      baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      baseUrl = 'https://opai.gard.cl';
    }
    
    const previewUrl = `${baseUrl}/preview/${sessionId}`;

    // 8. Log de éxito
    console.log('✅ Webhook session created:', {
      sessionId,
      quoteId: body.quote_id || body.quote?.id,
      accountName: body.account?.Account_Name || 'Unknown',
    });

    // 9. Retornar respuesta
    return NextResponse.json({
      success: true,
      sessionId,
      preview_url: previewUrl,
      token: sessionId, // Zoho espera "token"
      expiresAt: expiresAt.toISOString(),
    }, { status: 201 });

  } catch (error: any) {
    console.error('❌ Error in webhook:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// GET /api/webhook/zoho (health check)
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Zoho webhook endpoint is ready',
    version: '1.0.0',
  });
}
