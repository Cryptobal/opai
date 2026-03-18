import 'server-only';
import { cookies } from "next/headers";
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

export interface PortalClienteAuthResult {
  contactId: string;
  accountId: string;
  tenantId: string;
  installationIds: string[];
}

/**
 * Valida la cookie de sesión del portal cliente y retorna datos de la BD.
 * El tenantId SIEMPRE viene de la BD, nunca del request.
 * Retorna null si la sesión es inválida o el contacto no existe/inactivo.
 */
export async function requirePortalClienteAuth(): Promise<PortalClienteAuthResult | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("portal_cliente_session")?.value;
  const session = parsePortalClienteSessionCookie(raw);
  if (!session) return null;

  const contact = await prisma.crmContact.findUnique({
    where: { id: session.contactId },
    select: {
      id: true,
      tenantId: true,
      accountId: true,
      portalEnabled: true,
      account: {
        select: {
          status: true,
          isActive: true,
          installations: {
            where: { status: "active" },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!contact || !contact.portalEnabled) return null;

  const acct = contact.account;
  const isActive =
    acct.status === "client_active" ||
    acct.status === "prospect" ||
    (acct.isActive && acct.status !== "client_inactive");
  if (!isActive) return null;

  return {
    contactId: contact.id,
    accountId: contact.accountId,
    tenantId: contact.tenantId,
    installationIds: acct.installations.map((i) => i.id),
  };
}

export function sanitizeGuardName(firstName: string, lastName: string): string {
  const first = firstName?.trim() || "";
  const lastInitial = lastName?.trim()?.[0] || "";
  return lastInitial ? `${lastInitial}. ${first}` : first;
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

      let portalConfig: PortalConfig = DEFAULT_PORTAL_CONFIG

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
          select: { portalTourShown: true, portalEjecutivoId: true, logoUrl: true, rut: true, notes: true, portalConfig: true },
        })
        if (account) {
          portalTourShown = account.portalTourShown ?? false
          ejecutivoId = account.portalEjecutivoId ?? null
          accountRut = account.rut ?? null
          accountLogoUrl = sanitizeLogoUrl(account.logoUrl ?? null)
          if (account.portalConfig && typeof account.portalConfig === 'object' && !Array.isArray(account.portalConfig)) {
            portalConfig = { ...DEFAULT_PORTAL_CONFIG, ...(account.portalConfig as Partial<PortalConfig>) }
          }
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

      let hasActivePresentation = false
      try {
        const activePresentation = await prisma.crmCompanyPresentation.findFirst({
          where: {
            contactId: contact.id,
            status: { in: ['sent', 'viewed'] },
          },
          select: { id: true },
        })
        hasActivePresentation = !!activePresentation
      } catch {
        // Table may not exist in prod yet
      }

      let commercialPresentationUrl: string | null = null
      try {
        const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://opai.gard.cl'

        // First: try by recipientEmail (direct match)
        if (contact.email) {
          const byEmail = await prisma.presentation.findFirst({
            where: {
              recipientEmail: { equals: contact.email, mode: 'insensitive' },
              status: { in: ['sent', 'viewed'] },
              tenantId: contact.tenantId,
            },
            select: { uniqueId: true },
            orderBy: { createdAt: 'desc' },
          })
          if (byEmail) {
            commercialPresentationUrl = `${siteUrl}/p/${byEmail.uniqueId}?mode=commercial`
          }
        }

        // Fallback: find via quotes of the same account
        if (!commercialPresentationUrl) {
          const accountQuote = await prisma.cpqQuote.findFirst({
            where: { accountId: contact.accountId, tenantId: contact.tenantId, status: 'sent' },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
          })
          if (accountQuote) {
            const byQuote = await prisma.presentation.findFirst({
              where: { quoteId: accountQuote.id, status: { in: ['sent', 'viewed'] } },
              select: { uniqueId: true },
              orderBy: { createdAt: 'desc' },
            })
            if (byQuote) {
              commercialPresentationUrl = `${siteUrl}/p/${byQuote.uniqueId}?mode=commercial`
            }
          }
        }
      } catch {
        // Presentation table lookup failed
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
          hasDemoData,
          portalTourShown,
          ejecutivoId,
          ejecutivoName,
          hasActivePresentation,
          commercialPresentationUrl,
        },
      };
    }
  }

  return { success: false, error: "PIN incorrecto." };
}
