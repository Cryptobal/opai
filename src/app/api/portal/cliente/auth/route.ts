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

    // Misma normalización de RUT que en validateClienteSession (incl. búsqueda por RUT normalizado).
    const cleanRut = rut.replace(/[.\-\s]/g, "").toUpperCase();
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

    let accountIdsByRut: { id: string }[] = [];
    try {
      if (cleanRut.length >= 2) {
        accountIdsByRut =
          (await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM crm.accounts
            WHERE REPLACE(REPLACE(REPLACE(UPPER(COALESCE(rut, '')), '.', ''), '-', ''), ' ', '') = ${cleanRut}
          `) ?? [];
      }
    } catch {
      // Raw query puede fallar por permisos o esquema; seguimos con variantes exactas
    }

    // Contacto para lockout: solo id para no depender de columnas portal_* (pueden no existir en prod).
    let contact: { id: string; portalLoginAttempts?: number; portalLockedUntil?: Date | null } | null = null;
    try {
      contact = await prisma.crmContact.findFirst({
        where: {
          portalEnabled: true,
          OR: [
            {
              account: {
                OR: [
                  { rut: cleanRut },
                  { rut: rutWithDash },
                  { rut: rutWithDots },
                  { rut: rut.trim() },
                ],
              },
            },
            ...(accountIdsByRut.length > 0 ? [{ accountId: { in: accountIdsByRut.map((r) => r.id) } }] : []),
          ],
        },
        select: { id: true },
      }) as { id: string } | null;
    } catch (e) {
      console.warn("[Portal Cliente] Lockout lookup skipped:", (e as Error)?.message);
      // Buscar solo por id después del login si hace falta; por ahora seguimos sin lockout
    }

    // Autenticación
    const result = await validateClienteSession(rut, pin, ip);

    if (!result.success || !result.session) {
      if (contact?.id) {
        try {
          const c = await prisma.crmContact.findUnique({
            where: { id: contact.id },
            select: { portalLoginAttempts: true, portalLockedUntil: true },
          });
          if (c) {
            const newAttempts = (c.portalLoginAttempts ?? 0) + 1;
            const updateData: Record<string, unknown> = { portalLoginAttempts: newAttempts };
            if (newAttempts >= 5) {
              updateData.portalLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
              updateData.portalLoginAttempts = 0;
            }
            await prisma.crmContact.update({ where: { id: contact.id }, data: updateData });
          }
        } catch {
          // Columnas de lockout pueden no existir
        }
      }
      return NextResponse.json(
        { success: false, error: result.error ?? "Credenciales inválidas" },
        { status: 401 },
      );
    }

    if (contact?.id) {
      try {
        await prisma.crmContact.update({
          where: { id: contact.id },
          data: { portalLoginAttempts: 0, portalLockedUntil: null },
        });
      } catch {
        // Columnas de lockout pueden no existir
      }
    }

    try {
      await prisma.portalClienteAuditLog.create({
        data: {
          tenantId: result.session.tenantId,
          contactId: result.session.contactId,
          action: "login",
          ip,
        },
      });
    } catch (e) {
      console.warn("[Portal Cliente] Audit log skipped:", (e as Error)?.message);
    }

    return NextResponse.json({ success: true, data: result.session });
  } catch (error) {
    console.error("[Portal Cliente] Auth error:", error);
    return NextResponse.json({ success: false, error: "Error al autenticar" }, { status: 500 });
  }
}
