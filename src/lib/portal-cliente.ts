import 'server-only';
import { prisma } from "@/lib/prisma";
import { PortalConfig, DEFAULT_PORTAL_CONFIG, ClienteSession } from "@/lib/portal-cliente-types";

export type { PortalConfig, ClienteSession };
export { DEFAULT_PORTAL_CONFIG };

/** Decodifica la cookie de sesión del portal cliente (base64url). Usar en rutas API que lean portal_cliente_session. */
export function parsePortalClienteSessionCookie(raw: string | undefined): ClienteSession | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    const session = JSON.parse(decoded) as ClienteSession;
    if (!session?.contactId || !session?.tenantId || !session?.accountId) return null;
    return session;
  } catch {
    return null;
  }
}

export function sanitizeGuardName(firstName: string, lastName: string): string {
  const first = firstName?.trim() || "";
  const lastInitial = lastName?.trim()?.[0] || "";
  return lastInitial ? `${lastInitial}. ${first}` : first;
}

export async function validateClienteSession(rut: string, pin: string, ip?: string): Promise<{
  success: boolean;
  error?: string;
  session?: ClienteSession;
}> {
  const bcrypt = await import("bcryptjs");
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
    // Raw puede fallar; seguimos con variantes exactas de RUT
  }

  // Select explícito: no pedir portalConfig ni columnas que puedan no existir en prod.
  const contacts = await prisma.crmContact.findMany({
    where: {
      portalEnabled: true,
      OR: [
        { account: { rut: cleanRut } },
        { account: { rut: rutWithDash } },
        { account: { rut: rutWithDots } },
        { account: { rut: rut.trim() } },
        ...(accountIdsByRut.length > 0 ? [{ accountId: { in: accountIdsByRut.map((r) => r.id) } }] : []),
      ],
    },
    select: {
      id: true,
      tenantId: true,
      accountId: true,
      firstName: true,
      lastName: true,
      email: true,
      portalPin: true,
      portalPinVisible: true,
      account: {
        select: {
          id: true,
          name: true,
          status: true,
          isActive: true,
          installations: {
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });

  if (contacts.length === 0) {
    return { success: false, error: "RUT no encontrado o acceso al portal no habilitado." };
  }

  const activeContacts = contacts.filter(
    (c) =>
      c.account.status === "client_active" ||
      c.account.status === "prospect" ||
      (c.account.isActive && c.account.status !== "client_inactive"),
  );

  if (activeContacts.length === 0) {
    return { success: false, error: "La cuenta de cliente está inactiva. Contacte a su proveedor de seguridad." };
  }

  for (const contact of activeContacts) {
    if (!contact.portalPin && !contact.portalPinVisible) continue;

    let pinValid = false;
    if (contact.portalPin) {
      if (contact.portalPin.startsWith("$2")) {
        pinValid = await bcrypt.compare(pin, contact.portalPin);
      } else {
        pinValid = contact.portalPin === pin;
      }
    }
    if (!pinValid && contact.portalPinVisible) {
      pinValid = contact.portalPinVisible === pin;
    }

    if (pinValid) {
      try {
        await prisma.crmContact.update({
          where: { id: contact.id },
          data: {
            portalLastAccessAt: new Date(),
            portalLastAccessIp: ip ?? null,
          },
        });
      } catch {
        // Columnas de último acceso pueden no existir
      }

      const portalConfig: PortalConfig = DEFAULT_PORTAL_CONFIG

      let hasDemoData = false
      try {
        hasDemoData = (await prisma.portalClienteDemoData.findUnique({
          where: { contactId: contact.id },
          select: { id: true },
        })) !== null
      } catch {
        // Tabla puede no existir en prod
      }

      // Fetch account-level portal fields (portalTourShown, portalEjecutivoId)
      let portalTourShown = false
      let ejecutivoId: string | null = null
      let ejecutivoName: string | null = null
      try {
        const account = await prisma.crmAccount.findUnique({
          where: { id: contact.accountId },
          select: { portalTourShown: true, portalEjecutivoId: true },
        })
        if (account) {
          portalTourShown = account.portalTourShown ?? false
          ejecutivoId = account.portalEjecutivoId ?? null
          if (ejecutivoId) {
            const ejecutivo = await prisma.admin.findUnique({
              where: { id: ejecutivoId },
              select: { id: true, name: true },
            })
            if (ejecutivo) {
              ejecutivoName = ejecutivo.name
            }
          }
        }
      } catch {
        // Columns may not exist in prod yet
      }

      return {
        success: true,
        session: {
          contactId: contact.id,
          tenantId: contact.tenantId,
          accountId: contact.accountId,
          accountName: contact.account.name,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          installations: contact.account.installations,
          authenticatedAt: new Date().toISOString(),
          portalConfig,
          isProspect: contact.account.status === 'prospect',
          hasDemoData,
          portalTourShown,
          ejecutivoId,
          ejecutivoName,
        },
      };
    }
  }

  return { success: false, error: "PIN incorrecto." };
}
