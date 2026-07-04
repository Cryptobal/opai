/**
 * App Home de OPAI (Fase 7.1): la pestaña "Inicio" del bot se vuelve el panel
 * personal de cada usuario — botones grandes, contadores propios (tickets
 * abiertos/vencidos) y estado de vínculo. Los botones reusan el `action_id`
 * "opai_action_open" del hub; abren el mismo modal existente (cero duplicación).
 *
 * También el mensaje de bienvenida único (estilo agente) por DM, marcado en
 * `SlackUserLink.welcomedAt` para no repetirlo jamás.
 */

import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/permissions";
import { getWorkspaceForTenant } from "./workspace";
import { resolveLinkedAdmin, buildLinkUrl } from "./user-link";
import { slackPublishHomeView, slackPostMessage, slackOpenDm } from "./api";
import { countTickets } from "./tickets/list";
import { countInbox } from "./approvals/inbox";

const pt = (text: string) => ({ type: "plain_text", text, emoji: true });

/** Botón que abre un modal del hub por callbackId (opai_action_open → getModal). */
function openBtn(text: string, callbackId: string, style?: "primary" | "danger") {
  const b: Record<string, unknown> = { type: "button", text: pt(text), action_id: `opai_action_open_${callbackId}`, value: callbackId };
  if (style) b.style = style;
  return b;
}

interface DayBreakdown {
  mine: number;
  team: number;
  unassigned: number | null; // null = el usuario no tiene visión global (línea oculta)
  vencidos: number;
  approvals: number; // agregado de los tres dominios (tickets + rendiciones + TEs)
}

function linkedHome(day: DayBreakdown): unknown {
  const lines = [
    `👤 Asignados a ti: *${day.mine}*`,
    `👥 Tu equipo: *${day.team}*`,
  ];
  if (day.unassigned != null) lines.push(`⚪ Sin asignar (tenant): *${day.unassigned}*`);
  return {
    type: "home",
    blocks: [
      { type: "header", text: pt("OPAI · Tu panel") },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Tu día*\n${lines.join("   ·   ")}\n🔴 *${day.vencidos}* con SLA vencido`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `✅ *Pendientes de tu aprobación: ${day.approvals}*  _(tickets · rendiciones · turnos extra)_` },
      },
      { type: "section", text: { type: "mrkdwn", text: "*Acciones rápidas*" } },
      {
        type: "actions",
        elements: [
          openBtn("🎫 Mis tickets", "opai_tickets", "primary"),
          openBtn("🔴 Vencidos SLA", "opai_tickets_vencidos"),
          openBtn(day.approvals > 0 ? `✅ Aprobaciones (${day.approvals})` : "✅ Aprobaciones", "opai_aprobaciones", day.approvals > 0 ? "primary" : undefined),
        ],
      },
      {
        type: "actions",
        elements: [
          openBtn("➕ Nuevo ticket", "opai_crear_ticket"),
          openBtn("🧾 Mis rendiciones", "opai_mis_rendiciones"),
          openBtn("⚡ Todas las acciones", "opai_acciones"),
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Escríbeme `@OPAI` o usa `/opai ayuda` · OPAI Intelligence" }],
      },
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
  // "Tu día" desglosado. La línea "Sin asignar (tenant)" solo si el usuario
  // tiene visión global (mismo criterio que la vista "Todos" de la web: acceso
  // al módulo ops, único gate del route de counts).
  const canViewAll = hasModuleAccess(linked.perms, "ops");
  const [mine, team, vencidos, unassigned, approvals] = await Promise.all([
    countTickets(tenantId, linked.adminId, { scope: "mine" }),
    countTickets(tenantId, linked.adminId, { scope: "my_team" }),
    countTickets(tenantId, linked.adminId, { scope: "my_team", slaBreached: true }),
    canViewAll ? countTickets(tenantId, linked.adminId, { scope: "unassigned" }) : Promise.resolve(null),
    countInbox(tenantId, linked.adminId, linked.perms),
  ]);
  await slackPublishHomeView(
    ws.botToken,
    slackUserId,
    linkedHome({ mine, team, vencidos, unassigned, approvals }),
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
      elements: [openBtn("🎫 Mis tickets", "opai_tickets", "primary"), openBtn("⚡ Acciones", "opai_acciones")],
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
