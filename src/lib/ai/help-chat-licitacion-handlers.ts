/**
 * Tools de propuesta de licitación / edición de presentación comercial.
 * Patrón preview → confirm (storePreview/consumePreview) + gate duro de bases.
 */
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import type { RolePermissions } from "@/lib/permissions";
import type { PreviewBackedToolName } from "@/lib/ai/dte-preview-cache";
import { consumePreview, storePreview } from "@/lib/ai/dte-preview-cache";
import { hcAiLog, hcCanReadQuotes, hcCanWriteQuotes } from "@/lib/ai/help-chat-cpq-ai-shared";
import { resolveAiHelpChatCpqQuote } from "@/lib/ai/help-chat-ai-cpq-quote";
import { prisma } from "@/lib/prisma";
import {
  buildLicitacionCorpus,
  formatCorpusForPrompt,
  licitacionGenerationGate,
} from "@/modules/crm/documents/licitacion-ingest.service";
import { proposeLicitacionIndex } from "@/lib/cpq/proposal-sections/propose-index";
import { generateProposalSection } from "@/lib/cpq/proposal-sections/generate-section";
import { generateProposalSectionsBatch } from "@/lib/cpq/proposal-sections/generate-batch";
import { ensureFixedSectionsSeeded, listFixedSections } from "@/lib/cpq/fixed-sections";
import { loadQuoteProposal, saveQuoteProposal } from "@/lib/cpq/proposal-sections/persist";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import { hasRealDotacion, loadDotacionPositions } from "@/lib/cpq/proposal-sections/build-dotacion";
import { resolveQuoteForDeal } from "@/lib/cpq/proposal-sections/resolve-quote";
import {
  addSection,
  approveSection,
  mergeSections,
  moveToExclusiones,
  ProposalIndexError,
  removeSection,
  renameSection,
  reorderSections,
  replaceIndex,
  setSectionContent,
  unapproveSection,
} from "@/lib/cpq/proposal-sections/ops";
import {
  OFERTA_ECONOMICA_KIND,
  readProposalContent,
  SECTION_ORIGINS,
  type ProposalContentV2,
  type ProposalSectionOrigin,
} from "@/lib/cpq/proposal-sections/schema";
import { deriveComplianceMatrix, formatComplianceMatrixText } from "@/lib/cpq/proposal-sections/compliance-matrix";
import { validateProposalContent } from "@/lib/cpq/proposal-sections/validate";

type PageCx = HelpChatPageContext | null | undefined;

function asStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

async function previewFlow(
  toolName: PreviewBackedToolName,
  tenantId: string,
  userId: string,
  computed: Record<string, unknown>,
  args: Record<string, unknown>,
) {
  const token = storePreview({ tenantId, userId, toolName, args, computed });
  return {
    ok: true,
    data: {
      previewToken: token,
      expireMinutes: 5,
      reminder:
        "Mostrá el índice/cambio al usuario con :::cards. Se aplicará SOLO al confirmar (tarjeta o confirmación explícita).",
      ...computed,
    },
  };
}

function consumeOrArgs(
  toolName: PreviewBackedToolName,
  tenantId: string,
  userId: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const token = asStr(args, "previewToken");
  if (!token) return args;
  const cached = consumePreview(token, tenantId, userId, toolName);
  if (!cached) {
    throw new Error("PREVIEW_EXPIRED");
  }
  return { ...cached.args, ...cached.computed, ...args };
}

async function resolveDealId(
  tenantId: string,
  pageContext: PageCx,
  args: Record<string, unknown>,
): Promise<string | null> {
  if (asStr(args, "dealId")) return asStr(args, "dealId")!;
  if (pageContext?.entityType === "crm_deal") return pageContext.entityId;
  if (pageContext?.entityType === "cpq_quote") {
    const q = await prisma.cpqQuote.findFirst({
      where: { id: pageContext.entityId, tenantId },
      select: { dealId: true },
    });
    return q?.dealId ?? null;
  }
  return null;
}

