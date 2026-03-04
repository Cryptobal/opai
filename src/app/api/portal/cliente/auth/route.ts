import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateClienteSession } from "@/lib/portal-cliente";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut, pin } = body as { rut?: string; pin?: string };

    if (!rut || !pin) {
      return NextResponse.json({ success: false, error: "RUT y PIN son requeridos" }, { status: 400 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    // Build the same RUT variants that validateClienteSession uses so we can
    // look up the contact BEFORE calling it (needed for lockout checks).
    const cleanRut = rut.replace(/[.\-]/g, "").toUpperCase();
    const rutBody = cleanRut.slice(0, -1);
    const rutDv = cleanRut.slice(-1);
    const rutWithDash = `${rutBody}-${rutDv}`;

    let rutWithDots = rutWithDash;
    if (rutBody.length >= 2) {
      const reversed = rutBody.split("").reverse();
      const groups: string[] = [];
      for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
      }
      rutWithDots = `${groups.reverse().join(".")}-${rutDv}`;
    }

    // Find the portal contact so we can enforce lockout before attempting auth.
    const contact = await prisma.crmContact.findFirst({
      where: {
        portalEnabled: true,
        account: {
          OR: [
            { rut: cleanRut },
            { rut: rutWithDash },
            { rut: rutWithDots },
            { rut: rut },
          ],
        },
      },
      select: {
        id: true,
        portalLoginAttempts: true,
        portalLockedUntil: true,
      },
    });

    // Check lockout before attempting authentication.
    if (contact?.portalLockedUntil && contact.portalLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (contact.portalLockedUntil.getTime() - Date.now()) / 60_000,
      );
      return NextResponse.json(
        { success: false, error: `Demasiados intentos fallidos. Intenta en ${minutesLeft} minuto(s).` },
        { status: 429 },
      );
    }

    // Attempt authentication.
    const result = await validateClienteSession(rut, pin, ip);

    if (!result.success || !result.session) {
      // Increment failed-attempt counter and apply lockout after 5 failures.
      if (contact) {
        const newAttempts = (contact.portalLoginAttempts ?? 0) + 1;
        const updateData: Record<string, unknown> = { portalLoginAttempts: newAttempts };
        if (newAttempts >= 5) {
          updateData.portalLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          updateData.portalLoginAttempts = 0;
        }
        await prisma.crmContact.update({
          where: { id: contact.id },
          data: updateData,
        });
      }
      return NextResponse.json(
        { success: false, error: result.error ?? "Credenciales inválidas" },
        { status: 401 },
      );
    }

    // Successful login — reset lockout counters.
    if (contact) {
      await prisma.crmContact.update({
        where: { id: contact.id },
        data: { portalLoginAttempts: 0, portalLockedUntil: null },
      });
    }

    // Write audit log entry.
    await prisma.portalClienteAuditLog.create({
      data: {
        tenantId: result.session.tenantId,
        contactId: result.session.contactId,
        action: "login",
        ip,
      },
    });

    return NextResponse.json({ success: true, data: result.session });
  } catch (error) {
    console.error("[Portal Cliente] Auth error:", error);
    return NextResponse.json({ success: false, error: "Error al autenticar" }, { status: 500 });
  }
}
