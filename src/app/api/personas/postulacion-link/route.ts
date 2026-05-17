import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { buildPostulacionPublicPath, getPostulacionToken } from "@/lib/postulacion-token";
import { buildEmailUrl } from "@/lib/emails/site-url";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const token = getPostulacionToken();
    const path = buildPostulacionPublicPath(token);
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { slug: true },
    });
    const absoluteUrl = buildEmailUrl(path, tenant?.slug ?? null);

    return NextResponse.json({
      success: true,
      data: {
        path,
        token,
        url: absoluteUrl,
      },
    });
  } catch (error) {
    console.error("[PERSONAS] Error building postulacion link:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo construir el link de postulación" },
      { status: 500 }
    );
  }
}
