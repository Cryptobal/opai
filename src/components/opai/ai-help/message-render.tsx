"use client";

import { Fragment, type ReactElement } from "react";
import {
  BarChart3,
  Calendar,
  Link2,
  Sparkles,
  Users,
} from "lucide-react";
import type { SuggestionIcon } from "@/lib/ai/help-chat-visual-types";

export function SuggestionIconEl({ icon }: { icon?: SuggestionIcon }) {
  switch (icon) {
    case "users":
      return <Users className="h-3.5 w-3.5" />;
    case "calendar":
      return <Calendar className="h-3.5 w-3.5" />;
    case "sparkles":
      return <Sparkles className="h-3.5 w-3.5" />;
    case "link":
      return <Link2 className="h-3.5 w-3.5" />;
    case "chart":
    default:
      return <BarChart3 className="h-3.5 w-3.5" />;
  }
}

function renderBoldText(text: string, keyPrefix: string) {
  const nodes: Array<ReactElement | string> = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`${keyPrefix}-b-${match.index}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : text;
}

/**
 * Same-origin → path interno navegable; otro origen / esquema inválido → externo.
 * No acepta javascript:/data:; parseo fallido se trata como externo.
 */
export function resolveNavigationTarget(
  url: string,
): { kind: "internal"; path: string } | { kind: "external"; url: string } {
  const trimmed = url.trim();
  if (!trimmed || /^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) {
    return { kind: "external", url: trimmed };
  }
  try {
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      return { kind: "internal", path: trimmed };
    }
    const absolute = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "https://opai.local");
    if (typeof window !== "undefined" && absolute.origin === window.location.origin) {
      return {
        kind: "internal",
        path: `${absolute.pathname}${absolute.search}${absolute.hash}`,
      };
    }
    return { kind: "external", url: absolute.href };
  } catch {
    return { kind: "external", url: trimmed };
  }
}

function linkifyLine(
  line: string,
  onInternalNavigate?: (path: string) => void,
) {
  const parts: Array<ReactElement | string> = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(line);

  while (match) {
    if (match.index > lastIndex) {
      const textPart = line.slice(lastIndex, match.index);
      const rendered = renderBoldText(textPart, `pre-${match.index}`);
      if (Array.isArray(rendered)) parts.push(...rendered);
      else parts.push(rendered);
    }

    const label = match[1];
    const markdownHref = match[2];
    const rawHref = match[3];
    const href = markdownHref ?? rawHref;
    const text = label ?? href.replace(/^https?:\/\//, "");

    if (href) {
      const target = resolveNavigationTarget(href);
      if (target.kind === "internal" && onInternalNavigate) {
        parts.push(
          <a
            key={`${match.index}-${href}`}
            href={target.path}
            onClick={(e) => {
              e.preventDefault();
              onInternalNavigate(target.path);
            }}
            className="underline underline-offset-2 text-status-info-fg hover:brightness-110"
          >
            {text}
          </a>,
        );
      } else {
        parts.push(
          <a
            key={`${match.index}-${href}`}
            href={target.kind === "external" ? target.url : href}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 text-status-info-fg hover:brightness-110"
          >
            {text}
          </a>,
        );
      }
    }

    lastIndex = regex.lastIndex;
    match = regex.exec(line);
  }

  if (lastIndex < line.length) {
    const textPart = line.slice(lastIndex);
    const rendered = renderBoldText(textPart, `post-${lastIndex}`);
    if (Array.isArray(rendered)) parts.push(...rendered);
    else parts.push(rendered);
  }

  return parts.length > 0 ? parts : line;
}

/**
 * Strip out visual block syntax (`:::cards ... :::`, `:::chart ... :::`, etc.)
 * from streaming text so the user doesn't see raw JSON while the model writes
 * the block. Removes both completed blocks AND the trailing partial block
 * (anything after an unmatched `:::xxx`). The server re-sends a clean text in
 * the final `done` event so the rendered bubble will look right when streaming
 * finishes.
 */
function stripVisualBlocks(content: string): string {
  const VISUAL_TYPES = "(chart|kpi|cards|table|suggestions)";
  // Remove fully closed blocks
  let out = content.replace(
    new RegExp(`:::${VISUAL_TYPES}\\s*\\n[\\s\\S]*?\\n:::`, "gi"),
    "",
  );
  // Remove trailing unclosed block (still streaming)
  out = out.replace(new RegExp(`:::${VISUAL_TYPES}[\\s\\S]*$`, "i"), "");
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function renderMessageContent(
  content: string,
  onInternalNavigate?: (path: string) => void,
) {
  const cleaned = stripVisualBlocks(content);
  const lines = cleaned.split("\n");
  return lines.map((line, idx) => (
    <Fragment key={`${idx}-${line.slice(0, 12)}`}>
      {linkifyLine(line, onInternalNavigate)}
      {idx < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

const TOOL_LABELS: Record<string, string> = {
  search_accounts: "Buscando clientes...",
  search_deals: "Buscando deals...",
  search_installations: "Buscando instalaciones...",
  search_quotes: "Buscando cotizaciones...",
  search_guardias: "Buscando guardias...",
  get_entity_documents: "Buscando documentos...",
  read_document: "Leyendo documento...",
  get_uf_utm: "Consultando UF/UTM...",
  get_guardias_metrics: "Calculando métricas...",
  get_pending_rendiciones: "Buscando rendiciones...",
  get_daily_attendance: "Consultando asistencia...",
  get_supervision_visits: "Consultando supervisión...",
  get_rondas_status: "Consultando rondas...",
  get_tickets_summary: "Consultando tickets...",
  get_finance_summary: "Consultando finanzas...",
  get_account_detail: "Leyendo ficha del cliente...",
  list_account_documents: "Listando documentos del cliente...",
  get_guardia_detail: "Leyendo ficha del guardia...",
  list_guardia_documents: "Listando documentos del guardia...",
  get_panic_alerts: "Revisando alertas de pánico...",
  get_daily_absences: "Revisando ausencias...",
  get_extra_shifts: "Revisando turnos extra...",
  get_deal_pipeline: "Cargando pipeline...",
  get_user_context: "Cargando contexto del usuario...",
  get_tenant_summary: "Cargando resumen del tenant...",
  get_quote_detail: "Leyendo cotización CPQ...",
  clone_quote: "Clonando cotización...",
  update_quote_margin: "Actualizando margen CPQ...",
  update_quote_status: "Actualizando estado CPQ...",
  add_quote_position: "Agregando puesto a cotización...",
  preview_update_quote_position: "Previsualizando cambio de puesto...",
  update_quote_position: "Guardando cambio de puesto...",
  preview_remove_quote_position: "Previsualizando borrado de puesto...",
  remove_quote_position: "Eliminando puesto de cotización...",
  get_quote_proposal: "Generando vista propuesta técnica...",
  manage_quote_includes: "Editando bullets Incluye...",
  preview_send_quote_proposal: "Previsualizando envío al cliente...",
  send_quote_proposal: "Enviando propuesta por portal/correo...",
  get_email_thread: "Leyendo el correo...",
  summarize_email_thread: "Resumiendo el hilo...",
  read_email_attachments: "Analizando adjuntos del correo...",
  create_lead_from_email: "Extrayendo lead del correo...",
  create_crm_from_email: "Estructurando CRM y cobertura del correo...",
  search_emails_semantic: "Buscando en tus correos...",
};

export function friendlyToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? "Consultando datos...";
}
