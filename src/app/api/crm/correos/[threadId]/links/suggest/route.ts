/**
 * POST /api/crm/correos/[threadId]/links/suggest (Copiloto v4):
 * cascada determinista Cuenta → Contacto → Negocio → Cotización →
 * Instalación → Contrato/Factura → Ticket. La IA solo desempata cuando
 * quedan varios candidatos del mismo nivel.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { UNTRUSTED_RULES, wrapUntrusted } from "@/modules/crm/email/ai-untrusted";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";
import { suggestAccountsForThread } from "@/modules/crm/email/suggest-account";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";

export const maxDuration = 30;

type Candidate = {
  entityType: string;
  entityId: string;
  label: string;
  signal: string;
  confidence: "alta" | "media";
};

const COT_RE = /\bCOT-\d{4}-\d{4}\b/i;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const { threadId } = await ctx.params;

  const owned = await requireThreadMailbox({
    tenantId,
    userId: session.user.id,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const { account } = owned;

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: {
      id: true,
      subject: true,
      accountId: true,
      dealId: true,
      contactId: true,
    },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const lastMessages = await prisma.crmEmailMessage.findMany({
    where: { threadId, tenantId, isDraft: false },
    orderBy: { sentAt: "desc" },
    take: 5,
    select: {
      fromEmail: true,
      textBody: true,
      htmlBody: true,
      direction: true,
      subject: true,
    },
  });
  const bodyText = lastMessages
    .map(
      (m) =>
        (m.textBody || m.htmlBody?.replace(/<[^>]+>/g, " ") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000),
    )
    .join("\n");
  const haystack = `${thread.subject}\n${bodyText}`;

  const suggestions: Candidate[] = [];

  // ── Nivel Cuenta (si no hay) ──
  if (!thread.accountId) {
    const accounts = await suggestAccountsForThread(tenantId, threadId);
    for (const a of accounts) {
      suggestions.push({
        entityType: "account",
        entityId: a.id,
        label: a.name,
        signal: a.reason,
        confidence: a.confidence ?? "media",
      });
    }
    // Sin cuenta: devolver solo cuentas (cascada no puede seguir).
    if (suggestions.length === 1 && suggestions[0].confidence === "alta") {
      return NextResponse.json({
        suggestions: suggestions.map(toClient),
      });
    }
    if (suggestions.length > 0) {
      return NextResponse.json({
        suggestions: suggestions.map(toClient),
      });
    }
    return NextResponse.json({ suggestions: [] });
  }

  const accountId = thread.accountId;

  // ── Nivel Contacto ──
  if (!thread.contactId) {
    const externals = new Set<string>();
    for (const m of lastMessages) {
      if (m.direction !== "in") continue;
      for (const e of extractEmailAddresses(m.fromEmail)) {
        externals.add(normalizeEmailAddress(e));
      }
    }
    if (externals.size > 0) {
      const contacts = await prisma.crmContact.findMany({
        where: {
          tenantId,
          accountId,
          OR: Array.from(externals).map((e) => ({
            email: { equals: e, mode: "insensitive" as const },
          })),
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: 5,
      });
      for (const c of contacts) {
        suggestions.push({
          entityType: "contact",
          entityId: c.id,
          label: `${c.firstName} ${c.lastName}`.trim(),
          signal: "Email exacto del participante",
          confidence: "alta",
        });
      }
    }
  }

  // ── Nivel Negocio ──
  if (!thread.dealId) {
    const openDeals = await prisma.crmDeal.findMany({
      where: { tenantId, accountId, status: "open" },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    const byCode = openDeals.filter((d) =>
      haystack.toLowerCase().includes(d.title.toLowerCase().slice(0, 12)),
    );
    const dealPool = byCode.length > 0 ? byCode : openDeals.slice(0, 3);
    for (const d of dealPool) {
      suggestions.push({
        entityType: "deal",
        entityId: d.id,
        label: d.title,
        signal: byCode.length > 0 ? "Mencionado en el correo" : "Negocio abierto reciente",
        confidence: byCode.length === 1 ? "alta" : "media",
      });
    }
  }

  // ── Nivel Cotización ──
  const cotMatch = haystack.match(COT_RE);
  const quoteWhere = {
    tenantId,
    OR: [
      ...(thread.dealId ? [{ dealId: thread.dealId }] : []),
      { accountId },
    ],
  };
  const quotes = await prisma.cpqQuote.findMany({
    where: quoteWhere,
    select: { id: true, code: true, status: true, name: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  const quoteHits = cotMatch
    ? quotes.filter((q) => q.code?.toUpperCase() === cotMatch[0].toUpperCase())
    : quotes.slice(0, 3);
  for (const q of quoteHits) {
    suggestions.push({
      entityType: "quote",
      entityId: q.id,
      label: q.code || q.name || "Cotización",
      signal: cotMatch ? `Código ${cotMatch[0]}` : "Cotización de la cuenta/negocio",
      confidence: cotMatch ? "alta" : "media",
    });
  }

  // ── Nivel Instalación ──
  const installations = await prisma.crmInstallation.findMany({
    where: {
      tenantId,
      accountId,
      ...(thread.dealId ? { OR: [{ activatedByDealId: thread.dealId }, { accountId }] } : {}),
    },
    select: { id: true, name: true, commune: true },
    take: 15,
  });
  const named = installations.filter(
    (i) =>
      (i.name && haystack.toLowerCase().includes(i.name.toLowerCase())) ||
      (i.commune && haystack.toLowerCase().includes(i.commune.toLowerCase())),
  );
  const instPool = named.length > 0 ? named : installations.slice(0, 3);
  for (const i of instPool) {
    suggestions.push({
      entityType: "installation",
      entityId: i.id,
      label: i.name,
      signal: named.length > 0 ? "Nombre/comuna citados" : "Instalación de la cuenta",
      confidence: named.length === 1 ? "alta" : "media",
    });
  }

  // ── Factura / Contrato (folio citado) ──
  const folioMatch = haystack.match(/\b(?:folio|factura)\s*#?\s*(\d{3,})\b/i);
  if (folioMatch) {
    const dtes = await prisma.financeDte.findMany({
      where: {
        tenantId,
        folio: Number(folioMatch[1]) || undefined,
      },
      select: { id: true, folio: true, receiverName: true },
      take: 5,
    });
    for (const d of dtes) {
      suggestions.push({
        entityType: "factura",
        entityId: d.id,
        label: `Folio ${d.folio} · ${d.receiverName}`,
        signal: `Folio ${folioMatch[1]} citado`,
        confidence: "alta",
      });
    }
  }

  // ── Tickets ──
  const ticketCode = haystack.match(/\b(?:TK|INC)-\d+\b/i);
  const instIds = installations.map((i) => i.id);
  if (instIds.length > 0 || ticketCode) {
    const tickets = await prisma.opsTicket.findMany({
      where: {
        tenantId,
        status: { notIn: ["closed", "resolved"] },
        ...(ticketCode
          ? { code: { equals: ticketCode[0], mode: "insensitive" as const } }
          : instIds.length
            ? { installationId: { in: instIds } }
            : {}),
      },
      select: { id: true, code: true, title: true },
      take: 8,
    });
    for (const t of tickets) {
      suggestions.push({
        entityType: "incidente",
        entityId: t.id,
        label: `${t.code} · ${t.title}`,
        signal: ticketCode ? "Código citado" : "Ticket abierto de la instalación",
        confidence: ticketCode ? "alta" : "media",
      });
    }
  }

  // Un solo candidato determinista de confianza alta → sin IA.
  const alta = suggestions.filter((s) => s.confidence === "alta");
  if (alta.length === 1 && suggestions.length === 1) {
    return NextResponse.json({ suggestions: alta.map(toClient) });
  }

  // Desempate IA solo si hay varios del mismo nivel (mismo entityType).
  const byType = new Map<string, Candidate[]>();
  for (const s of suggestions) {
    const arr = byType.get(s.entityType) ?? [];
    arr.push(s);
    byType.set(s.entityType, arr);
  }
  const needsTieBreak = Array.from(byType.values()).some((arr) => arr.length > 1);
  if (!needsTieBreak || suggestions.length === 0) {
    return NextResponse.json({ suggestions: suggestions.map(toClient) });
  }

  const cfg = await aiService.getActiveConfig?.({
    tenantId,
    feature: "correo-link-suggest",
  });
  const providerType = cfg?.providerType ?? "openai";

  const prompt = `De la lista de ENTIDADES CANDIDATAS, elige SOLO las que el correo menciona o a las que claramente se refiere. Responde SOLO JSON: {"sugerencias":[{"entityType":"...","entityId":"...","motivo":"frase breve"}]} — usa EXACTAMENTE los entityId listados; [] si ninguna aplica.
CANDIDATAS:
${suggestions.map((c) => `- ${c.entityType} ${c.entityId}: ${c.label} (${c.signal})`).join("\n")}
${UNTRUSTED_RULES}
${wrapUntrusted(`Asunto: ${thread.subject}\n${bodyText.slice(0, 2500)}`)}`;

  const startedAt = Date.now();
  let raw: Record<string, unknown> = {};
  try {
    raw = (await aiService.generateJSON(prompt, 500, {
      tenantId,
      feature: "correo-link-suggest",
    })) as Record<string, unknown>;
  } catch {
    // Si la IA falla, devolver los deterministas.
    return NextResponse.json({ suggestions: suggestions.map(toClient) });
  }
  logAiUsage({
    tenantId,
    providerType,
    model: cfg?.modelId ?? "json-default",
    feature: "correo-link-suggest",
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(JSON.stringify(raw ?? {}).length / 4),
    durationMs: Date.now() - startedAt,
    metadata: { threadId, candidates: suggestions.length, estimated: true },
  });

  const byKey = new Map(suggestions.map((c) => [`${c.entityType}:${c.entityId}`, c]));
  const sugerencias = Array.isArray(raw?.sugerencias) ? raw.sugerencias : [];
  const picked = sugerencias.flatMap((s: unknown) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const candidate = byKey.get(`${String(o.entityType)}:${String(o.entityId)}`);
    if (!candidate) return [];
    return [
      {
        ...toClient(candidate),
        motivo: typeof o.motivo === "string" ? o.motivo.slice(0, 160) : candidate.signal,
      },
    ];
  });

  // Si la IA no eligió nada, devolver deterministas de confianza alta.
  if (picked.length === 0) {
    return NextResponse.json({
      suggestions: (alta.length > 0 ? alta : suggestions).map(toClient),
    });
  }
  return NextResponse.json({ suggestions: picked });
}

function toClient(c: Candidate) {
  return {
    entityType: c.entityType,
    entityId: c.entityId,
    label: c.label,
    motivo: c.signal,
    signal: c.signal,
    confidence: c.confidence,
  };
}
