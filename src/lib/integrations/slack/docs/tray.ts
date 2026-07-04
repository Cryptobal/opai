/**
 * Bandeja de documentos por vencer en Slack (Fase 18): `/opai documentos` y el
 * botón "📂 Abrir bandeja" del digest. Filtros: Vencidos · Esta semana ·
 * En trámite · Todos, más filtro por instalación. Lista paginada (10/página);
 * cada fila enlaza al documento en OPAI. El estado viaja en private_metadata.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { hasModuleAccess } from "@/lib/permissions";
import { todayUtc } from "@/lib/documents/expiry-engine";
import { listExpiryEntries, type DigestEntry } from "@/lib/documents/expiry-digest";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });

export const DOCS_TRAY_PAGE_SIZE = 10;

export type DocsTrayFilter = "vencidos" | "semana" | "tramite" | "todos";

const FILTER_LABELS: Record<DocsTrayFilter, string> = {
  vencidos: "Vencidos",
  semana: "Esta semana",
  tramite: "En trámite",
  todos: "Todos",
};

export function parseDocsFilter(raw: string | undefined): DocsTrayFilter {
  return raw && raw in FILTER_LABELS ? (raw as DocsTrayFilter) : "todos";
}

function applyFilter(
  entries: DigestEntry[],
  filter: DocsTrayFilter,
  installationId?: string
): DigestEntry[] {
  let out = entries;
  if (filter === "vencidos") out = out.filter((e) => e.daysRemaining < 0);
  else if (filter === "semana") out = out.filter((e) => e.daysRemaining >= 0 && e.daysRemaining <= 7);
  else if (filter === "tramite") out = out.filter((e) => e.enTramite);
  if (installationId) out = out.filter((e) => e.installationId === installationId);
  return out;
}

function filterChips(active: DocsTrayFilter): unknown {
  return {
    type: "actions",
    elements: (Object.keys(FILTER_LABELS) as DocsTrayFilter[]).map((f) => {
      const btn: Record<string, unknown> = {
        type: "button",
        text: pt(FILTER_LABELS[f]),
        action_id: `docstray_scope_${f}`,
        value: f,
      };
      if (f === active) btn.style = "primary";
      return btn;
    }),
  };
}

function installationSelect(entries: DigestEntry[], current?: string): unknown | null {
  const seen = new Map<string, string>();
  for (const e of entries) {
    if (e.installationId && !seen.has(e.installationId)) seen.set(e.installationId, e.contextLabel);
  }
  if (seen.size === 0) return null;
  const options = [
    { text: pt("Todas las instalaciones"), value: "__all" },
    ...[...seen.entries()].slice(0, 99).map(([id, name]) => ({ text: pt(name), value: id })),
  ];
  const init = options.find((o) => o.value === (current || "__all")) ?? options[0];
  return {
    type: "actions",
    elements: [
      { type: "static_select", action_id: "docstray_f_inst", initial_option: init, options },
    ],
  };
}

export function rowText(e: DigestEntry, site: string): string {
  const badges = [
    e.enTramite ? "  ·  ⏳ En trámite" : "",
    e.criticoLegal ? "  ·  ⚖️ crítico-legal" : "",
  ].join("");
  const kind = e.kind === "operacional" ? "🏢" : "👤";
  return `${kind} <${site}${e.link}|${e.label}> — ${e.contextLabel}\n${e.dueText}${badges}`;
}

/** Fila de la bandeja: texto con link + select de gestión (mismos modales que la tarjeta). */
function rowSection(e: DigestEntry, site: string): unknown {
  const ref = `${e.kind}:${e.id}`;
  return {
    type: "section",
    text: { type: "mrkdwn", text: rowText(e, site) },
    accessory: {
      type: "static_select",
      action_id: "docstray_row",
      placeholder: pt("Acción…"),
      options: [
        { text: pt("⏳ En trámite"), value: `track:${ref}` },
        { text: pt("🔕 Ya no aplica"), value: `dismiss:${ref}` },
      ],
    },
  };
}

export function buildDocsTrayView(
  data: { rows: DigestEntry[]; total: number; page: number; all: DigestEntry[] },
  filter: DocsTrayFilter,
  installationId?: string,
  notice?: string
): SlackView {
  const site = getCanonicalSiteUrl();
  const blocks: unknown[] = [];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });
  blocks.push(filterChips(filter));
  const instSelect = installationSelect(data.all, installationId);
  if (instSelect) blocks.push(instSelect);
  blocks.push({ type: "divider" });

  if (data.rows.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "No hay documentos con estos filtros. 🎉" },
    });
  } else {
    for (const e of data.rows) blocks.push(rowSection(e, site));
  }

  const totalPages = Math.max(1, Math.ceil(data.total / DOCS_TRAY_PAGE_SIZE));
  const pager: unknown[] = [];
  if (data.page > 1) pager.push({ type: "button", text: pt("‹ Anterior"), value: "prev", action_id: "docstray_page" });
  if (data.page < totalPages) pager.push({ type: "button", text: pt("Siguiente ›"), value: "next", action_id: "docstray_page" });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `Página ${data.page}/${totalPages} · ${data.total} documento(s)` }],
  });
  if (pager.length) blocks.push({ type: "actions", elements: pager });

  return {
    type: "modal",
    callback_id: "opai_documentos",
    private_metadata: packMetadata({
      kind: "docs_tray",
      docfilter: filter,
      docInstallationId: installationId,
      page: String(data.page),
    }),
    title: modalTitle("Documentos por vencer"),
    close: pt("Cerrar"),
    blocks,
  };
}

export async function loadDocsTray(
  tenantId: string,
  filter: DocsTrayFilter,
  installationId: string | undefined,
  page: number
): Promise<{ rows: DigestEntry[]; total: number; page: number; all: DigestEntry[] }> {
  const all = await listExpiryEntries(tenantId, todayUtc());
  const filtered = applyFilter(all, filter, installationId);
  const totalPages = Math.max(1, Math.ceil(filtered.length / DOCS_TRAY_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rows = filtered.slice((safePage - 1) * DOCS_TRAY_PAGE_SIZE, safePage * DOCS_TRAY_PAGE_SIZE);
  return { rows, total: filtered.length, page: safePage, all };
}

export const docsTrayModal: ModalDef = {
  callbackId: "opai_documentos",
  title: "Documentos por vencer",
  requires: (perms) => hasModuleAccess(perms, "ops"),
  requiresMessage: "Necesitas acceso al módulo de Operaciones para ver la bandeja de documentos.",
  build: async (ctx) => {
    const data = await loadDocsTray(ctx.tenantId, "todos", undefined, 1);
    return buildDocsTrayView(data, "todos");
  },
  submit: async () => ({ ack: {} }),
};
