/**
 * Funciones puras del corpus de licitación (testeables sin Prisma/R2).
 */
import {
  DOC_TEXT_MAX_TOTAL,
  truncateDocText,
} from "@/lib/ai/document-text-budget";

export const LICITACION_TIPO_CODIGOS = {
  bases: "bases_licitacion",
  qa: "qa_licitacion",
  anexos: "anexos_licitacion",
} as const;

export const LICITACION_TIPO_SET = new Set<string>(Object.values(LICITACION_TIPO_CODIGOS));

export type LicitacionKind = "bases" | "qa" | "anexos";

export type CorpusChunk = {
  fileId: string;
  fileName: string;
  kind: LicitacionKind;
  tipoCodigo: string;
  text: string;
  truncated: boolean;
  status: "ok" | "error" | "stale" | "pending";
  error?: string;
};

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function suggestTipoFromFileName(fileName: string): string | null {
  const n = fileName.toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(bases|pliego|tdr|terms?\s*of\s*ref|licitaci[oó]n)\b/.test(n)) {
    return LICITACION_TIPO_CODIGOS.bases;
  }
  if (/\b(q\s*&?\s*a|preguntas|respuestas|aclaraci|addenda|circulares?)\b/.test(n)) {
    return LICITACION_TIPO_CODIGOS.qa;
  }
  if (/\b(anexo|anexos|ap[eé]ndice|appendix)\b/.test(n)) {
    return LICITACION_TIPO_CODIGOS.anexos;
  }
  return null;
}

export function kindFromCodigo(codigo: string): LicitacionKind | null {
  if (codigo === LICITACION_TIPO_CODIGOS.bases) return "bases";
  if (codigo === LICITACION_TIPO_CODIGOS.qa) return "qa";
  if (codigo === LICITACION_TIPO_CODIGOS.anexos) return "anexos";
  return null;
}

const KIND_PRIORITY: LicitacionKind[] = ["bases", "qa", "anexos"];

export function assembleCorpusChunks(
  files: Array<{
    id: string;
    fileName: string;
    tipoCodigo: string;
    text: string | null;
    status: string | null;
    error: string | null;
  }>,
  budget = DOC_TEXT_MAX_TOTAL,
): { chunks: CorpusChunk[]; truncated: boolean } {
  const prepared: CorpusChunk[] = [];
  for (const f of files) {
    const kind = kindFromCodigo(f.tipoCodigo);
    if (!kind) continue;
    const status =
      f.status === "ok" || f.status === "error" || f.status === "stale" || f.status === "pending"
        ? f.status
        : "pending";
    prepared.push({
      fileId: f.id,
      fileName: f.fileName,
      kind,
      tipoCodigo: f.tipoCodigo,
      text: f.text ?? "",
      truncated: false,
      status,
      error: f.error ?? undefined,
    });
  }
  prepared.sort((a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind));

  const chunks: CorpusChunk[] = [];
  let used = 0;
  let truncated = false;
  for (const c of prepared) {
    if (c.status !== "ok" || !c.text) {
      chunks.push(c);
      continue;
    }
    const remaining = budget - used;
    if (remaining <= 0) {
      truncated = true;
      chunks.push({ ...c, text: "", truncated: true });
      continue;
    }
    const sliced = truncateDocText(c.text, remaining, { label: c.fileName });
    used += sliced.text.length;
    if (sliced.truncated) truncated = true;
    chunks.push({ ...c, text: sliced.text, truncated: sliced.truncated });
  }
  return { chunks, truncated };
}

export function licitacionGenerationGate(
  hasBases: boolean,
  basesError: string | null,
): string | null {
  if (hasBases) return null;
  return (
    basesError ??
    "No hay Bases clasificadas con texto extraído. Clasificá el archivo de bases en la ficha del negocio y reprocesá la extracción."
  );
}
