/**
 * Resuelve contenido de documento para visualización/export.
 * SIEMPRE usa la plantilla + datos actuales del guardia cuando existan,
 * para que cambios en "Datos del contrato" se reflejen de inmediato.
 */

import { prisma } from "@/lib/prisma";
import {
  resolveDocument,
  buildGuardiaEntityData,
  buildEmpresaEntityData,
  enrichGuardiaWithSalary,
} from "./token-resolver";

type SignerForResolve = {
  id: string;
  name: string;
  signingOrder: number;
  status: string;
  signedAt: Date | null;
};

function formatSignDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

function resolveSignatureTokensInContent(
  content: unknown,
  ctx: {
    sentAt: Date | null;
    signedAt: Date | null;
    currentRecipientId: string;
    signers: SignerForResolve[];
  }
): unknown {
  if (!content || typeof content !== "object") return content;
  const node = content as { type?: string; attrs?: { tokenKey?: string }; content?: unknown[] };
  if (Array.isArray(content)) {
    return (content as unknown[]).map((child) => resolveSignatureTokensInContent(child, ctx));
  }
  if (node.type === "contractToken" && node.attrs?.tokenKey) {
    const key = node.attrs.tokenKey as string;
    if (key === "signature.sentDate") return { type: "text", text: formatSignDate(ctx.sentAt) };
    if (key === "signature.signedDate") return { type: "text", text: formatSignDate(ctx.signedAt) };
    const effectiveKey = key === "signature.placeholder" || key === "signature.firmaGuardia" ? "signature.signer_1" : key;
    const signerMatch = /^signature\.signer_(\d+)$/.exec(effectiveKey);
    if (signerMatch) {
      const order = parseInt(signerMatch[1], 10);
      const signer = ctx.signers.find((s) => s.signingOrder === order);
      if (!signer) return { type: "text", text: "[—]" };
      if (signer.id === ctx.currentRecipientId) return { type: "text", text: "[Tu firma aquí]" };
      if (signer.status === "signed")
        return { type: "text", text: `[Firmado por ${signer.name} el ${formatSignDate(signer.signedAt)}]` };
      return { type: "text", text: "[Pendiente]" };
    }
  }
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map((child) => resolveSignatureTokensInContent(child, ctx)),
    };
  }
  return content;
}

function normalizeContent(raw: unknown): { type: "doc"; content: unknown[] } {
  if (!raw) return { type: "doc", content: [] };
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return { type: "doc", content: [] };
    }
  }
  const obj = raw as Record<string, unknown>;
  if (obj.type === "doc" && Array.isArray(obj.content)) return obj as { type: "doc"; content: unknown[] };
  if (Array.isArray(obj.content)) return { type: "doc", content: obj.content };
  if (Array.isArray(obj)) return { type: "doc", content: obj };
  return { type: "doc", content: [] };
}

export type ResolveDocumentContentOptions = {
  tenantId: string;
  documentId: string;
  document: {
    content: unknown;
    templateId?: string | null;
    module?: string | null;
  };
  /** Override: usar este guardia en lugar de la asociación del documento (ej. preview con ?guardiaId=) */
  guardiaIdOverride?: string | null;
  /** Para firma: resolver tokens signature.signer_N, etc. */
  signatureContext?: {
    recipientId: string;
    signers: SignerForResolve[];
    sentAt: Date | null;
    signedAt: Date | null;
  };
};

/**
 * Resuelve el contenido de un documento para visualización o export.
 * - Si tiene templateId y asociación a guardia: usa PLANTILLA + datos ACTUALES del guardia (contractStartDate, etc.)
 * - Si no: usa document.content almacenado
 * - Si hay signatureContext: resuelve tokens de firma
 */
