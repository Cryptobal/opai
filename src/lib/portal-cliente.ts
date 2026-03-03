import { prisma } from "@/lib/prisma";

export interface ClienteSession {
  contactId: string;
  tenantId: string;
  accountId: string;
  accountName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  installations: Array<{ id: string; name: string }>;
  authenticatedAt: string;
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

  const contacts = await prisma.crmContact.findMany({
    where: {
      portalEnabled: true,
      OR: [
        { account: { rut: cleanRut } },
        { account: { rut: rutWithDash } },
        { account: { rut: rutWithDots } },
        { account: { rut: rut } },
      ],
    },
    include: {
      account: {
        include: {
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
    (c) => c.account.status === "client_active" || (c.account.isActive && c.account.status !== "client_inactive"),
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
      await prisma.crmContact.update({
        where: { id: contact.id },
        data: {
          portalLastAccessAt: new Date(),
          portalLastAccessIp: ip ?? null,
        },
      });

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
        },
      };
    }
  }

  return { success: false, error: "PIN incorrecto." };
}
