/**
 * API Route: /api/crm/emails
 * GET - Listar emails con tracking por deal o contacto
 *
 * Query params:
 *   dealId    - filtrar por negocio
 *   contactId - filtrar por contacto (hilo vinculado o coincidencia email)
 *   accountId - filtrar por cuenta
 *   limit     - máximo de resultados (default 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { normalizeEmailAddress } from "@/lib/email-address";
import { requireTenantModule } from '@/lib/require-module';

function buildEmailCandidates(values: Array<string | null | undefined>): string[] {
  const candidates = values.flatMap((value) => {
    const raw = value?.trim() || "";
    const normalized = raw ? normalizeEmailAddress(raw) : "";
    return [raw, normalized].filter(Boolean);
  });

  return Array.from(new Set(candidates));
}

function addMessageEmailFilters(
  filters: Array<Record<string, unknown>>,
  emails: string[]
) {
  for (const email of emails) {
    filters.push({
      fromEmail: { contains: email, mode: "insensitive" },
    });
    filters.push({ toEmails: { has: email } });
    filters.push({ ccEmails: { has: email } });
    filters.push({ bccEmails: { has: email } });
  }
}

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get("dealId");
    const contactId = searchParams.get("contactId");
    const accountId = searchParams.get("accountId");
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

    if (!dealId && !contactId && !accountId) {
      return NextResponse.json(
        { success: false, error: "Se requiere dealId, contactId o accountId" },
        { status: 400 }
      );
    }

    // Build thread filter
    const threadWhere: Record<string, unknown> = {
      tenantId: ctx.tenantId,
    };
    if (dealId) threadWhere.dealId = dealId;
    if (accountId) threadWhere.accountId = accountId;

    // If filtering by contact, include linked threads and email matches
    if (contactId) {
      const contact = await prisma.crmContact.findFirst({
        where: { id: contactId, tenantId: ctx.tenantId },
        select: { email: true },
      });

      if (!contact) {
        return NextResponse.json({ success: true, data: [] });
      }

      const linkedThreads = await prisma.crmEmailThread.findMany({
        where: {
          tenantId: ctx.tenantId,
          contactId,
        },
        select: { id: true },
      });

      const threadIds = linkedThreads.map((thread: { id: string }) => thread.id);
      const emailCandidates = buildEmailCandidates([contact.email]);

      const messageFilters: Array<Record<string, unknown>> = [];
      if (threadIds.length > 0) {
        messageFilters.push({ threadId: { in: threadIds } });
      }
      addMessageEmailFilters(messageFilters, emailCandidates);

      if (messageFilters.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      const messages = await prisma.crmEmailMessage.findMany({
        where: {
          tenantId: ctx.tenantId,
          OR: messageFilters,
        },
        orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
        take: limit,
        include: {
          thread: {
            select: {
              dealId: true,
              accountId: true,
              contactId: true,
              subject: true,
            },
          },
        },
      });

      return NextResponse.json({ success: true, data: messages });
    }

    // Default: filter by thread
    const threads = await prisma.crmEmailThread.findMany({
      where: threadWhere,
      select: { id: true },
    });

    const threadIds = threads.map((thread: { id: string }) => thread.id);
    const messageFilters: Array<Record<string, unknown>> = [];
    if (threadIds.length > 0) {
      messageFilters.push({ threadId: { in: threadIds } });
    }

    if (dealId) {
      const [deal, dealContacts] = await Promise.all([
        prisma.crmDeal.findFirst({
          where: { id: dealId, tenantId: ctx.tenantId },
          select: {
            primaryContact: {
              select: {
                email: true,
              },
            },
          },
        }),
        prisma.crmDealContact.findMany({
          where: { dealId, tenantId: ctx.tenantId },
          select: {
            contact: {
              select: {
                email: true,
              },
            },
          },
        }),
      ]);

      const dealPrimaryEmail =
        (
          deal as { primaryContact?: { email?: string | null } | null } | null
        )?.primaryContact?.email || null;
      const dealContactEmails = dealContacts.map(
        (entry: { contact: { email: string | null } }) => entry.contact.email
      );
      const relatedEmails = buildEmailCandidates([
        dealPrimaryEmail,
        ...dealContactEmails,
      ]);
      addMessageEmailFilters(messageFilters, relatedEmails);
    }

    if (messageFilters.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const messages = await prisma.crmEmailMessage.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: messageFilters,
      },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        thread: {
          select: {
            dealId: true,
            accountId: true,
            contactId: true,
            subject: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
