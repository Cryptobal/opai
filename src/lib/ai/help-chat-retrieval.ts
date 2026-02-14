import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

type DocChunk = {
  id: string;
  source: string;
  title: string;
  body: string;
  normalizedText: string;
  tokenSet: Set<string>;
};

export type RetrievalChunk = {
  title: string;
  body: string;
  score: number;
};

type DocsCache = {
  loadedAt: number;
  chunks: DocChunk[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: DocsCache | null = null;

const STOPWORDS = new Set([
  "como",
  "donde",
  "cuando",
  "para",
  "con",
  "sin",
  "que",
  "del",
  "las",
  "los",
  "una",
  "uno",
  "unos",
  "unas",
  "por",
  "esta",
  "este",
  "esto",
  "hay",
  "puedo",
  "quiero",
  "necesito",
  "hacer",
  "saber",
  "funciona",
  "sistema",
]);

const TOKEN_SYNONYMS: Record<string, string[]> = {
  cliente: ["clientes", "cuenta", "cuentas", "account", "accounts", "crm", "prospecto", "prospectos"],
  cuenta: ["cliente", "clientes", "account", "accounts", "crm", "prospecto", "prospectos"],
  ingreso: ["ingresar", "crear", "nuevo", "nueva", "alta", "registrar", "agregar"],
  crear: ["ingresar", "alta", "nuevo", "nueva", "registrar", "agregar"],
  guardia: ["guardias", "postulante", "postulantes", "desvinculado", "desvinculados", "persona", "personas"],
  ronda: ["rondas", "patrulla", "patrullaje", "monitoreo"],
  checkpoint: ["checkpoints", "punto", "puntos", "qr", "codigo", "codigoqr"],
  qr: ["checkpoint", "checkpoints", "codigo", "codigoqr", "marcacion", "marcaciones"],
  marcacion: ["marcaciones", "marcar", "entrada", "salida", "asistencia"],
  programacion: ["programar", "agenda", "horario", "frecuencia", "plantilla", "templates"],
  plantilla: ["plantillas", "template", "templates", "checkpoints", "ronda", "rondas"],
  pauta: ["pauta_mensual", "pauta_diaria", "asistencia", "turno", "turnos", "puesto", "puestos", "series"],
  mensual: ["mes", "pauta_mensual", "planificacion", "planificacionmensual"],
  diaria: ["dia", "pauta_diaria", "asistencia", "asistencias", "reemplazo"],
  puesto: ["puestos", "slot", "slots", "dotacion", "dotacionactiva"],
  asistencia: ["pauta_diaria", "presente", "ausente", "reemplazo", "turnoextra"],
  armar: ["crear", "configurar", "definir", "programar"],
  ruta: ["modulo", "menu", "navegacion", "donde", "acceso", "pantalla"],
  control: ["monitoreo", "seguimiento", "alertas", "dashboard", "gestion"],
  seguridad: ["ronda", "rondas", "guardia", "guardias", "ops"],
  rendicion: ["rendiciones", "gasto", "finanzas", "aprobacion", "aprobar", "pendiente"],
  aprobar: ["aprobacion", "aprobaciones", "pendiente", "pendientes", "rendicion"],
  app: ["aplicacion", "instalar", "descargar", "home", "homescreen", "pantalla", "inicio"],
  instalar: ["app", "aplicacion", "descargar", "acceso", "directo", "home", "homescreen"],
};

export function normalizeWord(word: string): string {
  let w = word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string, keepStopwords = false): string[] {
  return text
    .split(/\s+/)
    .map((raw) => normalizeWord(raw))
    .filter((t) => t.length >= 3)
    .filter((t) => keepStopwords || !STOPWORDS.has(t));
}

export function expandQueryTokens(tokens: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    const synonyms = TOKEN_SYNONYMS[token] ?? [];
    for (const synonym of synonyms) {
      const normalized = normalizeWord(synonym);
      if (normalized.length >= 3) expanded.add(normalized);
    }
  }
  return expanded;
}

function chunkMarkdown(content: string, fileLabel: string): DocChunk[] {
  const lines = content.split("\n");
  const chunks: DocChunk[] = [];

  let currentTitle = fileLabel;
  let buffer: string[] = [];
  let idCounter = 0;

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (!body) return;
    const combined = `${currentTitle}\n${body}`;
    chunks.push({
      id: `${fileLabel}-${idCounter++}`,
      source: fileLabel,
      title: currentTitle,
      body: body.slice(0, 2400),
      normalizedText: tokenize(combined, true).join(" "),
      tokenSet: new Set(tokenize(combined)),
    });
    buffer = [];
  };

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      currentTitle = line.replace(/^#{1,3}\s+/, "").trim() || fileLabel;
      continue;
    }
    buffer.push(line);
    if (buffer.join("\n").length > 1800) {
      flush();
    }
  }
  flush();

  return chunks;
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "_deprecated") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function loadDocsChunks(): Promise<DocChunk[]> {
  const docsDir = path.join(process.cwd(), "docs");
  const files = await listMarkdownFiles(docsDir);
  const chunks: DocChunk[] = [];

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const fileLabel = path.relative(docsDir, file).replace(/\\/g, "/");
    chunks.push(...chunkMarkdown(raw, fileLabel));
  }

  return chunks;
}

