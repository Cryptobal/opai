/**
 * API Route: /api/crm/deals/[id]/tasks
 * GET  - Lista las tareas/checklist de un deal (?status=open|done|all, default all).
 * POST - Crea una tarea manual del checklist { title, dueAt? }.
 *
 * Multi-tenant: todas las queries filtran por ctx.tenantId y validan el deal
 * dentro del tenant. Permisos CRM granulares (view para leer, edit para crear).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { auditTaskAction } from "@/lib/audit-productividad";

async function loadDealInTenant(id: string, tenantId: string) {
  return prisma.crmDeal.findFirst({ where: { id, tenantId }, select: { id: true } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const deal = await loadDealInTenant(id, ctx.tenantId);
    if (!deal) {
      return NextResponse.json({ success: false, error: "Negocio no encontrado" }, { status: 404 });
    }

    const statusParam = request.nextUrl.searchParams.get("status") ?? "all";
    const statusFilter = statusParam === "open" || statusParam === "done" ? { status: statusParam } : {};

    const tasks = await prisma.crmTask.findMany({
      where: { tenantId: ctx.tenantId, dealId: id, ...statusFilter },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }],
      take: 100,
      select: { id: true, title: true, status: true, type: true, dueAt: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error("Error listing deal tasks:", error);
    return NextResponse.json({ success: false, error: "Error al listar tareas" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const deal = await loadDealInTenant(id, ctx.tenantId);
    if (!deal) {
      return NextResponse.json({ success: false, error: "Negocio no encontrado" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ success: false, error: "El título es obligatorio" }, { status: 400 });
    }
    const dueAt =
      typeof body?.dueAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.dueAt) && !Number.isNaN(Date.parse(body.dueAt))
        ? new Date(body.dueAt)
        : null;

    const task = await prisma.crmTask.create({
      data: {
        tenantId: ctx.tenantId,
        dealId: id,
        title,
        status: "open",
        type: "checklist",
        dueAt,
        assignedTo: ctx.userId,
        createdBy: ctx.userId,
      },
      select: { id: true, title: true, status: true, type: true, dueAt: true, createdAt: true },
    });

    void auditTaskAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "created",
      taskId: task.id,
      meta: { title: task.title, dealId: id },
      request,
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error("Error creating deal task:", error);
    return NextResponse.json({ success: false, error: "Error al crear tarea" }, { status: 500 });
  }
}
