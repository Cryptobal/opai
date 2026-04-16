/**
 * Elimina el link "Ver propuesta enviada" de las 3 plantillas de seguimiento
 * del tenant. Ya no hace falta porque el nuevo layout branded tiene un CTA
 * botón explícito al final.
 *
 * Regla: se elimina cualquier paragraph cuyo contenido sea SOLO un link con
 * texto que contenga "ver propuesta" (case-insensitive). Si el paragraph tiene
 * más texto, se deja intacto.
 *
 * Uso:
 *   DRY_RUN=1 TENANT_SLUG=gard npx ts-node -r tsconfig-paths/register \
 *     --compiler-options '{"module":"CommonJS"}' \
 *     scripts/clean-followup-templates.ts
 *
 *   (sin DRY_RUN escribe los cambios)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TNode {
  type?: string;
  content?: TNode[];
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, unknown>;
}

function paragraphHasProposalLink(node: TNode): boolean {
  if (node.type !== "paragraph") return false;
  const children = node.content ?? [];
  if (children.length === 0) return false;

  let hasLink = false;
  let allTextIsLinkLike = true;
  let sawProposalText = false;

  for (const child of children) {
    if (child.type !== "text") {
      // Permitimos nodos "hardBreak" u otros sin texto — pero si hay tokens
      // u otros tipos con contenido real, no lo consideramos "solo link".
      continue;
    }
    const marks = child.marks ?? [];
    const isLinkMark = marks.some((m) => m.type === "link");
    if (isLinkMark) {
      hasLink = true;
      const txt = (child.text ?? "").toLowerCase();
      if (txt.includes("ver propuesta") || txt.includes("propuesta enviada")) {
        sawProposalText = true;
      }
    } else {
      // Texto sin link — si no es trivial (emoji/espacio), cancelamos.
      const trimmed = (child.text ?? "").trim();
      if (trimmed.length > 0) allTextIsLinkLike = false;
    }
  }

  return hasLink && sawProposalText && allTextIsLinkLike;
}

function cleanDoc(doc: TNode): { next: TNode; removed: number } {
  let removed = 0;
  const walk = (node: TNode): TNode => {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node.content)) {
      const filtered: TNode[] = [];
      let prevWasEmptyPara = false;
      for (const child of node.content) {
        if (paragraphHasProposalLink(child)) {
          removed++;
          continue; // skip this paragraph entirely
        }
        // Colapsar paragraphs vacíos consecutivos (el que quedó huérfano
        // tras remover el link no debería duplicar el espacio vertical).
        const isEmptyPara =
          child.type === "paragraph" &&
          (!child.content || child.content.length === 0);
        if (isEmptyPara && prevWasEmptyPara) {
          removed++;
          continue;
        }
        filtered.push(walk(child));
        prevWasEmptyPara = isEmptyPara;
      }
      return { ...node, content: filtered };
    }
    return node;
  };
  return { next: walk(doc), removed };
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const tenantSlug = process.env.TENANT_SLUG?.trim() || "gard";

  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug, active: true } });
  if (!tenant) {
    console.error(`❌ Tenant "${tenantSlug}" no encontrado`);
    process.exit(1);
  }

  const cfg = await prisma.crmFollowUpConfig.findUnique({ where: { tenantId: tenant.id } });
  if (!cfg) {
    console.error(`❌ No hay crmFollowUpConfig para ${tenantSlug}`);
    process.exit(1);
  }

  const targets = [
    { seq: 1, id: cfg.firstEmailTemplateId },
    { seq: 2, id: cfg.secondEmailTemplateId },
    { seq: 3, id: cfg.thirdEmailTemplateId },
  ];

  console.log(dryRun ? "🔎 Modo DRY RUN" : "✏️  Modo escritura");
  console.log(`🏢 Tenant: ${tenant.name} (${tenantSlug})`);

  for (const { seq, id } of targets) {
    if (!id) {
      console.log(`\n⚠️  Seq ${seq}: sin template configurado, se omite`);
      continue;
    }
    const template = await prisma.docTemplate.findUnique({ where: { id } });
    if (!template) {
      console.log(`\n⚠️  Seq ${seq}: template ${id} no existe`);
      continue;
    }
    const doc = template.content as unknown as TNode;
    const { next, removed } = cleanDoc(doc);
    console.log(`\n→ Seq ${seq}: ${template.name} — paragraphs eliminados: ${removed}`);
    if (removed === 0) continue;
    if (dryRun) continue;
    await prisma.docTemplate.update({
      where: { id },
      data: { content: next as unknown as object },
    });
    console.log(`   ✓ Actualizado`);
  }

  console.log(dryRun ? "\nℹ️  DRY RUN: ningún cambio fue escrito." : "\n🎉 Listo.");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
