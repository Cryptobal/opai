/**
 * Ingesta de texto de documentos CRM de licitación (capa negocio, useAsAiKnowledge)
 * y corpus priorizado Bases > Q&A > Anexos con presupuesto de tokens.
 */
import { prisma } from "@/lib/prisma";
import { extractText } from "@/lib/knowledge/extract";
import { getFileBuffer } from "@/lib/storage";
import {
  DOC_ATTACHMENT_MAX_BYTES,
  DOC_TEXT_MAX_PER_FILE,
  PDF_TEXT_MIN_CHARS,
  docUntrustedBanner,
  truncateDocText,
} from "@/lib/ai/document-text-budget";
import {
  LICITACION_TIPO_CODIGOS,
  LICITACION_TIPO_SET,
  assembleCorpusChunks,
  estimateTokenCount,
  kindFromCodigo,
  licitacionGenerationGate,
  suggestTipoFromFileName,
  type CorpusChunk,
} from "./licitacion-corpus";

export {
  LICITACION_TIPO_CODIGOS,
  LICITACION_TIPO_SET,
  assembleCorpusChunks,
  estimateTokenCount,
  suggestTipoFromFileName,
  kindFromCodigo,
  licitacionGenerationGate,
  type CorpusChunk,
  type LicitacionKind,
} from "./licitacion-corpus";

export type LicitacionCorpus = {
  dealId: string;
  chunks: CorpusChunk[];
  truncated: boolean;
  hasBases: boolean;
  basesError: string | null;
  banner: string;
};

