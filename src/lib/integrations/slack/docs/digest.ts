/**
 * Digest diario de vencimientos de documentos en Slack (Fase 18).
 *
 * UN mensaje agrupado por tenant: "📋 N documentos requieren atención:
 * X vencidos · Y vencen esta semana · Z este mes", con secciones por
 * instalación (operacionales) y por guardia (personales), top 10 líneas
 * + "…y N más", y botón que abre la bandeja (/opai documentos).
 * Idempotente por (tenant, día) vía dedupe del outbox.
 */

import { getUnifiedType } from "@/lib/notifications/catalog";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getWorkspaceForTenant } from "../workspace";
import { enqueueOutboxRow, trySendOutboxRow } from "../outbox";
import { resolveChannel } from "../dispatch";
import {
  digestHeadline,
  type DigestEntry,
  type ExpiryDigestSummary,
} from "@/lib/documents/expiry-digest";

const MAX_LINES = 10;

function entryLine(e: DigestEntry, site: string): string {
  const badges = [
    e.enTramite ? " · ⏳ en trámite" : "",
    e.criticoLegal ? " · ⚖️ crítico" : "",
  ].join("");
  return `• <${site}${e.link}|${e.label}> — ${e.contextLabel} · ${e.dueText}${badges}`;
}

export function buildDocsDigestBlocks(summary: ExpiryDigestSummary): {
  text: string;
  blocks: unknown[];
} {
  const site = getCanonicalSiteUrl();
  const headline = digestHeadline(summary);
  const text = `📋 ${summary.total} documento(s) requieren atención: ${headline}`;

  // Top 10 líneas por severidad, separadas en operacionales (por instalación)
  // y personales (por guardia).
  const all = [...summary.vencidos, ...summary.estaSemana, ...summary.esteMes];
  const top = all.slice(0, MAX_LINES);
  const rest = all.length - top.length;
  const operacionales = top.filter((e) => e.kind === "operacional");
  const guardias = top.filter((e) => e.kind === "guardia");

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "📋 Vencimientos de documentos", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${summary.total} documento(s) requieren atención:* ${headline}` } },
  ];
  if (operacionales.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Por instalación*\n${operacionales.map((e) => entryLine(e, site)).join("\n")}`,
      },
    });
  }
  if (guardias.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Por guardia*\n${guardias.map((e) => entryLine(e, site)).join("\n")}`,
      },
    });
  }
  const notes: string[] = [];
  if (rest > 0) notes.push(`…y ${rest} más en la bandeja`);
  if (summary.overflowCards > 0) {
    notes.push(`${summary.overflowCards} tarjeta(s) individuales se plegaron aquí por el tope diario`);
  }
  if (notes.length) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notes.join(" · ") }] });
  }
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "📂 Abrir bandeja", emoji: true },
        action_id: "docstray_open",
        value: "open",
      },
    ],
  });
  return { text, blocks };
}

/** Postea el digest al canal ruteado para `docs_expiry_digest`. Idempotente por día. */
export async function postDocsDigestToSlack(
  tenantId: string,
  summary: ExpiryDigestSummary,
  dayKey: string
): Promise<boolean> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return false;
  const typeDef = getUnifiedType("docs_expiry_digest");
  if (!typeDef) return false;
  const channelId = await resolveChannel(tenantId, typeDef, ws.defaultChannelId);
  if (!channelId) return false;

  const { text, blocks } = buildDocsDigestBlocks(summary);
  const id = await enqueueOutboxRow({
    tenantId,
    workspaceId: ws.id,
    channelId,
    text,
    blocks,
    dedupeKey: `docs-expiry-digest|${tenantId}|${dayKey}`,
  });
  if (!id) return false; // ya enviado hoy
  await trySendOutboxRow(ws.botToken, id, channelId, text, blocks);
  return true;
}
