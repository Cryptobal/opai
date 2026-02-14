/**
 * CLI script to index documentation into the AiDocChunk table with embeddings.
 *
 * Usage:
 *   npx tsx scripts/index-ai-docs.ts
 *
 * Environment variables required:
 *   DATABASE_URL  — PostgreSQL connection string (Neon)
 *   OPENAI_API_KEY — OpenAI API key for embeddings
 *
 * This script:
 * 1. Reads all .md files from /docs directory
 * 2. Chunks them by headers (H1-H3) with max ~2000 chars
 * 3. Generates embeddings using text-embedding-3-small (1536 dimensions)
 * 4. Upserts into AiDocChunk table by content_hash (idempotent)
 * 5. Removes stale chunks whose content_hash no longer exists
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient();
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 20; // embeddings per API call
const MAX_CHUNK_CHARS = 2400;

/* ── Chunking ── */

type RawChunk = {
  sourcePath: string;
  section: string;
  content: string;
  contentHash: string;
};

function chunkMarkdown(content: string, fileLabel: string): RawChunk[] {
  const lines = content.split("\n");
  const chunks: RawChunk[] = [];
  let currentSection = fileLabel;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (!body) return;
    const text = body.slice(0, MAX_CHUNK_CHARS);
    const hash = crypto.createHash("sha256").update(`${fileLabel}::${currentSection}::${text}`).digest("hex");
    chunks.push({
      sourcePath: fileLabel,
      section: currentSection,
      content: text,
      contentHash: hash,
    });
    buffer = [];
  };

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      currentSection = line.replace(/^#{1,3}\s+/, "").trim() || fileLabel;
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
    if (entry.name.startsWith(".") || entry.name === "_deprecated") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

/* ── Embeddings ── */

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openaiClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

/* ── Main ── */

async function main() {
  console.log("🔍 Scanning /docs for markdown files...");
  const docsDir = path.join(process.cwd(), "docs");
  const files = await listMarkdownFiles(docsDir);
  console.log(`   Found ${files.length} files`);

  // Generate all chunks
  const allChunks: RawChunk[] = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const fileLabel = path.relative(docsDir, file).replace(/\\/g, "/");
    allChunks.push(...chunkMarkdown(raw, fileLabel));
  }
  console.log(`   Generated ${allChunks.length} chunks`);

  // Check which chunks already exist (by hash) — raw SQL because Prisma doesn't support vector type
  const existingHashes = new Set<string>();
  const existing = await prisma.$queryRaw<Array<{ content_hash: string }>>`
    SELECT content_hash FROM "public"."AiDocChunk"
  `;
  for (const row of existing) {
    existingHashes.add(row.content_hash);
  }

  const newChunks = allChunks.filter((c) => !existingHashes.has(c.contentHash));
  console.log(`   ${newChunks.length} new/changed chunks to index`);
  console.log(`   ${existingHashes.size - (allChunks.length - newChunks.length)} stale chunks to remove`);

  // Generate embeddings in batches
  if (newChunks.length > 0) {
    console.log("🧠 Generating embeddings...");
    for (let i = 0; i < newChunks.length; i += BATCH_SIZE) {
      const batch = newChunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => `${c.section}\n${c.content}`);
      const embeddings = await generateEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embedding = embeddings[j];
        const vectorLiteral = `[${embedding.join(",")}]`;

        // Upsert using raw SQL because Prisma doesn't support vector type natively
        await prisma.$executeRawUnsafe(
          `INSERT INTO "public"."AiDocChunk" (id, source_path, section, content, content_hash, embedding, token_count, created_at, updated_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, $6, now(), now())
           ON CONFLICT (content_hash) DO UPDATE SET
             source_path = EXCLUDED.source_path,
             section = EXCLUDED.section,
             content = EXCLUDED.content,
             embedding = EXCLUDED.embedding,
             token_count = EXCLUDED.token_count,
             updated_at = now()`,
          chunk.sourcePath,
          chunk.section,
          chunk.content,
          chunk.contentHash,
          vectorLiteral,
          Math.ceil(chunk.content.length / 4), // rough token estimate
        );
      }

      console.log(`   Indexed ${Math.min(i + BATCH_SIZE, newChunks.length)}/${newChunks.length}`);
    }
  }

  // Remove stale chunks
  const currentHashes = new Set(allChunks.map((c) => c.contentHash));
  const staleHashes = [...existingHashes].filter((h) => !currentHashes.has(h));
  if (staleHashes.length > 0) {
    console.log(`🗑️  Removing ${staleHashes.length} stale chunks...`);
    // Use raw SQL because Prisma doesn't support the vector column type
    for (const hash of staleHashes) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "public"."AiDocChunk" WHERE content_hash = $1`,
        hash,
      );
    }
  }

  console.log("✅ Indexation complete!");
  console.log(`   Total chunks in DB: ${allChunks.length}`);
}

main()
  .catch((err) => {
    console.error("❌ Indexation failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
