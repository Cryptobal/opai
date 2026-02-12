/**
 * API Route: /api/notifications
 * GET    - Listar notificaciones del tenant
 * PATCH  - Marcar notificaciones como leídas
 * DELETE - Eliminar notificaciones (todas o por IDs)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { addDays } from "date-fns";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import { hasAppAccess } from "@/lib/app-access";
import { type AppKey } from "@/lib/app-keys";

const GUARDIA_DOC_ALERT_DAYS = 30;
const NOTIFICATION_TYPE_APP_ACCESS: Record<string, AppKey> = {
  new_lead: "crm",
  lead_approved: "crm",
  prospect: "crm",
  quote_sent: "cpq",
  quote_viewed: "cpq",
  contract_required: "docs",
  contract_expiring: "docs",
  contract_expired: "docs",
  guardia_doc_expiring: "ops",
  guardia_doc_expired: "ops",
  new_postulacion: "ops",
  document_signed_completed: "docs",
  email_opened: "crm",
  email_clicked: "crm",
  email_bounced: "crm",
  followup_sent: "crm",
  followup_scheduled: "crm",
  followup_failed: "crm",
};

function getRoleExcludedNotificationTypes(role: string): string[] {
  return Object.entries(NOTIFICATION_TYPE_APP_ACCESS)
    .filter(([, app]) => !hasAppAccess(role, app))
    .map(([type]) => type);
}

async function ensureGuardiaDocExpiryNotifications(tenantId: string, enabled: boolean) {
  if (!enabled) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limitDate = addDays(today, GUARDIA_DOC_ALERT_DAYS);

  const docs = await prisma.opsDocumentoPersona.findMany({
    where: {
      tenantId,
      expiresAt: { not: null, lte: limitDate },
      status: { not: "vencido" },
    },
    include: {
      guardia: {
        include: {
          persona: { select: { firstName: true, lastName: true } },
        },
      },
    },
    take: 200,
  });

  for (const doc of docs) {
    if (!doc.expiresAt) continue;
    const expiresAt = new Date(doc.expiresAt);
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const type = daysRemaining < 0 ? "guardia_doc_expired" : "guardia_doc_expiring";
    const personName = `${doc.guardia.persona.firstName} ${doc.guardia.persona.lastName}`.trim();
    const title =
      daysRemaining < 0
        ? `Documento vencido de guardia: ${personName}`
        : `Documento por vencer de guardia: ${personName}`;
    const message =
      daysRemaining < 0
        ? `${doc.type} venció y requiere renovación.`
        : `${doc.type} vence en ${daysRemaining} día(s).`;

    const existing = await prisma.notification.findFirst({
      where: {
        tenantId,
        type,
        data: { path: ["guardiaDocumentId"], equals: doc.id },
        createdAt: { gte: addDays(today, -1) },
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.notification.create({
      data: {
        tenantId,
        type,
        title,
        message,
        link: `/personas/guardias/${doc.guardiaId}`,
        data: {
          guardiaId: doc.guardiaId,
          guardiaDocumentId: doc.id,
          expiresAt: doc.expiresAt,
          docType: doc.type,
        },
      },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const prefs = await getNotificationPrefs(ctx.tenantId);

    await ensureGuardiaDocExpiryNotifications(
      ctx.tenantId,
      prefs.guardiaDocExpiryBellEnabled
    );

    const excludedTypes = new Set<string>(getRoleExcludedNotificationTypes(ctx.userRole));
    if (!prefs.guardiaDocExpiryBellEnabled) {
      excludedTypes.add("guardia_doc_expiring");
      excludedTypes.add("guardia_doc_expired");
    }
    if (!prefs.postulacionBellEnabled) {
      excludedTypes.add("new_postulacion");
    }
    const excludedTypesList = Array.from(excludedTypes);
    const notificationsWhere = {
      tenantId: ctx.tenantId,
      ...(unreadOnly ? { read: false } : {}),
      ...(excludedTypesList.length > 0 ? { type: { notIn: excludedTypesList } } : {}),
    };

    const notifications = await prisma.notification.findMany({
      where: notificationsWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: {
        tenantId: ctx.tenantId,
        read: false,
        ...(excludedTypesList.length > 0 ? { type: { notIn: excludedTypesList } } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      data: notifications,
      meta: { unreadCount },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const roleExcludedTypes = getRoleExcludedNotificationTypes(ctx.userRole);

    const body = await request.json();

    if (body.markAllRead) {
      // Mark all notifications as read
      await prisma.notification.updateMany({
        where: {
          tenantId: ctx.tenantId,
          read: false,
          ...(roleExcludedTypes.length > 0 ? { type: { notIn: roleExcludedTypes } } : {}),
        },
        data: { read: true },
      });
    } else if (body.ids && Array.isArray(body.ids)) {
      // Mark specific notifications as read
      await prisma.notification.updateMany({
        where: {
          id: { in: body.ids },
          tenantId: ctx.tenantId,
          ...(roleExcludedTypes.length > 0 ? { type: { notIn: roleExcludedTypes } } : {}),
        },
        data: { read: true },
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Provide 'markAllRead: true' or 'ids: string[]'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const roleExcludedTypes = getRoleExcludedNotificationTypes(ctx.userRole);

    const body = await request.json();

    if (body.deleteAll) {
      await prisma.notification.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          ...(roleExcludedTypes.length > 0 ? { type: { notIn: roleExcludedTypes } } : {}),
        },
      });
    } else if (body.ids && Array.isArray(body.ids)) {
      await prisma.notification.deleteMany({
        where: {
          id: { in: body.ids },
          tenantId: ctx.tenantId,
          ...(roleExcludedTypes.length > 0 ? { type: { notIn: roleExcludedTypes } } : {}),
        },
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Provide 'deleteAll: true' or 'ids: string[]'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete notifications" },
      { status: 500 }
    );
  }
}
