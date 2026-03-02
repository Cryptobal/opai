import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

const schema = z.object({
  installationId: z.string().uuid(),
  deviceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }

    const device = await prisma.opsDispositivoInstalacion.findFirst({
      where: {
        tenantId: ctx.tenantId,
        installationId: parsed.data.installationId,
        deviceId: parsed.data.deviceId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        valid: !!device,
        isAuthorized: device?.isAuthorized ?? false,
      },
    });
  } catch (err) {
    console.error("[DISPOSITIVOS_VALIDATE]", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
