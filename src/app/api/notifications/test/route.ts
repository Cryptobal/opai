/**
 * API Route: /api/notifications/test
 * POST - Crea 5 notificaciones de prueba de distintos tipos para verificar el sistema E2E.
 *        Solo disponible para owner/admin. En producción se deshabilita automáticamente.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const TEST_NOTIFICATIONS = [
  {
    type: "new_lead",
    title: "🧪 Test: Nuevo lead recibido",
    message: "Lead de prueba desde formulario web — Juan Pérez (juan@test.com)",
    link: "/crm/leads",
    data: { source: "test", leadName: "Juan Pérez" },
  },
  {
    type: "ticket_created",
    title: "🧪 Test: Ticket urgente creado",
    message: "Ticket #T-001 — Alarma activada en Sede Central, prioridad P1",
    link: "/ops/tickets",
    data: { source: "test", ticketCode: "T-001", priority: "P1" },
  },
  {
    type: "mention_direct",
    title: "🧪 Test: Te mencionaron en una nota",
    message: "@usuario revisa por favor la propuesta actualizada del cliente Acme Corp",
    link: "/crm/accounts",
    data: { source: "test", entityType: "ACCOUNT" },
  },
  {
    type: "contract_expiring",
    title: "🧪 Test: Contrato por vencer",
    message: "El contrato CT-2024-089 de Seguridad Industrial S.A. vence en 5 días",
    link: "/docs/contracts",
    data: { source: "test", contractCode: "CT-2024-089", daysRemaining: 5 },
  },
  {
    type: "followup_sent",
    title: "🧪 Test: Follow-up enviado",
    message: "Se envió follow-up #3 a contacto@empresa.com — cotización pendiente",
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

  // Solo owner o admin pueden ejecutar el test
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return NextResponse.json(
      { error: "Solo owner o admin pueden crear notificaciones de prueba" },
      { status: 403 }
    );
  }

  const created = [];

  for (const notif of TEST_NOTIFICATIONS) {
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
    created.push({
      id: record.id,
      type: notif.type,
      title: notif.title,
    });
  }

  return NextResponse.json({
    success: true,
    message: `Se crearon ${created.length} notificaciones de prueba`,
    notifications: created,
  });
}
