/**
 * Backfill OPT-IN de embeddings de correo (A07, Prompt D).
 *
 * Reporta el COSTO ESTIMADO antes de embeber y no corre nada sin --yes.
 * Prioriza los correos más recientes (--days, default 90) y respeta un
 * presupuesto de mensajes por corrida (--limit, default 2000): correrlo
 * varias veces avanza incrementalmente (idempotente por contentHash y
 * flag chunks_indexed).
 *
 * Uso (requiere DATABASE_URL y OPENAI_API_KEY en el entorno):
 *   npx tsx scripts/backfill-email-embeddings.ts --days 90            # solo estima
 *   npx tsx scripts/backfill-email-embeddings.ts --days 90 --yes      # ejecuta
 *   npx tsx scripts/backfill-email-embeddings.ts --tenant <id> --limit 500 --yes
 */
import { prisma } from "../src/lib/prisma";
import {
  EMBEDDING_USD_PER_MTOKEN,
  indexEmailMessages,
  messagePlainText,
} from "../src/modules/crm/email/email-embeddings";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const days = Number(argValue("days") ?? 90);
  const limit = Number(argValue("limit") ?? 2000);
  const tenantFilter = argValue("tenant");
  const confirmed = process.argv.includes("--yes");
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const messages = await prisma.crmEmailMessage.findMany({
    where: {
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
      isDraft: false,
      chunksIndexed: false,
      emailAccountId: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      tenantId: true,
      threadId: true,
      emailAccountId: true,
      textBody: true,
      htmlBody: true,
      subject: true,
    },
  });

  const totalChars = messages.reduce(
    (sum, m) => sum + messagePlainText(m).length + m.subject.length,
    0,
  );
  const estimatedTokens = Math.ceil(totalChars / 4);
  const estimatedUsd = (estimatedTokens / 1_000_000) * EMBEDDING_USD_PER_MTOKEN;

  console.log(`[backfill-embeddings] Candidatos: ${messages.length} mensajes (últimos ${days} días${tenantFilter ? `, tenant ${tenantFilter}` : ""}).`);
  console.log(`[backfill-embeddings] Tokens estimados: ~${estimatedTokens.toLocaleString()} → costo estimado ~USD ${estimatedUsd.toFixed(4)} (text-embedding-3-small).`);

  if (!confirmed) {
    console.log("[backfill-embeddings] DRY-RUN: agregá --yes para ejecutar.");
    return;
  }

  // Agrupar por tenant: tenant_id obligatorio en toda fila y todo log de uso.
  const byTenant = new Map<string, typeof messages>();
  for (const message of messages) {
    const group = byTenant.get(message.tenantId) ?? [];
    group.push(message);
    byTenant.set(message.tenantId, group);
  }

  let chunks = 0;
  let tokens = 0;
  for (const [tenantId, group] of byTenant) {
    const result = await indexEmailMessages({ tenantId, messages: group });
    chunks += result.chunks;
    tokens += result.tokens;
    await prisma.crmEmailMessage.updateMany({
      where: { id: { in: group.map((m) => m.id) } },
      data: { chunksIndexed: true },
    });
    console.log(`[backfill-embeddings] tenant ${tenantId}: ${result.chunks} chunks, ${result.tokens} tokens.`);
  }
  const realUsd = (tokens / 1_000_000) * EMBEDDING_USD_PER_MTOKEN;
  console.log(`[backfill-embeddings] LISTO: ${chunks} chunks, ${tokens.toLocaleString()} tokens reales (~USD ${realUsd.toFixed(4)}). Re-ejecutá para seguir avanzando si quedaron candidatos.`);
}

main()
  .catch((err) => {
    console.error("[backfill-embeddings] falló:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
