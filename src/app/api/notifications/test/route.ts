/**
 * API Route: /api/notifications/test
 * POST - Envía 5 push notifications de prueba de distintos tipos para verificar el sistema E2E.
 *        También crea las bell notifications correspondientes.
 *        Solo disponible para owner/admin.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sendPushToSubscriptions } from "@/lib/notifications/push-sender";

const TEST_NOTIFICATIONS = [
  {
    type: "new_lead",
    notifKey: "new_lead",
    title: "🧪 Nuevo lead recibido",
    message: "Lead de prueba — Juan Pérez (juan@test.com) desde formulario web",
    link: "/crm/leads",
    data: { source: "test", leadName: "Juan Pérez" },
  },
  {
    type: "ticket_created",
    notifKey: "ticket_created",
    title: "🧪 Ticket urgente P1",
    message: "Ticket #T-001 — Alarma activada en Sede Central",
    link: "/ops/tickets",
    data: { source: "test", ticketCode: "T-001", priority: "P1" },
  },
  {
    type: "mention_direct",
    notifKey: "mention_direct",
    title: "🧪 Te mencionaron en una nota",
    message: "@usuario revisa la propuesta del cliente Acme Corp",
    link: "/crm/accounts",
    data: { source: "test", entityType: "ACCOUNT" },
  },
  {
    type: "contract_expiring",
    notifKey: "contract_expiring",
    title: "🧪 Contrato por vencer",
    message: "Contrato CT-2024-089 de Seguridad Industrial vence en 5 días",
    link: "/docs/contracts",
    data: { source: "test", contractCode: "CT-2024-089", daysRemaining: 5 },
  },
  {
    type: "followup_sent",
    notifKey: "followup_sent",
    title: "🧪 Follow-up enviado",
    message: "Follow-up #3 enviado a contacto@empresa.com — cotización pendiente",
    link: "/crm/deals",
    data: {
      source: "test",
      followupNumber: 3,
      whatsappUrl: "https://wa.me/56900000000?text=Hola%20prueba",
    },
  },
];

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return NextResponse.json(
      { error: "Solo owner o admin pueden ejecutar este test" },
      { status: 403 }
    );
  }

  const results: {
    id: string;
    type: string;
    title: string;
    pushSent: boolean;
    pushError?: string;
  }[] = [];

  for (const notif of TEST_NOTIFICATIONS) {
    // 1. Crear bell notification
    const record = await prisma.notification.create({
      data: {
        tenantId: ctx.tenantId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        link: notif.link,
        data: { ...notif.data, targetUserId: ctx.userId } as any,
      },
    });

    // 2. Enviar push notification al usuario actual
    let pushSent = false;
    let pushError: string | undefined;
    try {
      await sendPushToSubscriptions({
        tenantId: ctx.tenantId,
        subscriberType: "ADMIN",
        subscriberId: ctx.userId,
        notifKey: notif.notifKey,
        title: notif.title,
        body: notif.message,
        url: notif.link,
        data: {
          ...notif.data,
          notificationId: record.id,
          tag: `test-${notif.type}`,
        },
      });
      pushSent = true;
    } catch (err) {
      pushError = err instanceof Error ? err.message : String(err);
    }

    results.push({
      id: record.id,
      type: notif.type,
      title: notif.title,
      pushSent,
      pushError,
    });
  }

  const pushOk = results.filter((r) => r.pushSent).length;
  const pushFail = results.filter((r) => !r.pushSent).length;

  return NextResponse.json({
    success: true,
    message: `${results.length} notificaciones creadas. Push: ${pushOk} enviadas, ${pushFail} fallidas.`,
    results,
  });
}
