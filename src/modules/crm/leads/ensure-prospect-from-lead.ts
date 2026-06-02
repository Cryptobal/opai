/**
 * ensureProspectFromLead
 *
 * Crea (o reutiliza) un PROSPECTO liviano a partir de un lead, SIN negocio ni
 * cotización. Su propósito es habilitar el acceso al portal del cliente para
 * que un lead frío "viva el onboarding" recibiendo la Presentación de Empresa
 * antes de cualquier propuesta.
 *
 * Diseño:
 * - Idempotente: si el lead ya tiene `convertedContactId` válido, lo devuelve.
 *   Si no, reutiliza contacto por email o cuenta por nombre (mismo criterio que
 *   el flujo de aprobación) antes de crear nada.
 * - NO crea deal/quote, NO toca `convertedDealId` (esa es la señal de
 *   "convertido" que usan las métricas), por lo que el lead sigue contando como
 *   no-convertido hasta que se apruebe formalmente.
 * - Deja `convertedAccountId`/`convertedContactId` como puntero de trazabilidad;
 *   la aprobación posterior detecta la cuenta/contacto por su deduplicación
 *   normal (nombre/email) y permite reutilizarlos.
 */
import { prisma } from "@/lib/prisma";
import { toSentenceCase } from "@/lib/text-format";

export interface EnsureProspectResult {
  accountId: string;
  contactId: string;
  /** true si se creó un contacto nuevo en esta llamada. */
  createdContact: boolean;
  /** true si se creó una cuenta nueva en esta llamada. */
  createdAccount: boolean;
}

export class EnsureProspectError extends Error {
  constructor(
    message: string,
    readonly code: "lead_not_found" | "missing_email",
  ) {
    super(message);
    this.name = "EnsureProspectError";
  }
}

export async function ensureProspectFromLead(input: {
  tenantId: string;
  userId: string;
  leadId: string;
}): Promise<EnsureProspectResult> {
  const { tenantId, userId, leadId } = input;

  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, tenantId },
  });
  if (!lead) {
    throw new EnsureProspectError("Lead no encontrado", "lead_not_found");
  }

  const email = lead.email?.trim() || null;
  if (!email) {
    throw new EnsureProspectError(
      "El lead no tiene email; no es posible habilitar el portal.",
      "missing_email",
    );
  }

  // 1. Ya vinculado a un contacto válido → devolver tal cual (idempotencia).
  if (lead.convertedContactId) {
    const existing = await prisma.crmContact.findFirst({
      where: { id: lead.convertedContactId, tenantId },
      select: { id: true, accountId: true },
    });
    if (existing) {
      return {
        accountId: existing.accountId,
        contactId: existing.id,
        createdContact: false,
        createdAccount: false,
      };
    }
  }

  const firstName = toSentenceCase(lead.firstName) || "Contacto";
  const lastName = toSentenceCase(lead.lastName) || "";
  const companyName =
    toSentenceCase(lead.companyName) ||
    `${firstName} ${lastName}`.trim() ||
    "Prospecto";

  return prisma.$transaction(async (tx) => {
    // 2. Reutilizar contacto existente por email (criterio del flujo approve).
    const existingContact = await tx.crmContact.findFirst({
      where: { tenantId, email: { equals: email, mode: "insensitive" } },
      select: { id: true, accountId: true },
    });
    if (existingContact) {
      await tx.crmLead.update({
        where: { id: leadId },
        data: {
          convertedAccountId: existingContact.accountId,
          convertedContactId: existingContact.id,
        },
      });
      return {
        accountId: existingContact.accountId,
        contactId: existingContact.id,
        createdContact: false,
        createdAccount: false,
      };
    }

    // 3. Reutilizar cuenta existente por nombre, o crear cuenta prospecto.
    let createdAccount = false;
    let account = await tx.crmAccount.findFirst({
      where: { tenantId, name: { equals: companyName, mode: "insensitive" } },
      select: { id: true },
    });
    if (!account) {
      account = await tx.crmAccount.create({
        data: {
          tenantId,
          name: companyName,
          industry: lead.industry || null,
          website: lead.website || null,
          address: lead.address || null,
          commune: lead.commune || null,
          city: lead.city || null,
          source: lead.source || "lead_presentation",
          type: "prospect",
          status: "prospect",
          isActive: false,
          ownerId: userId,
          portalEjecutivoId: userId,
        },
        select: { id: true },
      });
      createdAccount = true;
    }

    // 4. Crear contacto bajo esa cuenta. Es primario si la cuenta no tiene uno.
    const hasPrimary = await tx.crmContact.findFirst({
      where: { tenantId, accountId: account.id, isPrimary: true },
      select: { id: true },
    });
    const contact = await tx.crmContact.create({
      data: {
        tenantId,
        accountId: account.id,
        firstName,
        lastName,
        email,
        phone: lead.phone || null,
        isPrimary: !hasPrimary,
      },
      select: { id: true },
    });

    // 5. Puntero de trazabilidad en el lead (sin marcarlo convertido).
    await tx.crmLead.update({
      where: { id: leadId },
      data: {
        convertedAccountId: account.id,
        convertedContactId: contact.id,
      },
    });

    return {
      accountId: account.id,
      contactId: contact.id,
      createdContact: true,
      createdAccount,
    };
  });
}
