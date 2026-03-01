import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  installationId: z.string().uuid(),
  deviceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }

    const device = await prisma.opsDispositivoInstalacion.findFirst({
      where: {
        installationId: parsed.data.installationId,
        deviceId: parsed.data.deviceId,
      },
    });

    if (device) {
      await prisma.opsDispositivoInstalacion.update({
        where: { id: device.id },
        data: { lastAccessAt: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        isAuthorized: device?.isAuthorized ?? false,
        device: device ?? null,
      },
    });
  } catch (error) {
    console.error("[RONDAS] POST dispositivos validate", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
