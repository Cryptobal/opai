/**
 * Funciones puras del corpus de licitación (testeables sin Prisma/R2).
 */
import {
  DOC_TEXT_MAX_TOTAL,
  truncateDocText,
} from "@/lib/ai/document-text-budget";

export const LICITACION_TIPO_CODIGOS = {
  bases: "bases_licitacion",
  bases_admin: "bases_administrativas_licitacion",
  qa: "qa_licitacion",
  anexos: "anexos_licitacion",
  otros: "otros_licitacion",
} as const;

export type LicitacionTipoCodigo =
  (typeof LICITACION_TIPO_CODIGOS)[keyof typeof LICITACION_TIPO_CODIGOS];

/** Tipos que entran al índice / corpus IA. Excluye Otros respaldos. */
export const LICITACION_CORPUS_KINDS = ["bases", "bases_admin", "qa", "anexos"] as const;

export const LICITACION_CORPUS_TIPO_SET = new Set<string>(
  LICITACION_CORPUS_KINDS.map((k) => LICITACION_TIPO_CODIGOS[k]),
);

/** Todos los tipos clasificables de licitación, incluido Otros (no va al corpus). */
export const LICITACION_TIPO_SET = new Set<string>(Object.values(LICITACION_TIPO_CODIGOS));

export type LicitacionKind = (typeof LICITACION_CORPUS_KINDS)[number];

export const LICITACION_TIPO_UI_LABELS: Record<string, string> = {
  [LICITACION_TIPO_CODIGOS.bases]: "Bases técnicas",
  [LICITACION_TIPO_CODIGOS.bases_admin]: "Bases administrativas",
  [LICITACION_TIPO_CODIGOS.qa]: "Q&A/Aclaraciones",
  [LICITACION_TIPO_CODIGOS.anexos]: "Anexos",
  [LICITACION_TIPO_CODIGOS.otros]: "Otros respaldos",
};

export const LICITACION_CLASSIFY_OPTIONS: Array<{ codigo: string; nombre: string }> = [
  { codigo: LICITACION_TIPO_CODIGOS.bases, nombre: LICITACION_TIPO_UI_LABELS[LICITACION_TIPO_CODIGOS.bases] },
  { codigo: LICITACION_TIPO_CODIGOS.bases_admin, nombre: LICITACION_TIPO_UI_LABELS[LICITACION_TIPO_CODIGOS.bases_admin] },
  { codigo: LICITACION_TIPO_CODIGOS.qa, nombre: LICITACION_TIPO_UI_LABELS[LICITACION_TIPO_CODIGOS.qa] },
  { codigo: LICITACION_TIPO_CODIGOS.anexos, nombre: LICITACION_TIPO_UI_LABELS[LICITACION_TIPO_CODIGOS.anexos] },
  { codigo: LICITACION_TIPO_CODIGOS.otros, nombre: LICITACION_TIPO_UI_LABELS[LICITACION_TIPO_CODIGOS.otros] },
];

export const LICITACION_TIPO_CATALOG: Array<{
  codigo: string;
  nombre: string;
  useAsAiKnowledge: boolean;
  order: number;
}> = [
  { codigo: LICITACION_TIPO_CODIGOS.bases, nombre: "Bases de licitación", useAsAiKnowledge: true, order: 40 },
  { codigo: LICITACION_TIPO_CODIGOS.qa, nombre: "Preguntas y respuestas (Q&A)", useAsAiKnowledge: true, order: 41 },
  { codigo: LICITACION_TIPO_CODIGOS.anexos, nombre: "Anexos de licitación", useAsAiKnowledge: true, order: 42 },
  { codigo: LICITACION_TIPO_CODIGOS.bases_admin, nombre: "Bases administrativas", useAsAiKnowledge: true, order: 43 },
  { codigo: LICITACION_TIPO_CODIGOS.otros, nombre: "Otros respaldos", useAsAiKnowledge: false, order: 44 },
];

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

