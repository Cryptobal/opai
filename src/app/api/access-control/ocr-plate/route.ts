import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OCR_PLATE_PROMPT } from "@/lib/access-control/utils";
import type { PlateOcrResult } from "@/lib/access-control/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, tenantId } = body as { image: string; tenantId?: string };

    if (!image) {
      return NextResponse.json(
        { success: false, error: "No se proporcionó imagen" },
        { status: 400 }
      );
    }

    // Find active AI provider (prefer Anthropic, then OpenAI, then Google)
    const providers = await prisma.aiProvider.findMany({
      where: { isActive: true, ...(tenantId ? { tenantId } : {}) },
      include: { models: { where: { isActive: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (providers.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay proveedores de IA configurados" },
        { status: 503 }
      );
    }

    // Try providers in order: Anthropic > OpenAI > Google
    const providerOrder = ["anthropic", "openai", "google"];
    const sortedProviders = providers.sort((a, b) => {
      const aIdx = providerOrder.indexOf(a.providerType);
      const bIdx = providerOrder.indexOf(b.providerType);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });

    let result: PlateOcrResult | null = null;

    for (const provider of sortedProviders) {
      if (!provider.apiKey) continue;

      try {
        if (provider.providerType === "openai") {
          result = await ocrWithOpenAI(provider.apiKey, image, provider.models[0]?.modelId);
        } else if (provider.providerType === "anthropic") {
          result = await ocrWithAnthropic(provider.apiKey, image, provider.models[0]?.modelId);
        }
        // Add google support if needed

        if (result) break;
      } catch (err) {
        console.warn(`[OCR] Provider ${provider.providerType} failed:`, err);
        continue;
      }
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: "No se pudo procesar la imagen con ningún proveedor de IA" },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[AccessControl] Error in OCR plate:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar imagen de patente" },
      { status: 500 }
    );
  }
}

async function ocrWithOpenAI(
  apiKey: string,
  imageBase64: string,
  modelId?: string,
): Promise<PlateOcrResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: modelId || "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PLATE_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: imageBase64.startsWith("data:")
                ? imageBase64
                : `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 200,
  });

  const text = response.choices[0]?.message?.content || "";
  return parseOcrResponse(text);
}

async function ocrWithAnthropic(
  apiKey: string,
  imageBase64: string,
  modelId?: string,
): Promise<PlateOcrResult> {
  const base64Data = imageBase64.startsWith("data:")
    ? imageBase64.split(",")[1]
    : imageBase64;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId || "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Data,
              },
            },
            { type: "text", text: OCR_PLATE_PROMPT },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  return parseOcrResponse(text);
}

function parseOcrResponse(text: string): PlateOcrResult {
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { plate: null, confidence: 0, format: "unknown", error: "No se pudo parsear respuesta" };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      plate: parsed.plate || null,
      confidence: parsed.confidence || 0,
      format: parsed.format || "unknown",
      error: parsed.error,
    };
  } catch {
    return { plate: null, confidence: 0, format: "unknown", error: "Error parseando respuesta de IA" };
  }
}
