/**
 * API Route: /api/ai/quote-description
 * POST - Generate AI description for a CPQ quote
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { generateQuoteDescription } from "@/modules/cpq/descriptions/generate-descriptions";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { quoteId, customInstruction } = await request.json();
    if (!quoteId) {
      return NextResponse.json(
        { success: false, error: "quoteId es requerido" },
        { status: 400 }
      );
    }

    const description = await generateQuoteDescription(quoteId, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      customInstruction,
    });

    return NextResponse.json({
      success: true,
      data: { description },
    });
  } catch (error) {
    console.error("Error generating AI description:", error);
    const message = error instanceof Error ? error.message : "Failed to generate description";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
