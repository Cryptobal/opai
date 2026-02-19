/**
 * Script para actualizar el template de contrato con la sección previsional corregida.
 * Uso: npx tsx scripts/update-contrato-template.ts 6fe33121-cb21-4b44-93c9-daa2af8c9bc4
 */

import { PrismaClient } from "@prisma/client";

const TEMPLATE_ID = process.argv[2] || "6fe33121-cb21-4b44-93c9-daa2af8c9bc4";

function getNodeText(node: any): string {
  if (!node) return "";
  if (node.type === "text" && node.text != null) return String(node.text);
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(getNodeText).join("");
  }
  return "";
}

function paragraph(children: any[]): any {
  return { type: "paragraph", content: children };
}

function text(content: string): any {
  return { type: "text", text: content };
}

function token(tokenKey: string): any {
  return { type: "contractToken", attrs: { tokenKey, label: tokenKey } };
}

function heading(level: number, children: any[]): any {
  return { type: "heading", attrs: { level }, content: children };
}

const SEXTO_SECTION = [
  heading(2, [text("SEXTO: Estado previsional y cotizaciones")]),
  paragraph([
    text('Estado de Jubilación: El trabajador declara que {{#if guardia.isJubilado=="SI"}}SÍ{{else}}NO{{/if}} se encuentra jubilado al momento de la celebración de este contrato. {{#if guardia.isJubilado=="SI"}}En caso de estar jubilado, el trabajador {{guardia.cotizaAFPTexto}} en AFP, conforme a lo dispuesto en el artículo 17 del Decreto Ley N° 3.500, que regula el Sistema de Pensiones en Chile.{{/if}}'),
  ]),
  paragraph([
    text("Afiliación a AFP: En cumplimiento de la normativa vigente, el trabajador está afiliado a la Administradora de Fondos de Pensiones (AFP) "),
    token("guardia.afp"),
    text(". En caso de estar jubilado y optar por no cotizar, dicha decisión queda establecida en este contrato."),
  ]),
  paragraph([
    text('Seguro de Cesantía (AFC): El trabajador se encuentra afiliado al Seguro de Cesantía a través de la Administradora de Fondos de Cesantía (AFC), según lo establece la Ley N° 19.728. {{#if guardia.isJubilado=="SI"}}En caso de estar jubilado, el trabajador {{guardia.cotizaAFCTexto}} en AFC, conforme a lo dispuesto en el artículo 17 del Decreto Ley N° 3.500, que regula el Sistema de Pensiones en Chile.{{/if}}'),
  ]),
  paragraph([
    text('Afiliación a Sistema de Salud (Fonasa o Isapre): El trabajador está afiliado a {{#if guardia.healthSystem=="isapre"}}Isapre {{guardia.isapreName}}{{else}}Fonasa{{/if}} para efectos de la cotización en el sistema de salud, según lo dispuesto en el Decreto Ley N° 3.500. El trabajador declara su afiliación actual y acepta las condiciones de cotización correspondientes.'),
  ]),
  paragraph([
    text('{{#if guardia.isJubilado=="SI"}}Exclusión de Cotizaciones (si aplica): En caso de no corresponder afiliación o cotización en alguno de los sistemas mencionados debido a su condición de jubilado, dicha situación queda registrada en este contrato.{{/if}}'),
  ]),
];

async function main() {
  const prisma = new PrismaClient();

  const template = await prisma.docTemplate.findUnique({
    where: { id: TEMPLATE_ID },
  });

  if (!template) {
    console.error(`Template ${TEMPLATE_ID} no encontrado.`);
    process.exit(1);
  }

  const content = template.content as { type: string; content?: any[] };
  if (!content?.content || !Array.isArray(content.content)) {
    console.error("Contenido del template inválido.");
    process.exit(1);
  }

  const nodes = content.content;
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < nodes.length; i++) {
    const t = getNodeText(nodes[i]).toLowerCase();
    const isPrevisional =
      t.includes("estado previsional") ||
      t.includes("cotizaciones previsionales") ||
      t.includes("estado de jubilación") ||
      (nodes[i].type === "heading" && (t.includes("sexto") || (t.includes("cuarto") && t.includes("previsional"))));

    if (isPrevisional && startIdx < 0) {
      startIdx = nodes[i].type === "heading" ? i : Math.max(0, i - 1);
    }

    if (startIdx >= 0 && endIdx < 0 && i > startIdx && nodes[i].type === "heading") {
      const nextSection = t.includes("séptimo") || t.includes("ejemplares") || t.includes("quinto") || t.includes("quinto:");
      if (nextSection) {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx < 0) {
    startIdx = nodes.findIndex(
      (n) => n.type === "heading" && getNodeText(n).toLowerCase().includes("sexto")
    );
    if (startIdx < 0) {
      startIdx = nodes.findIndex(
        (n) => n.type === "heading" && getNodeText(n).toLowerCase().includes("cuarto") && getNodeText(n).toLowerCase().includes("previsional")
      );
    }
    if (startIdx < 0) {
      console.error("No se encontró la sección previsional. Verifica la estructura del template.");
      process.exit(1);
    }
  }

  if (endIdx < 0) {
    endIdx = nodes.findIndex(
      (n, i) => i > startIdx && n.type === "heading" && (getNodeText(n).toLowerCase().includes("séptimo") || getNodeText(n).toLowerCase().includes("ejemplares"))
    );
    if (endIdx < 0) endIdx = nodes.length;
  }

  const before = nodes.slice(0, startIdx);
  const after = nodes.slice(endIdx);
  const newContent = { ...content, content: [...before, ...SEXTO_SECTION, ...after] };

  await prisma.docTemplate.update({
    where: { id: TEMPLATE_ID },
    data: {
      content: newContent,
      tokensUsed: [
        ...new Set([
          ...((template.tokensUsed as string[]) || []),
          "guardia.afp",
          "guardia.healthSystem",
          "guardia.isJubilado",
          "guardia.cotizaAFPTexto",
          "guardia.cotizaAFCTexto",
          "guardia.isapreName",
        ]),
      ],
    },
  });

  console.log(`✅ Template ${TEMPLATE_ID} actualizado correctamente.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