async function resolveTargetQuote(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<{ ok: true; quoteId: string; code: string } | { ok: false; error: string; quotes?: unknown }> {
  if (!hcCanReadQuotes(perms)) return { ok: false, error: "Sin permiso para ver cotizaciones." };
  const dealId = await resolveDealId(tenantId, pageContext, args);
  if (dealId) {
    return resolveQuoteForDeal({
      tenantId,
      dealId,
      userId,
      conversationId: pageContext?.conversationId,
      quoteIdOrCode: asStr(args, "quoteIdOrCode"),
    });
  }
  try {
    const q = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    return { ok: true, quoteId: q.id, code: q.code ?? q.id };
  } catch {
    return { ok: false, error: "Indicá la cotización (código CPQ) o abrí el chat desde el negocio/cotización." };
  }
}

async function cpqContext(tenantId: string, quoteId: string) {
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: {
      code: true,
      name: true,
      clientName: true,
      totalGuards: true,
      totalPositions: true,
      installation: { select: { name: true } },
    },
  });
  return {
    code: quote?.code ?? "",
    name: quote?.name,
    clientName: quote?.clientName,
    staffingSummary: quote
      ? `${quote.totalPositions} puestos / ${quote.totalGuards} guardias`
      : null,
    installationName: quote?.installation?.name ?? null,
  };
}

async function requireLicitacionGate(tenantId: string, dealId: string | null) {
  if (!dealId) {
    return "Esta acción de licitación requiere un negocio. Abrí el chat desde la ficha del negocio.";
  }
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { isLicitacion: true },
  });
  if (!deal?.isLicitacion) {
    return "El negocio no está marcado como licitación. Activalo en la ficha para generar la propuesta técnica.";
  }
  const corpus = await buildLicitacionCorpus(tenantId, dealId);
  const gate = licitacionGenerationGate(corpus.hasBases, corpus.basesError);
  if (gate) return gate;
  return { corpus };
}

export async function aiTool_preview_licitacion_indice(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "preview_licitacion_indice", args, status: "denied", startedAt: t0 });
    return { ok: false, error: "Sin permiso de escritura CPQ." };
  }
  const dealId = await resolveDealId(tenantId, pageContext, args);
  const gated = await requireLicitacionGate(tenantId, dealId);
  if (typeof gated === "string") {
    await hcAiLog({ tenantId, userId, toolName: "preview_licitacion_indice", args, status: "validation_error", errorMessage: gated, startedAt: t0 });
    return { ok: false, error: gated };
  }
  const target = await resolveTargetQuote(tenantId, userId, perms, args, pageContext);
  if (!target.ok) return target;
  const cpq = await cpqContext(tenantId, target.quoteId);
  const proposed = await proposeLicitacionIndex({
    tenantId,
    corpus: gated.corpus,
    cpq,
  });
  await hcAiLog({ tenantId, userId, toolName: "preview_licitacion_indice", args, status: "success", resultEntityId: target.quoteId, resultEntityType: "cpq_quote", startedAt: t0 });
  return previewFlow(
    "licitacion_aplicar_indice",
    tenantId,
    userId,
    {
      quoteId: target.quoteId,
      quoteCode: target.code,
      items: proposed.items,
      truncatedCorpus: proposed.truncatedCorpus,
      fallback: proposed.fallback,
      warning: proposed.warning,
      previewCards: proposed.items.map((it) => ({
        title: it.title,
        subtitle: [it.ref, it.rationale].filter(Boolean).join(" · "),
        badge: it.invariant ? "invariante" : "propuesta",
      })),
    },
    { ...args, quoteIdOrCode: target.quoteId },
  );
}

