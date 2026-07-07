/**
 * App Home de OPAI (Fase 7.1 · rediseño F20): panel personal con jerarquía sin
 * redundancia. Principios: el contador ES el botón; el texto del botón es la
 * acción (nunca "Abrir"); revelación progresiva (máx. 4 accesos contextuales +
 * "⚡ Todas las acciones" como única puerta a la cola larga); cero duplicados
 * semánticos; defaults = el caso del 90% (Mis tickets aterriza en "Míos").
 *
 * Estructura: "Tu día" (contadores accionables + desglose en context) · divider
 * · "Accesos rápidos" (contextuales por rol + ⚡) · footer de una línea.
 * Máx. 3 botones por actions block (Slack mobile, 375px).
 *
 * También el mensaje de bienvenida único (estilo agente) por DM, marcado en
 * `SlackUserLink.welcomedAt` para no repetirlo jamás.
 */

import { prisma } from "@/lib/prisma";
import { hasModuleAccess, canView, canEdit } from "@/lib/permissions";
import { getWorkspaceForTenant } from "./workspace";
import { resolveLinkedAdmin, buildLinkUrl } from "./user-link";
import { slackPublishHomeView, slackPostMessage, slackOpenDm } from "./api";
import { countTickets } from "./tickets/list";
import { countInbox } from "./approvals/inbox";
import { countLeads } from "./comercial/leads-list";
import { listAdjudicados, type AdjudicadoDeal } from "./comercial/adjudicados";
import { adjudicadosSectionBlocks } from "./home-adjudicados-blocks";
import { isDailyBriefOptIn } from "./daily-brief";

const pt = (text: string) => ({ type: "plain_text", text, emoji: true });

/** Botón que abre un modal del hub por callbackId (opai_action_open → getModal). */
function openBtn(text: string, callbackId: string, style?: "primary" | "danger") {
  const b: Record<string, unknown> = { type: "button", text: pt(text), action_id: `opai_action_open_${callbackId}`, value: callbackId };
  if (style) b.style = style;
  return b;
}

function actionBtn(text: string, actionId: string) {
  return { type: "button", text: pt(text), action_id: actionId };
}

/** Parte una lista en filas de máx. 3 botones (Slack mobile, 375px). */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

interface DayBreakdown {
  mine: number;
  team: number;
  unassigned: number | null; // null = el usuario no tiene visión global (se omite del desglose)
  vencidos: number;
  approvals: number; // agregado de los tres dominios (tickets + rendiciones + TEs)
  leadsSinTomar: number | null; // null = sin acceso a leads (botón oculto)
  briefOptIn: boolean;
  quick: { text: string; callbackId: string }[]; // accesos contextuales por rol (≤4)
  adjudicados: AdjudicadoDeal[] | null; // null = sin acceso a deals (sección oculta)
}

function linkedHome(day: DayBreakdown): unknown {
  // "Tu día": los contadores SON los botones. Aprobaciones se oculta si es 0.
  const counters = [
    openBtn(`🎫 ${day.mine} abiertos`, "opai_tickets", "primary"),
    openBtn(`🔴 ${day.vencidos} SLA vencidos`, "opai_tickets_vencidos", day.vencidos > 0 ? "danger" : undefined),
  ];
  if (day.approvals > 0) counters.push(openBtn(`✅ ${day.approvals} por aprobar`, "opai_aprobaciones"));

  // Desglose de alcance (F11) en una línea pequeña bajo los contadores.
  const scope = [`👤 ${day.mine} tuyos`, `👥 ${day.team} de tu equipo`];
  if (day.unassigned != null) scope.push(`⚪ ${day.unassigned} sin asignar`);

  const quick = [
    ...day.quick.map((q) => openBtn(q.text, q.callbackId)),
    actionBtn(day.briefOptIn ? "🌅 Brief diario: ON" : "🌅 Brief diario: OFF", "brief_toggle"),
    openBtn("⚡ Todas las acciones", "opai_acciones"),
  ];

  return {
    type: "home",
    blocks: [
      { type: "header", text: pt("OPAI · Tu panel") },
      { type: "section", text: { type: "mrkdwn", text: "*Tu día*" } },
      ...chunk(counters, 3).map((row) => ({ type: "actions", elements: row })),
      { type: "context", elements: [{ type: "mrkdwn", text: scope.join("   ·   ") }] },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "*Accesos rápidos*" } },
      ...chunk(quick, 3).map((row) => ({ type: "actions", elements: row })),
      ...(day.adjudicados && day.adjudicados.length ? adjudicadosSectionBlocks(day.adjudicados) : []),
      { type: "context", elements: [{ type: "mrkdwn", text: "Escríbeme `@OPAI` o usa `/opai ayuda`" }] },
    ],
  };
}

function unlinkedHome(linkUrl: string): unknown {
  return {
    type: "home",
    blocks: [
      { type: "header", text: pt("OPAI") },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "👋 *Vincula tu cuenta de OPAI* para ver tu panel: tus tickets, aprobaciones y acciones rápidas. El enlace exige tu sesión activa de OPAI y vence en 15 minutos.",
        },
      },
      {
        type: "actions",
        elements: [{ type: "button", text: pt("Vincular mi cuenta OPAI"), url: linkUrl, style: "primary" }],
      },
    ],
  };
}

