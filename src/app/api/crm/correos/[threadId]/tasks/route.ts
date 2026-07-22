/** GET → tareas del hilo · POST → crear tarea (hereda asociación del correo). */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { listThreadTasks, createThreadTask } from "@/modules/crm/email/correos-tasks";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { threadId } = await params;
  return NextResponse.json({ tasks: await listThreadTasks(ctx.tenantId, threadId) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx);
  if (forbidden) return forbidden;

  const { threadId } = await params;
  const body = (await req.json().catch(() => ({}))) as { title?: unknown; dueAt?: unknown };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ error: "El título es requerido" }, { status: 400 });

  let dueAt: Date | null = null;
  if (typeof body.dueAt === "string" && body.dueAt) {
    const d = new Date(body.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d;
  }

  const task = await createThreadTask({ tenantId: ctx.tenantId, userId: ctx.userId, threadId, title, dueAt });
  if (!task) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  return NextResponse.json({ task });
}
