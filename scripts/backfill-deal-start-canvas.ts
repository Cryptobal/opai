/**
 * Backfill de la Ficha de Inicio (Canvas de Slack) en canales YA adjudicados.
 *
 * Los negocios ganados antes de que existiera el canvas (o con el flag
 * `startCanvasOnWon` apagado) no tienen Ficha de Inicio en su canal. Este script
 * la genera (crea o re-renderiza) invocando el núcleo reutilizable
 * `renderStartCanvasForDeal(..., { ignoreFlag: true })`, que opera aunque el flag
 * global del tenant esté OFF — SIN tocar la config del tenant.
 *
 * Uso:
 *   # Un deal específico:
 *   npx tsx scripts/backfill-deal-start-canvas.ts --tenant gard --deal <dealId>
 *   # Varios:
 *   npx tsx scripts/backfill-deal-start-canvas.ts --tenant gard --deal <id1> --deal <id2>
 *   # Todos los won con sala abierta del tenant:
 *   npx tsx scripts/backfill-deal-start-canvas.ts --tenant gard --all-won
 *   # Preview sin escribir en Slack:
 *   npx tsx scripts/backfill-deal-start-canvas.ts --tenant gard --all-won --dry-run
 *
 * Best-effort por deal: un fallo no aborta el resto. Toda query filtra por tenantId.
 */

import { prisma } from "../src/lib/prisma";
import { getOpenDealRoom } from "../src/lib/integrations/slack/deal-rooms/room";
import { getDealStartCanvasId } from "../src/lib/integrations/slack/deal-rooms/canvas-store";
import { loadStartCanvasData } from "../src/lib/integrations/slack/deal-rooms/start-canvas-data";
import { renderStartCanvasMarkdown } from "../src/lib/integrations/slack/deal-rooms/start-canvas-render";
import { renderStartCanvasForDeal } from "../src/lib/integrations/slack/deal-rooms/start-canvas";

async function resolveTenant(slugOverride?: string): Promise<{ id: string; name: string; slug: string }> {
  const slug = slugOverride ?? "gard";
  const bySlug = await prisma.tenant.findFirst({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (bySlug) return bySlug;
  throw new Error(`Tenant slug='${slug}' no encontrado.`);
}

/** Extrae todos los valores que siguen a cada aparición de `--deal`. */
function collectDealIds(argv: string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--deal" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      ids.push(argv[i + 1]);
    }
  }
  return ids;
}

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--") ? argv[idx + 1] : undefined;
}

async function main() {
  const argv = process.argv;
  const dryRun = argv.includes("--dry-run");
  const allWon = argv.includes("--all-won");
  const tenant = await resolveTenant(argValue(argv, "--tenant"));
  const explicitDealIds = collectDealIds(argv);

  console.log(`\n=== BACKFILL FICHA DE INICIO (canvas) ===`);
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Modo: ${dryRun ? "DRY-RUN (no escribe en Slack)" : "EJECUCIÓN"}\n`);

  // Selección de deals objetivo (siempre scoped por tenantId).
  let dealIds: string[] = [];
  if (explicitDealIds.length) {
    // Validar que pertenezcan al tenant.
    const found = await prisma.crmDeal.findMany({
      where: { tenantId: tenant.id, id: { in: explicitDealIds } },
      select: { id: true },
    });
    dealIds = found.map((d) => d.id);
    const missing = explicitDealIds.filter((id) => !dealIds.includes(id));
    if (missing.length) console.warn(`⚠ Ignorados (no son de este tenant): ${missing.join(", ")}`);
  } else if (allWon) {
    // CrmDealSlackRoom.dealId no es relación Prisma → dos queries: deals won +
    // salas abiertas cuyo dealId esté en ese set.
    const wonDeals = await prisma.crmDeal.findMany({
      where: { tenantId: tenant.id, status: "won" },
      select: { id: true },
    });
    const wonIds = new Set(wonDeals.map((d) => d.id));
    if (wonIds.size) {
      const rooms = await prisma.crmDealSlackRoom.findMany({
        where: { tenantId: tenant.id, status: "OPEN", dealId: { in: Array.from(wonIds) } },
        select: { dealId: true },
      });
      dealIds = Array.from(new Set(rooms.map((r) => r.dealId)));
    }
  } else {
    console.error("Nada que hacer: pasa --deal <id> (repetible) o --all-won.");
    return;
  }

  if (!dealIds.length) {
    console.log("No hay deals objetivo.");
    return;
  }
  console.log(`Deals objetivo: ${dealIds.length}\n`);

  const summary = { created: 0, rerendered: 0, noRoom: 0, errors: 0, previewed: 0 };

  for (const dealId of dealIds) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId: tenant.id },
      select: { title: true },
    });
    const label = `${deal?.title ?? "(sin título)"} [${dealId}]`;

    try {
      const room = await getOpenDealRoom(tenant.id, dealId);
      if (!room) {
        console.log(`— ${label}: SIN sala abierta → omitido`);
        summary.noRoom++;
        continue;
      }
      const existingCanvasId = await getDealStartCanvasId(tenant.id, dealId);

      if (dryRun) {
        const data = await loadStartCanvasData(tenant.id, dealId);
        const previewLines = data ? renderStartCanvasMarkdown(data).split("\n").slice(0, 15) : ["(sin datos de canvas)"];
        console.log(`▸ ${label}`);
        console.log(`    canal: #${room.slackChannelName} (${room.slackChannelId})`);
        console.log(`    canvas actual: ${existingCanvasId ? existingCanvasId : "NINGUNO (se crearía)"}`);
        console.log(`    preview (15 líneas):`);
        for (const l of previewLines) console.log(`      | ${l}`);
        console.log("");
        summary.previewed++;
        continue;
      }

      const res = await renderStartCanvasForDeal(tenant.id, dealId, { ignoreFlag: true });
      if (!res) {
        console.log(`✗ ${label}: falló (ver log arriba)`);
        summary.errors++;
        continue;
      }
      console.log(`✓ ${label}: ${res.action === "created" ? "CREADO" : "re-renderizado"} (canvas ${res.canvasId})`);
      if (res.action === "created") summary.created++;
      else summary.rerendered++;
    } catch (e) {
      console.error(`✗ ${label}: error`, e instanceof Error ? e.message : e);
      summary.errors++;
    }
  }

  console.log(`\n=== RESUMEN ===`);
  if (dryRun) {
    console.log(`Previsualizados: ${summary.previewed} · sin sala: ${summary.noRoom}`);
  } else {
    console.log(`Creados: ${summary.created} · re-renderizados: ${summary.rerendered} · sin sala: ${summary.noRoom} · errores: ${summary.errors}`);
  }
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
