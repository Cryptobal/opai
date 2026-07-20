import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { dispatchPersonalSlackDm } from "@/lib/integrations/slack/personal-dm";
import { scopeName } from "@/lib/crm/radar-scope";

/**
 * Alerta de un RadarItem `nuevo_lead` / `senal_compra`: DM personal de Slack
 * (url-buttons con etiqueta propia) + notificación in-app (bell) con el mismo
 * deep-link. Best-effort: nunca lanza.
 */
export async function dispatchRadarAlert(itemId: string): Promise<void> {
  try {
    const item = await prisma.crmRadarItem.findUnique({
      where: { id: itemId },
      select: {
        tenantId: true, userId: true, kind: true, summary: true,
        threadId: true, dealId: true, accountId: true, payload: true,
      },
    });
    if (!item) return;
    const payload = (item.payload as Record<string, unknown> | null) ?? {};

    if (item.kind === "nuevo_lead") {
      const remitente = typeof payload.remitente === "string" ? payload.remitente : "remitente";
      const body = `${remitente}${item.summary ? ` · ${item.summary}` : ""}`;
      const verCorreo = `/crm/correos?thread=${item.threadId}`;
      const crearLead = `/crm/correos?thread=${item.threadId}&extract=1`;
      await dispatchPersonalSlackDm({
        tenantId: item.tenantId, adminId: item.userId, typeKey: "radar_comercial",
        title: "📡 Posible lead detectado", body, category: "Radar Comercial",
        actions: [
          { label: "Crear lead con IA", url: crearLead, style: "primary" },
          { label: "Ver correo", url: verCorreo },
        ],
      });
      await notify({
        tenantId: item.tenantId, type: "radar_comercial", targetType: "ADMIN",
        targetIds: [item.userId], title: "Posible lead detectado", body,
        link: crearLead, data: { radarItemId: itemId, kind: item.kind },
        forceChannels: { bell: true, push: false, slack: false },
      });
      return;
    }

    if (item.kind === "senal_compra") {
      const nombre = await scopeName(item.tenantId, item.dealId, item.accountId);
      const body = item.summary || "Señales de intención de compra";
      const link = item.dealId ? `/crm/deals/${item.dealId}` : `/crm/accounts/${item.accountId}`;
      await dispatchPersonalSlackDm({
        tenantId: item.tenantId, adminId: item.userId, typeKey: "radar_comercial",
        title: `🔥 Señal de compra en ${nombre}`, body, category: "Radar Comercial",
        actions: [{ label: "Abrir negocio", url: link, style: "primary" }],
      });
      await notify({
        tenantId: item.tenantId, type: "radar_comercial", targetType: "ADMIN",
        targetIds: [item.userId], title: `Señal de compra en ${nombre}`, body,
        link, data: { radarItemId: itemId, kind: item.kind },
        forceChannels: { bell: true, push: false, slack: false },
      });
    }
  } catch (err) {
    console.warn("[radar] alerta falló", itemId, err);
  }
}