export function licitacionTipoLabel(codigo: string | null | undefined): string {
  if (!codigo) return "Sin tipo";
  return LICITACION_TIPO_UI_LABELS[codigo] ?? codigo;
}

/** PDF de propuesta técnica generado por OPAI (nunca cuenta como pendiente de pliego). */
export function isGeneratedProposalFileName(fileName: string): boolean {
  const n = fileName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_—–-]+/g, " ");
  const isProposal = /\bpropuesta\s+tecnica\b/.test(n);
  const isDraft = /\(borrador\)|\bborrador\b/.test(n);
  return isProposal && isDraft;
}

export function suggestTipoFromFileName(fileName: string): string | null {
  const n = fileName.toLowerCase().replace(/[_-]+/g, " ");
  // Bases administrativas ANTES del regex genérico de bases: "bases administrativas"
  // no debe clasificarse como bases técnicas.
  if (/\badministrativ/.test(n)) {
    return LICITACION_TIPO_CODIGOS.bases_admin;
  }
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

/**
 * Tipo a persistir al subir: explícito (no Auto) gana; si no, propuesta generada
 * → Otros; si no, sugerencia por nombre; si no hay match → sin tipo.
 */
export function resolveLicitacionTipoOnUpload(
  fileName: string,
  explicitCodigo?: string | null,
): string | null {
  const explicit = explicitCodigo?.trim() || "";
  if (explicit && explicit !== "auto") {
    return LICITACION_TIPO_SET.has(explicit) ? explicit : null;
  }
  if (isGeneratedProposalFileName(fileName)) return LICITACION_TIPO_CODIGOS.otros;
  return suggestTipoFromFileName(fileName);
}

export function fileNeedsLicitacionClassification(opts: {
  tipoCodigo: string | null;
  tipoId: string | null;
  needsClassificationFlag: boolean;
  fileName?: string;
}): boolean {
  if (opts.tipoCodigo === LICITACION_TIPO_CODIGOS.otros) return false;
  if (opts.fileName && isGeneratedProposalFileName(opts.fileName) && !opts.tipoCodigo) {
    return false;
  }
  return opts.needsClassificationFlag || !opts.tipoId;
}

export type LicitacionSlotTone = "ok" | "warn" | "neutral";

export type LicitacionSlotState = {
  label: string;
  short: string;
  tone: LicitacionSlotTone;
};

export function licitacionSlotState(input: {
  present: boolean;
  extracted: boolean;
  hasUnclassified: boolean;
  optional?: boolean;
}): LicitacionSlotState {
  if (input.extracted) {
    return { label: "Clasificado · texto listo", short: "Clasificado ✓", tone: "ok" };
  }
  if (input.present) {
    return { label: "Sin texto extraído", short: "Sin texto", tone: "warn" };
  }
  if (input.hasUnclassified) {
    return { label: "Sin clasificar", short: "Sin clasificar", tone: "warn" };
  }
  if (input.optional) {
    return { label: "Opcional", short: "Opcional", tone: "neutral" };
  }
  return { label: "Falta", short: "Falta", tone: "neutral" };
}

export function kindFromCodigo(codigo: string): LicitacionKind | null {
  if (codigo === LICITACION_TIPO_CODIGOS.bases) return "bases";
  if (codigo === LICITACION_TIPO_CODIGOS.bases_admin) return "bases_admin";
  if (codigo === LICITACION_TIPO_CODIGOS.qa) return "qa";
  if (codigo === LICITACION_TIPO_CODIGOS.anexos) return "anexos";
  return null;
}

const KIND_PRIORITY: LicitacionKind[] = ["bases", "bases_admin", "qa", "anexos"];

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
    "No hay Bases técnicas clasificadas con texto extraído. Clasifica el archivo de bases en Documentos del negocio y reprocesa la extracción."
  );
}
