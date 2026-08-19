/**
 * Migra plantillas de contrato cliente con personería de LA EMPRESA hardcodeada
 * (fecha/notaría como "_____") al formato con tokens empresa.fechaEscrituraPublica
 * y empresa.nombreNotaria.
 *
 * Uso:
 *   npx tsx scripts/migrate-contrato-personeria-tokens.ts
 *   npx tsx scripts/migrate-contrato-personeria-tokens.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");

function getNodeText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; attrs?: { tokenKey?: string }; content?: unknown[] };
  if (n.type === "text" && n.text != null) return String(n.text);
  if (n.type === "contractToken" && n.attrs?.tokenKey) return String(n.attrs.tokenKey);
  if (Array.isArray(n.content)) return n.content.map(getNodeText).join("");
  return "";
}

function token(tokenKey: string) {
  return { type: "contractToken", attrs: { tokenKey, label: tokenKey } };
}

function text(content: string) {
  return { type: "text", text: content };
}

function buildEmpresaPersoneriaParagraph() {
  return {
    type: "paragraph",
    content: [
      text("La personería de don "),
      token("empresa.repLegalNombre"),
      text(" para representar a "),
      token("empresa.razonSocial"),
      text(", consta en escritura pública de fecha "),
      token("empresa.fechaEscrituraPublica"),
      text(", otorgada ante el Notario Público de Santiago, don "),
      token("empresa.nombreNotaria"),
      text("."),
    ],
  };
}

function needsPersoneriaFix(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string };
  if (n.type !== "paragraph") return false;
  const full = getNodeText(node).toLowerCase();
  const isEmpresaClause =
    full.includes("la personería de don") &&
    full.includes("empresa.replegalnombre") &&
    full.includes("empresa.razonsocial");
  const hasHardcodedBlanks = full.includes("fecha _____") || full.includes("don _____");
  const alreadyHasTokens = full.includes("empresa.fechaescriturapublica");
  return isEmpresaClause && hasHardcodedBlanks && !alreadyHasTokens;
}

function fixContent(content: unknown): { content: unknown; changed: boolean } {
  if (!content || typeof content !== "object") return { content, changed: false };
  const doc = content as { type?: string; content?: unknown[] };
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return { content, changed: false };

  let changed = false;
  const newContent = doc.content.map((node) => {
    if (needsPersoneriaFix(node)) {
      changed = true;
      return buildEmpresaPersoneriaParagraph();
    }
    return node;
  });

  return {
    content: changed ? { ...doc, content: newContent } : content,
    changed,
  };
}

async function main() {
  const prisma = new PrismaClient();

  const templates = await prisma.docTemplate.findMany({
    where: {
      module: "crm",
      category: "contrato_cliente",
      isActive: true,
    },
    select: { id: true, name: true, tenantId: true, content: true, tokensUsed: true },
  });

  let updated = 0;
  for (const template of templates) {
    const { content, changed } = fixContent(template.content);
    if (!changed) continue;

    updated++;
    console.log(`→ ${template.name} (${template.id})`);

    if (DRY_RUN) continue;

    const tokensUsed = [
      ...new Set([
        ...((template.tokensUsed as string[]) || []),
        "empresa.fechaEscrituraPublica",
        "empresa.nombreNotaria",
      ]),
    ];

    await prisma.docTemplate.update({
      where: { id: template.id },
      data: { content: content as object, tokensUsed },
    });
  }

  console.log(
    DRY_RUN
      ? `\nDry run: ${updated} plantilla(s) requerirían actualización.`
      : `\n✅ ${updated} plantilla(s) actualizada(s).`
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