export async function aiTool_licitacion_aplicar_indice(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    return { ok: false, error: "Sin permiso de escritura CPQ." };
  }
  let merged: Record<string, unknown>;
  try {
    merged = consumeOrArgs("licitacion_aplicar_indice", tenantId, userId, args);
  } catch {
    return { ok: false, error: "La previsualización expiró (15 min). Volvé a pedir el índice." };
  }
  const target = await resolveTargetQuote(tenantId, userId, perms, merged, pageContext);
  if (!target.ok) return target;
  const dealId = await resolveDealId(tenantId, pageContext, merged);
  const gated = await requireLicitacionGate(tenantId, dealId);
  if (typeof gated === "string") return { ok: false, error: gated };

  const items = Array.isArray(merged.items) ? (merged.items as Array<Record<string, unknown>>) : [];
  if (!items.length) return { ok: false, error: "No hay índice para aplicar. Pedí primero 'genera el índice'." };

  const { content } = await loadQuoteProposal({
    tenantId,
    quoteId: target.quoteId,
    preferredMode: "licitacion",
  });
  content.mode = "licitacion";
  const next = replaceIndex(
    content,
    items.map((it) => ({
      title: String(it.title ?? ""),
      ref: typeof it.ref === "string" ? it.ref : null,
      sources: Array.isArray(it.sources) ? it.sources.map(String) : [],
      invariant:
        it.invariant === "identificacion" || it.invariant === "exclusiones" || it.invariant === "matriz"
          ? it.invariant
          : undefined,
      kind: it.kind === OFERTA_ECONOMICA_KIND ? OFERTA_ECONOMICA_KIND : undefined,
      origin:
        typeof it.origin === "string" && (SECTION_ORIGINS as readonly string[]).includes(it.origin)
          ? (it.origin as ProposalSectionOrigin)
          : undefined,
    })),
  );
  const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: next });
  await hcAiLog({ tenantId, userId, toolName: "licitacion_aplicar_indice", args: merged, status: "success", resultEntityId: target.quoteId, resultEntityType: "cpq_quote", startedAt: t0 });
  return {
    ok: true,
    data: {
      quoteCode: target.code,
      sections: saved.sections.map((s) => ({ id: s.id, title: s.title, invariant: s.invariant, status: s.status })),
      truncatedCorpus: Boolean(merged.truncatedCorpus),
    },
  };
}

type CambioAction = "add" | "merge" | "rename" | "reorder" | "remove" | "moveToExclusiones" | "setContent";

function applyCambio(content: ProposalContentV2, merged: Record<string, unknown>): ProposalContentV2 {
  const action = asStr(merged, "action") as CambioAction | undefined;
  if (action === "add") {
    return addSection(content, {
      title: asStr(merged, "title") ?? "",
      content: asStr(merged, "content"),
      ref: asStr(merged, "ref") ?? null,
      afterId: asStr(merged, "afterId"),
    });
  }
  if (action === "merge") {
    return mergeSections(content, asStr(merged, "sectionId") ?? "", asStr(merged, "otherSectionId") ?? "", asStr(merged, "title"));
  }
  if (action === "rename") {
    return renameSection(content, asStr(merged, "sectionId") ?? "", asStr(merged, "title") ?? "");
  }
  if (action === "reorder") {
    const ids = Array.isArray(merged.orderedIds) ? merged.orderedIds.map(String) : [];
    return reorderSections(content, ids);
  }
  if (action === "remove") {
    return removeSection(content, asStr(merged, "sectionId") ?? "");
  }
  if (action === "moveToExclusiones") {
    return moveToExclusiones(content, asStr(merged, "sectionId") ?? "", asStr(merged, "note"));
  }
  if (action === "setContent") {
    return setSectionContent(content, asStr(merged, "sectionId") ?? "", asStr(merged, "content") ?? "");
  }
  throw new ProposalIndexError("Acción de índice no reconocida");
}

export async function aiTool_preview_licitacion_cambio(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  if (!hcCanWriteQuotes(perms)) return { ok: false, error: "Sin permiso de escritura CPQ." };
  const target = await resolveTargetQuote(tenantId, userId, perms, args, pageContext);
  if (!target.ok) return target;
  const { content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId, preferredMode: "licitacion" });
  try {
    const next = applyCambio(content, args);
    return previewFlow(
      "licitacion_aplicar_cambio",
      tenantId,
      userId,
      {
        quoteId: target.quoteId,
        action: asStr(args, "action"),
        summary: `Aplicar ${asStr(args, "action")} sobre la propuesta ${target.code}`,
        nextTitles: next.sections.map((s) => s.title),
      },
      { ...args, quoteIdOrCode: target.quoteId },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cambio inválido" };
  }
}