/** Publica (o refresca) la pestaña Inicio del usuario. Best-effort. */
export async function publishHome(tenantId: string, slackUserId: string): Promise<void> {
  if (!slackUserId) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;
  const linked = await resolveLinkedAdmin(ws, slackUserId);
  if (!linked) {
    await slackPublishHomeView(ws.botToken, slackUserId, unlinkedHome(buildLinkUrl(ws.id, slackUserId)));
    return;
  }
  // Desglose "Tu día". La cifra "sin asignar (tenant)" solo si el usuario tiene
  // visión global (mismo criterio que la vista "Todos" de la web: módulo ops).
  const canViewAll = hasModuleAccess(linked.perms, "ops");
  const canSeeLeads = canView(linked.perms, "crm", "leads");
  // Sección "Adjudicados por iniciar": mismo permiso que Pipeline/Mis negocios.
  // Alcance = canViewAll (ops ve todo · comercial solo sus cuentas). take 6 para
  // el presupuesto visual del Home; el pipeline completo sigue mostrando 25.
  const canSeeDeals = canView(linked.perms, "crm", "deals");
  const [mine, team, vencidos, unassigned, approvals, leadsSinTomar, briefOptIn, adjudicados] = await Promise.all([
    countTickets(tenantId, linked.adminId, { scope: "mine" }),
    countTickets(tenantId, linked.adminId, { scope: "my_team" }),
    countTickets(tenantId, linked.adminId, { scope: "my_team", slaBreached: true }),
    canViewAll ? countTickets(tenantId, linked.adminId, { scope: "unassigned" }) : Promise.resolve(null),
    countInbox(tenantId, linked.adminId, linked.perms),
    canSeeLeads ? countLeads(tenantId, { untaken: true }) : Promise.resolve(null),
    isDailyBriefOptIn(tenantId, linked.adminId),
    canSeeDeals
      ? listAdjudicados(tenantId, canViewAll ? undefined : { ownerId: linked.adminId }, 6)
      : Promise.resolve(null),
  ]);

  // Accesos rápidos contextuales por rol (máx. 4; ⚡ se agrega al final).
  // Regla F20: ninguna acción repetida en el Home — los contadores ya cubren
  // tickets/vencidos/aprobaciones, así que acá van solo las de creación/rol.
  const quick: { text: string; callbackId: string }[] = [];
  if (hasModuleAccess(linked.perms, "ops")) quick.push({ text: "➕ Nuevo ticket", callbackId: "opai_crear_ticket" });
  if (canView(linked.perms, "crm", "deals")) quick.push({ text: "📊 Pipeline", callbackId: "opai_pipeline" });
  if (canView(linked.perms, "crm", "deals")) quick.push({ text: "💼 Mis negocios", callbackId: "opai_mis_negocios" });
  if (canView(linked.perms, "crm", "accounts")) quick.push({ text: "🔎 Buscar cliente", callbackId: "opai_cuenta" });
  if (leadsSinTomar != null) {
    // El contador de sin-tomar ES el botón: con pendientes abre la sub-bandeja
    // "sin tomar"; sin pendientes abre la bandeja general.
    quick.push(leadsSinTomar > 0
      ? { text: `📇 ${leadsSinTomar} leads sin tomar`, callbackId: "opai_leads_nuevos" }
      : { text: "📇 Leads", callbackId: "opai_leads" });
  }
  if (canEdit(linked.perms, "finance", "rendiciones")) quick.push({ text: "🧾 Nueva rendición", callbackId: "opai_nueva_rendicion" });

  await slackPublishHomeView(
    ws.botToken,
    slackUserId,
    linkedHome({ mine, team, vencidos, unassigned, approvals, leadsSinTomar, briefOptIn, adjudicados, quick: quick.slice(0, 4) }),
  );
}

const WELCOME_TEXT = "¡Hola! Soy OPAI, tu copiloto de operaciones en Slack.";

function welcomeBlocks(): unknown[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "👋 *Soy OPAI*, tu copiloto de operaciones.\n" +
          "• Menciónarme `@OPAI` en un canal o escríbeme por DM para preguntar cualquier cosa.\n" +
          "• `/opai ayuda` lista todo lo que puedo hacer.\n" +
          "• Abre mi pestaña *Inicio* para tu panel personal.",
      },
    },
    {
      type: "actions",
      elements: [openBtn("🎫 Mis tickets", "opai_tickets", "primary"), openBtn("⚡ Todas las acciones", "opai_acciones")],
    },
  ];
}

/** Envía el mensaje de bienvenida UNA sola vez a un usuario vinculado (marca welcomedAt). */
export async function maybeSendWelcome(tenantId: string, slackUserId: string): Promise<void> {
  if (!slackUserId) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;
  const linked = await resolveLinkedAdmin(ws, slackUserId);
  if (!linked) return; // sin vínculo la bienvenida vive en el Home (CTA de vínculo)

  // Marca atómica: sólo el primer opened gana y dispara el DM.
  const claimed = await prisma.slackUserLink.updateMany({
    where: { workspaceId: ws.id, slackUserId, welcomedAt: null },
    data: { welcomedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const dm = await slackOpenDm(ws.botToken, slackUserId);
  if (!dm) return;
  await slackPostMessage(ws.botToken, { channel: dm, text: WELCOME_TEXT, blocks: welcomeBlocks() }).catch(() => {});
}