export async function resolveDocumentContentForDisplay(
  opts: ResolveDocumentContentOptions
): Promise<{ type: "doc"; content: unknown[] }> {
  const { tenantId, documentId, document, signatureContext, guardiaIdOverride } = opts;

  let docForResolve: { type: string; content: unknown[] };
  let guardiaId: string | null = guardiaIdOverride ?? null;

  if (guardiaId == null) {
    const guardAssoc = await prisma.docAssociation.findFirst({
      where: { documentId, entityType: "ops_guardia" },
      select: { entityId: true },
    });
    guardiaId = guardAssoc?.entityId ?? null;
  }

  // CRÍTICO: Si hay template y guardia, usar PLANTILLA (tiene tokens) + datos frescos del guardia
  if (document.templateId && guardiaId) {
    const template = await prisma.docTemplate.findFirst({
      where: { id: document.templateId, tenantId },
    });
    const tplContent = template?.content as { type?: string; content?: unknown[] } | null;
    const tplHasContent = tplContent && typeof tplContent === "object" && Array.isArray(tplContent.content) && tplContent.content.length > 0;
    if (tplHasContent) {
      docForResolve = tplContent as { type: string; content: unknown[] };
    } else {
      docForResolve = normalizeContent(document.content);
    }
  } else {
    docForResolve = normalizeContent(document.content);
  }

  // Resolver tokens {{guardia.xxx}}, {{empresa.xxx}}, condicionales {{#if}}
  if (guardiaId && document.module === "payroll") {
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
      include: {
        persona: true,
        currentInstallation: { select: { name: true, address: true, commune: true, city: true } },
        bankAccounts: { where: { isDefault: true }, take: 1 },
      },
    });

    if (guardia) {
      let rawEmpresa = await prisma.setting.findMany({
        where: { tenantId, key: { startsWith: `empresa:${tenantId}:` } },
      });
      if (rawEmpresa.length === 0) {
        rawEmpresa = await prisma.setting.findMany({
          where: { tenantId, key: { startsWith: "empresa." } },
        });
      }
      const empresaSettings = rawEmpresa.map((s) => ({
        key: s.key.includes(":") ? s.key.replace(`empresa:${tenantId}:`, "") : s.key,
        value: s.value,
      }));
      let empresaData = buildEmpresaEntityData(empresaSettings);
      const autoFirma = empresaSettings.find((s) => s.key === "empresa.autoFirmaRepLegalContratos")?.value === "true";
      if (!autoFirma) empresaData = { ...empresaData, firmaRepLegal: null };

      const activeAssignment = await prisma.opsAsignacionGuardia.findFirst({
        where: { guardiaId: guardia.id, isActive: true },
        include: { puesto: { include: { cargo: { select: { name: true } } } } },
        orderBy: { startDate: "desc" },
      });

      let guardiaData = buildGuardiaEntityData(guardia as any);
      guardiaData.cargo = activeAssignment?.puesto?.cargo?.name ?? "Guardia de Seguridad";
      guardiaData = await enrichGuardiaWithSalary(guardiaData, guardia.id);

      const { resolvedContent } = resolveDocument(docForResolve, {
        empresa: empresaData,
        guardia: guardiaData,
      });
      docForResolve = resolvedContent as { type: string; content: unknown[] };
    }
  }

  // Resolver tokens de firma si hay contexto
  if (signatureContext) {
    const resolved = resolveSignatureTokensInContent(
      JSON.parse(JSON.stringify(docForResolve)),
      {
        sentAt: signatureContext.sentAt,
        signedAt: signatureContext.signedAt,
        currentRecipientId: signatureContext.recipientId,
        signers: signatureContext.signers,
      }
    );
    docForResolve = resolved as { type: string; content: unknown[] };
  }

  // Fallback final: si el contenido quedó vacío pero document.content tiene datos, usarlo
  const hasContent = docForResolve?.content && Array.isArray(docForResolve.content) && docForResolve.content.length > 0;
  if (!hasContent && opts.document.content) {
    const stored = normalizeContent(opts.document.content);
    if (stored.content.length > 0) {
      docForResolve = stored;
    }
  }

  return docForResolve as { type: "doc"; content: unknown[] };
}