export async function aiTool_licitacion_aplicar_cambio(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) return { ok: false, error: "Sin permiso de escritura CPQ." };
  let merged: Record<string, unknown>;
  try {
    merged = consumeOrArgs("licitacion_aplicar_cambio", tenantId, userId, args);
  } catch {
    return { ok: false, error: "La previsualización expiró. Volvé a pedir el cambio." };
  }
  const target = await resolveTargetQuote(tenantId, userId, perms, merged, pageContext);
  if (!target.ok) return target;
  const { content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId, preferredMode: "licitacion" });
  try {
    const next = applyCambio(content, merged);
    const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: next });
    await hcAiLog({ tenantId, userId, toolName: "licitacion_aplicar_cambio", args: merged, status: "success", resultEntityId: target.quoteId, resultEntityType: "cpq_quote", startedAt: t0 });
    return { ok: true, data: { sections: saved.sections.map((s) => ({ id: s.id, title: s.title, status: s.status })) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo aplicar" };
  }
}

export async function aiTool_preview_licitacion_regenerar(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  if (!hcCanWriteQuotes(perms)) return { ok: false, error: "Sin permiso de escritura CPQ." };
  const dealId = await resolveDealId(tenantId, pageContext, args);
  const gated = await requireLicitacionGate(tenantId, dealId);
  if (typeof gated === "string") return { ok: false, error: gated };
  const target = await resolveTargetQuote(tenantId, userId, perms, args, pageContext);
  if (!target.ok) return target;
  const { content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId, preferredMode: "licitacion" });
  const sectionId = asStr(args, "sectionId");
  const section = content.sections.find((s) => s.id === sectionId || s.title === asStr(args, "title"));
  if (!section) return { ok: false, error: "Sección no encontrada. Listá las secciones primero." };
  const cpq = await cpqContext(tenantId, target.quoteId);
  const gen = await generateProposalSection({
    tenantId,
    section,
    instruction: asStr(args, "instruction"),
    corpus: gated.corpus,
    cpq,
    mode: "licitacion",
  });
  return previewFlow(
    "licitacion_regenerar_seccion",
    tenantId,
    userId,
    {
      quoteId: target.quoteId,
      sectionId: section.id,
      title: section.title,
      content: gen.content,
      sources: gen.sources,
      gaps: gen.gaps,
      ref: gen.ref,
      fallback: gen.fallback,
    },
    { ...args, quoteIdOrCode: target.quoteId, sectionId: section.id },
  );
}

export async function aiTool_licitacion_regenerar_seccion(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  if (!hcCanWriteQuotes(perms)) return { ok: false, error: "Sin permiso de escritura CPQ." };
  let merged: Record<string, unknown>;
  try {
    merged = consumeOrArgs("licitacion_regenerar_seccion", tenantId, userId, args);
  } catch {
    return { ok: false, error: "La previsualización expiró. Volvé a pedir la regeneración." };
  }
  const target = await resolveTargetQuote(tenantId, userId, perms, merged, pageContext);
  if (!target.ok) return target;
  const { content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId, preferredMode: "licitacion" });
  const sectionId = asStr(merged, "sectionId") ?? "";
  const body = asStr(merged, "content") ?? "";
  const next = setSectionContent(content, sectionId, body, {
    sources: Array.isArray(merged.sources) ? merged.sources.map(String) : undefined,
    mark: "ia",
  });
  const gaps = Array.isArray(merged.gaps) ? merged.gaps.map(String) : [];
  let withGaps = next;
  if (gaps.length) {
    const excl = next.sections.find((s) => s.invariant === "exclusiones");
    if (excl) {
      withGaps = setSectionContent(
        next,
        excl.id,
        [excl.content.trim(), "Huecos detectados al regenerar:", ...gaps.map((g) => `- ${g}`)].join("\n"),
      );
    }
  }
  const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: withGaps });
  return {
    ok: true,
    data: {
      section: saved.sections.find((s) => s.id === sectionId),
      gaps,
    },
  };
}

/** Tope de secciones por llamada: acota la duración del batch en serverless. */
const GENERAR_SECCIONES_DEFAULT_MAX = 4;
const GENERAR_SECCIONES_HARD_MAX = 6;

/**
 * Genera contenido de secciones de la propuesta en batch (write directo, sin
 * preview: el contenido es regenerable y no destructivo). Devuelve
 * `remainingSectionIds` para que el agente itere hasta `done=true`.
 */
