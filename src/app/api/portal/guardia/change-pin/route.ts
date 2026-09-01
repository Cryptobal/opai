import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import { logAudit } from "@/lib/audit";
import { sendCambioPinGuardia } from "@/lib/marcacion-email";
import { resolvePersonalEmail } from "@/lib/marcacion-personal-email";
import * as bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const schema = z.object({
  guardiaId: z.string().uuid(),
  currentPin: z.string().min(4).max(6),
  newPin: z.string().regex(/^\d{4,6}$/, "El nuevo PIN debe tener entre 4 y 6 dígitos"),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`portal-guardia-change-pin:${ip}`, {
      limit: 8,
      windowSeconds: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intenta más tarde." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const auth = await requirePortalGuardiaAuth(parsed.data.guardiaId);
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: auth.guardiaId, tenantId: auth.tenantId },
      select: {
        id: true,
        marcacionPin: true,
        personalEmail: true,
        persona: {
          select: { firstName: true, lastName: true, personalEmail: true, email: true },
        },
      },
    });
    if (!guardia?.marcacionPin) {
      return NextResponse.json(
        { success: false, error: "No tienes PIN de marcación configurado" },
        { status: 400 },
      );
    }

    const valid = await bcrypt.compare(parsed.data.currentPin, guardia.marcacionPin);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "PIN actual incorrecto" },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(parsed.data.newPin, 10);
    await prisma.opsGuardia.update({
      where: { id: guardia.id },
      data: { marcacionPin: hashed, marcacionPinVisible: null },
    });

    const now = new Date();
    await logAudit({
      userId: auth.guardiaId,
      action: "UPDATE",
      entity: "OpsGuardia",
      entityId: guardia.id,
      details: { type: "PIN_SELF_SERVICE", at: now.toISOString() },
      tenantId: auth.tenantId,
      request,
    });

    const email = resolvePersonalEmail({
      guardiaPersonalEmail: guardia.personalEmail,
      personaPersonalEmail: guardia.persona.personalEmail,
      personaEmail: guardia.persona.email,
    });
    if (email) {
      sendCambioPinGuardia({
        to: email,
        guardiaName: `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim(),
        when: now,
        success: true,
      }).catch((err) => console.error("[portal-guardia/change-pin] email:", err));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[portal-guardia/change-pin]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
