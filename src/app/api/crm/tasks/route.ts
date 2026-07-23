/**
 * API Route: /api/crm/tasks
 * POST - Crea una tarea suelta (quick-create de la Agenda) o vinculada a
 *        cuenta/negocio: { title, dueAt?, allDay?, assignedTo?, accountId?, dealId? }.
 *
 * Multi-tenant: tenantId de la sesión; responsable/cuenta/negocio se validan
 * contra el tenant antes de crear. Permiso CRM edit sobre deals (mismo nivel
 * que el resto del checklist de tareas).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const body = await request.json().catch(() => ({}));

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { success: false, error: "El título no puede quedar vacío" },
        { status: 400 },
      );
    }

    let dueAt: Date | null = null;
    if (body?.dueAt != null) {
      if (typeof body.dueAt !== "string" || Number.isNaN(Date.parse(body.dueAt))) {
        return NextResponse.json(
          { success: false, error: "Fecha de vencimiento inválida" },
          { status: 400 },
        );
      }
      dueAt = new Date(body.dueAt);
    }

    // Responsable: default el usuario actual; si viene, debe ser del tenant.
    let assignedTo = ctx.userId;
    if (typeof body?.assignedTo === "string" && body.assignedTo) {
      const assignee = await prisma.admin.findFirst({
        where: { id: body.assignedTo, tenantId: ctx.tenantId, status: "active" },
        select: { id: true },
      });
      if (!assignee) {
        return NextResponse.json(
          { success: false, error: "Responsable inválido" },
          { status: 400 },
        );
      }
      assignedTo = assignee.id;
    }

    let dealId: string | null = null;
    if (typeof body?.dealId === "string" && body.dealId) {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: body.dealId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!deal) {
        return NextResponse.json(
          { success: false, error: "Negocio inválido" },
          { status: 400 },
        );
      }
      dealId = deal.id;
    }

    let accountId: string | null = null;
    if (typeof body?.accountId === "string" && body.accountId) {
      const account = await prisma.crmAccount.findFirst({
        where: { id: body.accountId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json(
          { success: false, error: "Cuenta inválida" },
          { status: 400 },
        );
      }
      accountId = account.id;
    }

    const task = await prisma.crmTask.create({
      data: {
        tenantId: ctx.tenantId,
        title,
        status: "open",
        type: "manual",
        dueAt,
        allDay: body?.allDay === true,
        assignedTo,
        dealId,
        accountId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        dueAt: true,
        allDay: true,
        assignedTo: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear tarea" },
      { status: 500 },
    );
  }
}