export async function aiTool_licitacion_generar_secciones(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  const t0 = Date.now();
  const TOOL = "licitacion_generar_secciones";
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso de escritura CPQ." };
  }

  const target = await resolveTargetQuote(tenantId, userId, perms, args, pageContext);
  if (!target.ok) return target;

  const { quote, content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId });

  // Modo licitación: mismo gate de bases que el resto de las tools.
  let corpus: Awaited<ReturnType<typeof buildLicitacionCorpus>> | null = null;
  if (content.mode === "licitacion") {
    const dealId = await resolveDealId(tenantId, pageContext, args);
    const gated = await requireLicitacionGate(tenantId, dealId ?? quote.dealId);
    if (typeof gated === "string") {
      await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: gated, startedAt: t0 });
      return { ok: false, error: gated };
    }
    corpus = gated.corpus;
  }

  const scope = asStr(args, "scope") === "all" ? "all" : "missing";
  const rawMax = typeof args.maxSections === "number" ? args.maxSections : undefined;
  const maxSections = Math.min(
    GENERAR_SECCIONES_HARD_MAX,
    Math.max(1, Math.trunc(rawMax ?? GENERAR_SECCIONES_DEFAULT_MAX)),
  );
  const sectionIds = Array.isArray(args.sectionIds) ? args.sectionIds.map(String) : null;

  await ensureFixedSectionsSeeded(tenantId);
  const fixedSections = await listFixedSections(tenantId, { activeOnly: true });
  const positions = await loadDotacionPositions(target.quoteId);

  const batch = await generateProposalSectionsBatch({
    content,
    tenantId,
    quote,
    fixedSections,
    positions,
    corpus,
    onlyMissing: scope === "missing",
    sectionIds,
    maxSections,
  });
  const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: batch.content });

  await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "success", resultEntityId: target.quoteId, resultEntityType: "cpq_quote", startedAt: t0 });
  return {
    ok: true,
    data: {
      quoteCode: target.code,
      mode: saved.mode,
      scope,
      ...batch.progress,
      remainingSectionIds: batch.remainingSectionIds,
      done: batch.remainingSectionIds.length === 0,
      sections: saved.sections.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        hasContent: Boolean(s.content.trim()) || isAutoSection(s),
      })),
    },
  };
}

export async function aiTool_licitacion_estado(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  if (!hcCanWriteQuotes(perms) && asStr(args, "action") !== "get") {
    if (!hcCanReadQuotes(perms)) return { ok: false, error: "Sin permiso." };
  }
  const target = await resolveTargetQuote(tenantId, userId, perms, args, pageContext);
  if (!target.ok) return target;
  const { quote, content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId });
  const action = asStr(args, "action") ?? "get";
  if (action === "get") {
    const matrix = deriveComplianceMatrix(content);
    const positions = await loadDotacionPositions(target.quoteId);
    const validations = validateProposalContent(content, {
      hasDotacion: hasRealDotacion(positions),
    });
    return {
      ok: true,
      data: {
        status: content.status,
        mode: content.mode,
        sections: content.sections.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          invariant: s.invariant,
          ref: s.ref,
        })),
        matrixPreview: formatComplianceMatrixText(matrix),
        validations,
      },
    };
  }
  if (!hcCanWriteQuotes(perms)) return { ok: false, error: "Sin permiso de escritura CPQ." };
  if (action === "approve_section") {
    const next = approveSection(content, asStr(args, "sectionId") ?? "");
    const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: next });
    return { ok: true, data: { sections: saved.sections.map((s) => ({ id: s.id, status: s.status })) } };
  }
  if (action === "approve_all") {
    // Aprueba todas las secciones con contenido; las vacías se reportan sin abortar.
    let next = content;
    const approved: string[] = [];
    const empty: string[] = [];
    for (const s of content.sections) {
      if (isAutoSection(s)) continue;
      if (!s.content.trim()) {
        empty.push(s.title);
        continue;
      }
      next = approveSection(next, s.id);
      approved.push(s.title);
    }
    const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: next });
    return {
      ok: true,
      data: {
        approvedCount: approved.length,
        emptySections: empty,
        status: saved.status,
        sections: saved.sections.map((s) => ({ id: s.id, title: s.title, status: s.status })),
      },
    };
  }
  if (action === "unapprove_section") {
    const next = unapproveSection(content, asStr(args, "sectionId") ?? "");
    const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: next });
    return { ok: true, data: { sections: saved.sections.map((s) => ({ id: s.id, status: s.status })) } };
  }
  if (action === "set_status") {
    const st = asStr(args, "status");
    if (st !== "borrador" && st !== "en_revision" && st !== "aprobada") {
      return { ok: false, error: "Estado inválido (borrador | en_revision | aprobada)." };
    }
    if (st === "aprobada") {
      const positions = await loadDotacionPositions(target.quoteId);
      const v = validateProposalContent(content, {
        hasDotacion: hasRealDotacion(positions),
      });
      if (v.some((x) => x.level === "error")) {
        return { ok: false, error: v.filter((x) => x.level === "error").map((x) => x.message).join(" ") };
      }
      content.status = "aprobada";
      content.approvedBy = userId;
      content.approvedAt = new Date().toISOString();
    } else {
      content.status = st;
    }
    const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content });
    return { ok: true, data: { status: saved.status } };
  }
  return { ok: false, error: "Acción no reconocida" };
}

