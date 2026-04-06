import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { decryptApiKey } from "@/lib/ai-encryption";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

    const { id } = await params;

    const provider = await prisma.platformAiProvider.findUnique({ where: { id } });
    if (!provider || !provider.apiKey) {
      return NextResponse.json(
        { success: false, error: "No hay API key configurada" },
        { status: 404 },
      );
    }

    const plainKey = decryptApiKey(provider.apiKey);
    return NextResponse.json({ success: true, apiKey: plainKey });
  } catch (err) {
    console.error("[platform/ai-providers] key reveal error:", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener API key" },
      { status: 500 },
    );
  }
}
