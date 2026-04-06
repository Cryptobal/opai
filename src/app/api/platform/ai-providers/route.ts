import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { decryptApiKey, maskApiKey } from "@/lib/ai-encryption";

function safeMask(encryptedKey: string | null): string | null {
  if (!encryptedKey) return null;
  try {
    return maskApiKey(decryptApiKey(encryptedKey));
  } catch {
    return "••••••••(error)";
  }
}

export async function GET() {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

    const providers = await prisma.platformAiProvider.findMany({
      include: { models: { orderBy: { costTier: "asc" } } },
      orderBy: { createdAt: "asc" },
    });

    const masked = providers.map((p) => ({
      ...p,
      apiKey: undefined,
      apiKeyMasked: safeMask(p.apiKey),
      hasApiKey: !!p.apiKey,
    }));

    return NextResponse.json({ success: true, data: masked });
  } catch (err) {
    console.error("[platform/ai-providers] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al cargar proveedores" },
      { status: 500 },
    );
  }
}