export async function aiTool_preview_propuesta_editar_seccion(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  if (!hcCanWriteQuotes(perms)) return { ok: false, error: "Sin permiso de escritura CPQ." };
  const target = await resolveTargetQuote(tenantId, userId, perms, args, pageContext);
  if (!target.ok) return target;
  const { content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId, preferredMode: "comercial" });
  const sectionId = asStr(args, "sectionId");
  const title = asStr(args, "title");
  let section = content.sections.find((s) => s.id === sectionId || s.title === title);
  const action = asStr(args, "action") ?? "setContent";
  if (action === "add") {
    return previewFlow(
      "propuesta_editar_seccion",
      tenantId,
      userId,
      { quoteId: target.quoteId, action: "add", title: title ?? "Nueva sección", content: asStr(args, "content") ?? "" },
      { ...args, quoteIdOrCode: target.quoteId },
    );
  }
  if (!section) return { ok: false, error: "Sección no encontrada. Usa licitacion_estado/get o listá títulos." };
  const instruction = asStr(args, "instruction");
  if (instruction) {
    const cpq = await cpqContext(tenantId, target.quoteId);
    const gen = await generateProposalSection({
      tenantId,
      section,
      instruction,
      corpus: null,
      cpq,
      mode: "comercial",
    });
    return previewFlow(
      "propuesta_editar_seccion",
      tenantId,
      userId,
      {
        quoteId: target.quoteId,
        action: "setContent",
        sectionId: section.id,
        title: section.title,
        content: gen.content,
      },
      { ...args, quoteIdOrCode: target.quoteId, sectionId: section.id },
    );
  }
  return previewFlow(
    "propuesta_editar_seccion",
    tenantId,
    userId,
    {
      quoteId: target.quoteId,
      action,
      sectionId: section.id,
      title: title ?? section.title,
      content: asStr(args, "content") ?? section.content,
    },
    { ...args, quoteIdOrCode: target.quoteId, sectionId: section.id },
  );
}

