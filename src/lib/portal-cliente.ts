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

/** Re-valida campos dinámicos de la sesión contra la DB (sin necesitar PIN). */
export async function refreshPortalSession(contactId: string, tenantId: string): Promise<{
  isProspect: boolean;
  hasActivePresentation: boolean;
  accountName: string;
  installations: Array<{ id: string; name: string }>;
} | null> {
  try {
    const contact = await prisma.crmContact.findUnique({
      where: { id: contactId },
      select: {
        tenantId: true,
        accountId: true,
        account: {
          select: {
            name: true,
            status: true,
            isActive: true,
            installations: {
              where: { status: "active" },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            },
          },
        },
      },
    });

    if (!contact?.account) return null;
    if (contact.tenantId !== tenantId) return null;

    // Same logic as validateClienteSession: account must be accessible
    const acct = contact.account;
    const isAccessible =
      acct.status === "client_active" ||
      acct.status === "prospect" ||
      (acct.isActive && acct.status !== "client_inactive");
    if (!isAccessible) return null;

    let hasActivePresentation = false;
    try {
      const pres = await prisma.crmCompanyPresentation.findFirst({
        where: {
          contactId,
          tenantId,
          status: { in: ["sent", "viewed"] },
        },
        select: { id: true },
      });
      hasActivePresentation = !!pres;
    } catch {
      // Table may not exist yet
    }

    return {
      isProspect: acct.status === "prospect",
      hasActivePresentation,
      accountName: acct.name,
      installations: acct.installations,
    };
  } catch (error) {
    console.error("[Portal] Error refreshing session:", error);
    return null;
  }
}

/** Valida sesión por email + PIN. Busca contactos con portal habilitado por email (case-insensitive). */
export async function validateClienteSession(email: string, pin: string, ip?: string): Promise<{
  success: boolean;
  error?: string;
  session?: ClienteSession;
}> {
  const bcrypt = await import("bcryptjs");
  const emailNorm = email.trim().toLowerCase();
  if (!emailNorm) {
    return { success: false, error: "Email es requerido." };
  }

  // Select explícito: no pedir portalConfig ni columnas que puedan no existir en prod.
  const contacts = await prisma.crmContact.findMany({
    where: {
      portalEnabled: true,
      email: { equals: emailNorm, mode: "insensitive" },
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
          rut: true,
          installations: {
            where: { status: "active" },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });

  if (contacts.length === 0) {
    return { success: false, error: "Email no encontrado o acceso al portal no habilitado." };
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
    if (contact.portalPin && contact.portalPin.startsWith("$2")) {
      pinValid = await bcrypt.compare(pin, contact.portalPin);
    }
    // TODO: Migrar todos los contactos con portalPinVisible a portalPin (bcrypt)
    // y luego eliminar el campo portalPinVisible del schema

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

      let portalTourShown = false
      let ejecutivoId: string | null = null
      let ejecutivoName: string | null = null
      let accountLogoUrl: string | null = null
      let accountRut: string | null = contact.account.rut ?? null
      const BROKEN_LOGO_PREFIX = "/uploads/company-logos/"
      const sanitizeLogoUrl = (url: string | null | undefined): string | null => {
        if (!url || url.startsWith(BROKEN_LOGO_PREFIX)) return null
        return url
      }
      try {
        const account = await prisma.crmAccount.findUnique({
          where: { id: contact.accountId },
          select: { portalTourShown: true, portalEjecutivoId: true, logoUrl: true, rut: true, notes: true },
        })
        if (account) {
          portalTourShown = account.portalTourShown ?? false
          ejecutivoId = account.portalEjecutivoId ?? null
          accountRut = account.rut ?? null
          accountLogoUrl = sanitizeLogoUrl(account.logoUrl ?? null)
          if (!accountLogoUrl && account.notes) {
            const marker = "[[ACCOUNT_LOGO_URL:";
            const start = account.notes.indexOf(marker);
            if (start >= 0) {
              const end = account.notes.indexOf("]]", start);
              if (end >= 0) accountLogoUrl = sanitizeLogoUrl(account.notes.slice(start + marker.length, end).trim() || null);
            }
          }
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

      // Check for active company presentation
      let hasActivePresentation = false
      try {
        const activePresentation = await prisma.crmCompanyPresentation.findFirst({
          where: {
            contactId: contact.id,
            tenantId: contact.tenantId,
            status: { in: ['sent', 'viewed'] },
          },
          select: { id: true },
        })
        hasActivePresentation = !!activePresentation
      } catch {
        // Table may not exist yet
      }

      return {
        success: true,
        session: {
          contactId: contact.id,
          tenantId: contact.tenantId,
          accountId: contact.accountId,
          accountName: contact.account.name,
          accountRut,
          accountLogoUrl,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          installations: contact.account.installations,
          authenticatedAt: new Date().toISOString(),
          portalConfig,
          isProspect: contact.account.status === 'prospect',
          hasActivePresentation,
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