export async function ingestDocumentoTexto(opts: {
  tenantId: string;
  fileId: string;
  force?: boolean;
}): Promise<{ status: "ok" | "error" | "skipped"; tokenCount: number; error?: string }> {
  const file = await prisma.documento.findFirst({
    where: { id: opts.fileId, tenantId: opts.tenantId },
    include: {
      tipo: { select: { codigo: true, useAsAiKnowledge: true, capa: true } },
      texto: true,
    },
  });
  if (!file) return { status: "error", tokenCount: 0, error: "Archivo no encontrado" };

  const shouldIngest =
    file.tipo?.useAsAiKnowledge === true &&
    (file.tipo.capa === "negocio" || LICITACION_TIPO_SET.has(file.tipo.codigo));
  if (!shouldIngest) {
    return { status: "skipped", tokenCount: file.texto?.tokenCount ?? 0 };
  }

  if (
    !opts.force &&
    file.texto?.status === "ok" &&
    file.texto.contentHash &&
    file.contentHash &&
    file.texto.contentHash === file.contentHash
  ) {
    return { status: "ok", tokenCount: file.texto.tokenCount };
  }

  if (!file.storageKey) {
    await upsertTexto(opts.tenantId, file.id, {
      text: "",
      status: "error",
      error: "Archivo sin storageKey: no se puede extraer texto",
      contentHash: file.contentHash,
    });
    return { status: "error", tokenCount: 0, error: "Archivo sin storageKey" };
  }

  try {
    const buffer = await getFileBuffer(file.storageKey, DOC_ATTACHMENT_MAX_BYTES);
    const raw = await extractText(buffer, file.mimeType);
    const trimmed = (raw ?? "").trim();
    if (!trimmed || (file.mimeType === "application/pdf" && trimmed.length < PDF_TEXT_MIN_CHARS)) {
      const msg =
        "PDF sin texto: sube una versión con capa de texto o transcribe. El OCR automático no está disponible.";
      await upsertTexto(opts.tenantId, file.id, {
        text: "",
        status: "error",
        error: msg,
        contentHash: file.contentHash,
      });
      return { status: "error", tokenCount: 0, error: msg };
    }
    const sliced = truncateDocText(trimmed, DOC_TEXT_MAX_PER_FILE, { label: file.fileName });
    const tokenCount = estimateTokenCount(sliced.text);
    await upsertTexto(opts.tenantId, file.id, {
      text: sliced.text,
      status: "ok",
      error: null,
      tokenCount,
      contentHash: file.contentHash,
    });
    return { status: "ok", tokenCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al extraer texto";
    const scanned =
      /tipo de archivo no soportado/i.test(message) || /empty/i.test(message)
        ? `${message}. Si es un PDF escaneado, sube una versión con texto.`
        : message;
    await upsertTexto(opts.tenantId, file.id, {
      text: "",
      status: "error",
      error: scanned.slice(0, 500),
      contentHash: file.contentHash,
    });
    return { status: "error", tokenCount: 0, error: scanned };
  }
}

async function upsertTexto(
  tenantId: string,
  fileId: string,
  data: {
    text: string;
    status: string;
    error: string | null;
    tokenCount?: number;
    contentHash: string | null;
  },
) {
  const tokenCount = data.tokenCount ?? estimateTokenCount(data.text);
  await prisma.documentoTexto.upsert({
    where: { fileId },
    create: {
      tenantId,
      fileId,
      text: data.text,
      tokenCount,
      status: data.status,
      error: data.error,
      contentHash: data.contentHash,
      extractedAt: data.status === "ok" ? new Date() : null,
    },
    update: {
      text: data.text,
      tokenCount,
      status: data.status,
      error: data.error,
      contentHash: data.contentHash,
      extractedAt: data.status === "ok" ? new Date() : undefined,
    },
  });
}

export async function markStaleIfHashChanged(tenantId: string, fileId: string): Promise<void> {
  const file = await prisma.documento.findFirst({
    where: { id: fileId, tenantId },
    select: { contentHash: true, texto: { select: { id: true, contentHash: true, status: true } } },
  });
  if (!file?.texto) return;
  if (file.contentHash && file.texto.contentHash && file.contentHash !== file.texto.contentHash) {
    await prisma.documentoTexto.update({
      where: { id: file.texto.id },
      data: { status: "stale" },
    });
  }
}

export async function buildLicitacionCorpus(
  tenantId: string,
  dealId: string,
): Promise<LicitacionCorpus> {
  const links = await prisma.documentoEnlace.findMany({
    where: { tenantId, entityType: "deal", entityId: dealId },
    include: {
      file: {
        include: {
          tipo: { select: { codigo: true, useAsAiKnowledge: true, capa: true } },
          texto: true,
        },
      },
    },
  });

  const files = links
    .map((l) => l.file)
    .filter((f) => f.tipo && LICITACION_TIPO_SET.has(f.tipo.codigo))
    .map((f) => ({
      id: f.id,
      fileName: f.fileName,
      tipoCodigo: f.tipo!.codigo,
      text: f.texto?.text ?? null,
      status: f.texto?.status ?? (f.contentHash && f.texto?.contentHash !== f.contentHash ? "stale" : null),
      error: f.texto?.error ?? null,
    }));

  const { chunks, truncated } = assembleCorpusChunks(files);
  const bases = chunks.filter((c) => c.kind === "bases");
  const hasBases = bases.some((c) => c.status === "ok" && c.text.trim().length > 0);
  const basesError = !hasBases
    ? bases.find((c) => c.status === "error")?.error ??
      (bases.length === 0
        ? "No hay un documento tipo Bases técnicas clasificado. Clasifica las bases en Documentos del negocio."
        : "Las bases técnicas no tienen texto extraído. Reprocesa o sube una versión con capa de texto.")
    : null;

  return {
    dealId,
    chunks,
    truncated,
    hasBases,
    basesError,
    banner: docUntrustedBanner(),
  };
}

export function formatCorpusForPrompt(corpus: LicitacionCorpus): string {
  const parts = [corpus.banner, ""];
  if (corpus.truncated) {
    parts.push(
      "[AVISO] El corpus superó el presupuesto: se priorizó Bases técnicas > Bases administrativas > Q&A > Anexos y el resto quedó truncado. No inventes el contenido omitido; si falta, va a Exclusiones y supuestos.",
    );
  }
  for (const c of corpus.chunks) {
    parts.push(`--- DOCUMENTO [${c.kind}] ${c.fileName} (id=${c.fileId}) status=${c.status} ---`);
    if (c.status !== "ok") {
      parts.push(c.error || `Extracción ${c.status}. No uses este archivo como fuente de hechos.`);
    } else {
      parts.push(c.text);
    }
    parts.push("--- FIN DOCUMENTO ---");
  }
  return parts.join("\n");
}

export async function hasExtractedBases(tenantId: string, dealId: string): Promise<boolean> {
  const corpus = await buildLicitacionCorpus(tenantId, dealId);
  return corpus.hasBases;
}

export type LicitacionDocRow = {
  fileId: string;
  fileName: string;
  mimeType: string;
  tipoCodigo: string | null;
  tipoNombre: string | null;
  kind: "bases" | "bases_admin" | "qa" | "anexos" | null;
  needsClassification: boolean;
  suggestedCodigo: string | null;
  extractStatus: "ok" | "error" | "stale" | "pending" | "none";
  extractError: string | null;
  tokenCount: number;
  stale: boolean;
};

export async function listDealLicitacionDocs(
  tenantId: string,
  dealId: string,
): Promise<{
  types: Array<{ codigo: string; nombre: string; present: boolean; extracted: boolean }>;
  files: LicitacionDocRow[];
  gate: string | null;
  hasBases: boolean;
}> {
  const tipos = await prisma.tipoDocumento.findMany({
    where: { tenantId, codigo: { in: [...LICITACION_TIPO_SET] } },
    select: { codigo: true, nombre: true },
  });
  const links = await prisma.documentoEnlace.findMany({
    where: { tenantId, entityType: "deal", entityId: dealId },
    include: {
      file: {
        include: {
          tipo: { select: { codigo: true, nombre: true } },
          texto: true,
        },
      },
    },
  });

  const files: LicitacionDocRow[] = links.map((l) => {
    const f = l.file;
    const stale = Boolean(
      f.texto && f.contentHash && f.texto.contentHash && f.contentHash !== f.texto.contentHash,
    );
    const extractStatus: LicitacionDocRow["extractStatus"] = stale
      ? "stale"
      : f.texto?.status === "ok" || f.texto?.status === "error" || f.texto?.status === "pending"
        ? f.texto.status
        : "none";
    const tipoCodigo = f.tipo?.codigo ?? null;
    return {
      fileId: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      tipoCodigo,
      tipoNombre: f.tipo?.nombre ?? null,
      kind: tipoCodigo ? kindFromCodigo(tipoCodigo) : null,
      needsClassification: f.needsClassification || !f.tipoId,
      suggestedCodigo: suggestTipoFromFileName(f.fileName),
      extractStatus,
      extractError: f.texto?.error ?? null,
      tokenCount: f.texto?.tokenCount ?? 0,
      stale,
    };
  });

  const types = (["bases", "bases_admin", "qa", "anexos"] as const).map((kind) => {
    const codigo = LICITACION_TIPO_CODIGOS[kind];
    const tipo = tipos.find((t) => t.codigo === codigo);
    const ofKind = files.filter((f) => f.tipoCodigo === codigo);
    const fallbackNombre =
      kind === "bases"
        ? "Bases técnicas"
        : kind === "bases_admin"
          ? "Bases administrativas"
          : kind === "qa"
            ? "Q&A"
            : "Anexos";
    return {
      codigo,
      nombre: tipo?.nombre ?? fallbackNombre,
      present: ofKind.length > 0,
      extracted: ofKind.some((f) => f.extractStatus === "ok"),
    };
  });

  const corpus = await buildLicitacionCorpus(tenantId, dealId);
  return {
    types,
    files,
    hasBases: corpus.hasBases,
    gate: licitacionGenerationGate(corpus.hasBases, corpus.basesError),
  };
}
