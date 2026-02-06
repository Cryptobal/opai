/**
 * Debug endpoint - Ver datos exactos recibidos de Zoho
 * 
 * GET /api/debug/webhook-data/[sessionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { sessionId } = await context.params;

    const webhookSession = await prisma.webhookSession.findUnique({
      where: { sessionId },
    });

    if (!webhookSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const zohoData = webhookSession.zohoData as any;

    return NextResponse.json({
      sessionId,
      createdAt: webhookSession.createdAt,
      expiresAt: webhookSession.expiresAt,
      
      // Quote fields
      quote: {
        Subject: zohoData.quote?.Subject,
        Descripcion_AI: zohoData.quote?.Descripcion_AI,
        Description: zohoData.quote?.Description,
        Quote_Number: zohoData.quote?.Quote_Number,
        Grand_Total: zohoData.quote?.Grand_Total,
        Currency: zohoData.quote?.Currency,
      },
      
      // Products
      product_details: zohoData.product_details?.map((p: any, i: number) => ({
        index: i,
        product_name: p.product_name,
        description: p.description,
        quantity: p.quantity,
        unit_price: p.unit_price,
        subtotal: p.subtotal,
      })),
      
      // Account
      account: {
        Account_Name: zohoData.account?.Account_Name,
      },
      
      // Contact
      contact: {
        Full_Name: zohoData.contact?.Full_Name,
        First_Name: zohoData.contact?.First_Name,
        Last_Name: zohoData.contact?.Last_Name,
        Email: zohoData.contact?.Email,
      },
      
      // Raw data completo
      raw: zohoData,
    }, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
