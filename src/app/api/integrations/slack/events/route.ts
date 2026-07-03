import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/integrations/slack/signature";
import { getTenantForTeam, markWorkspaceRevoked } from "@/lib/integrations/slack/workspace";
import { handleBotEvent, type SlackBotEvent } from "@/lib/integrations/slack/bot";
import { handleInboundSlackMessage } from "@/lib/integrations/slack/bridge-inbound";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/slack/events — Slack Events API.
 * Pública en el proxy; la seguridad es la firma HMAC verificada in-route.
 * SIEMPRE responde 200 en <1s; el trabajo extra corre en after().
 */
export async function POST(req: NextRequest) {
  // El rawBody debe leerse ANTES de parsear (necesario para la firma).
  const rawBody = await req.text();
  if (!verifySlackSignature({ headers: req.headers, rawBody })) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: {
    type?: string;
    challenge?: string;
    team_id?: string;
    event?: SlackBotEvent;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Handshake de suscripción de eventos.
  if (payload.type === "url_verification" && payload.challenge) {
    return new NextResponse(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const teamId = payload.team_id;
  if (!teamId) return NextResponse.json({ ok: true });

  // Resolución de tenant por la frontera de aislamiento (team_id → tenant).
  // Tenant desconocido → 200 silencioso (nunca 4xx a Slack).
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return NextResponse.json({ ok: true });

  const eventType = payload.event?.type ?? payload.type;

  switch (eventType) {
    case "app_uninstalled":
    case "tokens_revoked":
      after(async () => {
        await markWorkspaceRevoked(teamId);
        await logAudit({
          action: "UPDATE",
          entity: "SlackWorkspace",
          entityId: teamId,
          tenantId: resolved.tenantId,
          details: { reason: eventType },
        });
        console.error(`[slack] workspace revocado por evento ${eventType} (team ${teamId})`);
      });
      break;
    case "assistant_thread_started":
    case "assistant_thread_context_changed":
      // OPAI como agente nativo del panel de IA de Slack.
      if (payload.event) {
        const ev = payload.event as unknown as import("@/lib/integrations/slack/assistant").AssistantEvent;
        const started = eventType === "assistant_thread_started";
        after(async () => {
          try {
            const mod = await import("@/lib/integrations/slack/assistant");
            if (started) await mod.handleAssistantThreadStarted(resolved.tenantId, ev);
            else await mod.handleAssistantContextChanged(resolved.tenantId, ev);
          } catch (err) {
            console.error("[slack] evento assistant falló:", err);
          }
        });
      }
      break;
    case "app_home_opened":
      // Pestaña Inicio → publica el panel personal. Pestaña Mensajes → bienvenida única.
      if (payload.event) {
        const ev = payload.event as unknown as { user?: string; tab?: string };
        after(async () => {
          try {
            const { publishHome, maybeSendWelcome } = await import("@/lib/integrations/slack/home");
            if (ev.tab === "messages") await maybeSendWelcome(resolved.tenantId, ev.user ?? "");
            else await publishHome(resolved.tenantId, ev.user ?? "");
          } catch (err) {
            console.error("[slack] app_home_opened falló:", err);
          }
        });
      }
      break;
    case "reaction_added":
    case "reaction_removed":
      // Reacción sobre un mensaje puenteado → refleja en el chat de OPAI.
      if (payload.event) {
        const rawEvent = payload.event as unknown as import("@/lib/integrations/slack/reactions").SlackReactionEvent;
        const added = eventType === "reaction_added";
        after(async () => {
          try {
            const { handleSlackReaction } = await import("@/lib/integrations/slack/reactions");
            await handleSlackReaction(resolved.tenantId, rawEvent, added);
          } catch (err) {
            console.error("[slack] evento reaction falló:", err);
          }
        });
      }
      break;
    case "app_mention":
    case "message":
      // ACK 200 inmediato; el trabajo corre en after() (Slack exige <3s).
      if (payload.event) {
        const event = payload.event;
        const ct = event.channel_type;
        // Canales/grupos puenteados → bridge; DMs (im) y menciones → bot.
        const toBridge = eventType === "message" && (ct === "channel" || ct === "group");
        after(async () => {
          try {
            // Comentar un ticket respondiendo su hilo (Fase 7): si el reply cae en
            // el hilo raíz de un ticket, se consume acá y NO va al puente/bot.
            if (eventType === "message" && event.thread_ts && (ct === "channel" || ct === "group")) {
              const { handleTicketThreadComment } = await import("@/lib/integrations/slack/ticket-thread-comment");
              if (await handleTicketThreadComment(resolved.tenantId, event)) return;
            }
            if (toBridge) {
              await handleInboundSlackMessage(teamId, resolved.tenantId, resolved.workspaceId, event);
            } else {
              await handleBotEvent(teamId, event);
            }
          } catch (err) {
            console.error("[slack] evento message falló:", err);
          }
        });
      }
      break;
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