export async function aiTool_propuesta_editar_seccion(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
) {
  if (!hcCanWriteQuotes(perms)) return { ok: false, error: "Sin permiso de escritura CPQ." };
  let merged: Record<string, unknown>;
  try {
    merged = consumeOrArgs("propuesta_editar_seccion", tenantId, userId, args);
  } catch {
    return { ok: false, error: "La previsualización expiró." };
  }
  const target = await resolveTargetQuote(tenantId, userId, perms, merged, pageContext);
  if (!target.ok) return target;
  const { content } = await loadQuoteProposal({ tenantId, quoteId: target.quoteId, preferredMode: "comercial" });
  try {
    const action = asStr(merged, "action") ?? "setContent";
    const next =
      action === "add"
        ? addSection(content, { title: asStr(merged, "title") ?? "", content: asStr(merged, "content") })
        : applyCambio(readProposalContent(content, "comercial"), { ...merged, action });
    next.mode = content.mode === "licitacion" ? "licitacion" : "comercial";
    const saved = await saveQuoteProposal({ tenantId, quoteId: target.quoteId, content: next });
    return { ok: true, data: { sections: saved.sections.map((s) => ({ id: s.id, title: s.title, status: s.status })) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo editar" };
  }
}

export async function buildLicitacionSystemMessage(opts: {
  tenantId: string;
  pageContext: HelpChatPageContext | null;
}): Promise<string | null> {
  const pc = opts.pageContext;
  if (!pc) return null;
  if (pc.entityType === "crm_deal") {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: pc.entityId, tenantId: opts.tenantId },
      select: { isLicitacion: true, title: true, fechaEntrega: true },
    });
    if (!deal?.isLicitacion) return null;
    const corpus = await buildLicitacionCorpus(opts.tenantId, pc.entityId);
    const gate = licitacionGenerationGate(corpus.hasBases, corpus.basesError);
    return [
      `Contexto LICITACIÓN (negocio ${deal.title}). fechaEntrega=${deal.fechaEntrega?.toISOString().slice(0, 10) ?? "s/f"}.`,
      gate
        ? `GATE: ${gate} No llames tools de generación de índice/secciones hasta que haya bases extraídas.`
        : "Hay bases extraídas. Podés proponer índice con preview_licitacion_indice.",
      formatCorpusForPrompt(corpus).slice(0, 24_000),
      "Tools: preview_licitacion_indice → licitacion_aplicar_indice; preview_licitacion_cambio → licitacion_aplicar_cambio; preview_licitacion_regenerar → licitacion_regenerar_seccion; licitacion_estado. NUNCA inventes. Confirmá cambios estructurales.",
    ].join("\n");
  }
  if (pc.entityType === "cpq_quote") {
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: pc.entityId, tenantId: opts.tenantId },
      select: { dealId: true, code: true, proposalMode: true },
    });
    if (quote?.dealId) {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: quote.dealId, tenantId: opts.tenantId },
        select: { isLicitacion: true, title: true },
      });
      if (deal?.isLicitacion) {
        return buildLicitacionSystemMessage({
          tenantId: opts.tenantId,
          pageContext: {
            entityType: "crm_deal",
            entityId: quote.dealId,
            entityName: deal.title,
            conversationId: pc.conversationId,
          },
        });
      }
    }
    return `Cotización ${quote?.code ?? pc.entityName} (modo comercial). Para editar la presentación usa preview_propuesta_editar_seccion → propuesta_editar_seccion. El PDF técnico clásico no cambia.`;
  }
  return null;
}

export async function buildLeadSystemMessage(opts: {
  tenantId: string;
  pageContext: HelpChatPageContext | null;
}): Promise<string | null> {
  const pc = opts.pageContext;
  if (pc?.entityType !== "crm_lead") return null;
  const lead = await prisma.crmLead.findFirst({
    where: { id: pc.entityId, tenantId: opts.tenantId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      companyName: true,
      notes: true,
      industry: true,
      status: true,
      source: true,
      city: true,
      commune: true,
    },
  });
  if (!lead) return null;
  const links = await prisma.documentoEnlace.findMany({
    where: { tenantId: opts.tenantId, entityType: "lead", entityId: pc.entityId },
    include: { file: { include: { texto: true } } },
    take: 8,
  });
  const atts = links.map((l) => {
    const tx = l.file.texto;
    const excerpt = tx?.status === "ok" ? (tx.text ?? "").slice(0, 4000) : `(extracción ${tx?.status ?? "pendiente"})`;
    return `- ${l.file.fileName}: ${excerpt}`;
  });
  return [
    "Contexto LEAD (solo lectura; no hay tools de escritura sobre el lead en esta fase):",
    JSON.stringify(lead),
    atts.length ? `Adjuntos extraídos:\n${atts.join("\n")}` : "Sin adjuntos extraídos.",
  ].join("\n");
}

export const LICITACION_PREVIEW_TOOLS = new Set([
  "preview_licitacion_indice",
  "preview_licitacion_cambio",
  "preview_licitacion_regenerar",
  "preview_propuesta_editar_seccion",
]);