async function getChunks(): Promise<DocChunk[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.chunks;
  }
  const chunks = await loadDocsChunks();
  cache = { loadedAt: Date.now(), chunks };
  return chunks;
}

async function semanticSearch(query: string, limit: number): Promise<RetrievalChunk[]> {
  try {
    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0]?.embedding;
    if (!queryEmbedding) return [];

    const vectorLiteral = `[${queryEmbedding.join(",")}]`;

    // Query pgvector for nearest neighbors using cosine distance
    type PgVectorRow = { section: string; content: string; source_path: string; distance: number };
    const results: PgVectorRow[] = await prisma.$queryRawUnsafe(
      `SELECT section, content, source_path, (embedding <=> $1::vector) as distance
       FROM "public"."AiDocChunk"
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vectorLiteral,
      limit,
    );

    // Convert cosine distance to a similarity score (0-10 scale)
    return results.map((r: PgVectorRow) => ({
      title: r.section,
      body: r.content,
      score: Math.max(0, (1 - r.distance) * 10), // cosine similarity * 10
    }));
  } catch (error) {
    console.warn("Semantic search unavailable, falling back to keyword-only:", error);
    return [];
  }
}

async function keywordSearch(
  query: string,
  limit = 6,
): Promise<RetrievalChunk[]> {
  const chunks = await getChunks();
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const qExpanded = expandQueryTokens(qTokens);
  const normalizedQuery = tokenize(query, true).join(" ");

  const hasClientIntent = qExpanded.has("cliente") || qExpanded.has("cuenta");
  const hasGuardiaIntent = qExpanded.has("guardia");
  const hasRondaIntent = qExpanded.has("ronda") || qExpanded.has("checkpoint") || qExpanded.has("qr");
  const hasRendicionIntent =
    qExpanded.has("rendicion") || qExpanded.has("aprobacion") || qExpanded.has("finanza");

  const scored = chunks
    .map((chunk) => {
      let overlap = 0;
      for (const token of qExpanded) {
        if (chunk.tokenSet.has(token)) overlap += 1;
      }

      const source = chunk.source.toLowerCase();
      const titleTokens = tokenize(chunk.title);
      const titleBoost = qTokens.some((t) => titleTokens.includes(t)) ? 3 : 0;
      const queryPhraseBoost = normalizedQuery && chunk.normalizedText.includes(normalizedQuery) ? 4 : 0;
      const faqBoost = source.includes("asistente_faq_uso_funcional") ? 3 : 0;

      let intentBoost = 0;
      if (hasClientIntent && (source.includes("crm") || chunk.tokenSet.has("crm"))) intentBoost += 2;
      if (hasGuardiaIntent && (source.includes("ops") || chunk.tokenSet.has("guardia"))) intentBoost += 2;
      if (hasRondaIntent && (chunk.tokenSet.has("ronda") || chunk.tokenSet.has("checkpoint"))) intentBoost += 2;
      if (hasRendicionIntent && (source.includes("finance") || source.includes("finanzas") || chunk.tokenSet.has("rendicion")))
        intentBoost += 2;

      const score = overlap * 2 + titleBoost + queryPhraseBoost + faqBoost + intentBoost;
      return { chunk, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      title: chunk.title,
      body: chunk.body,
      score,
    }));

  return scored;
}

export async function retrieveDocsContext(
  query: string,
  limit = 6,
): Promise<RetrievalChunk[]> {
  // Run keyword search and semantic search in parallel
  const [keywordResults, semanticResults] = await Promise.all([
    keywordSearch(query, limit),
    semanticSearch(query, limit),
  ]);

  // Merge results: combine by title+body key, take max score from each source
  const merged = new Map<string, RetrievalChunk>();

  for (const chunk of keywordResults) {
    const key = `${chunk.title}::${chunk.body.slice(0, 100)}`;
    const existing = merged.get(key);
    if (!existing || chunk.score > existing.score) {
      merged.set(key, chunk);
    }
  }

  for (const chunk of semanticResults) {
    const key = `${chunk.title}::${chunk.body.slice(0, 100)}`;
    const existing = merged.get(key);
    if (existing) {
      // Boost: if found by both methods, add semantic score
      existing.score = existing.score + chunk.score * 0.5;
    } else {
      merged.set(key, chunk);
    }
  }

  // Sort by score descending and take top limit
  return [...merged.values()]
    .filter((c) => c.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
