import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import type { AuthContext } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { uploadFile } from "@/lib/storage";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { listSupervisorInstallationIds } from "@/lib/incidentes-instalacion/service";
import { getIncidentesKpis, listIncidentes, type IncidenteListFilter } from "@/lib/incidentes-instalacion/queries";
import {
  atenderIncidente,
  rechazarIncidente,
  resolverIncidentePorSupervision,
  validarIncidente,
} from "@/lib/incidentes-instalacion/lifecycle";
import {
  assertReportFile,
  type UploadedReportFile,
} from "@/lib/incidentes-instalacion/create-public";

export const dynamic = "force-dynamic";

async function scope(ctx: AuthContext) {
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "ops", "supervision") && !canView(perms, "ops", "tickets")) {
    return { error: NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 }) };
  }
  const viewAll = hasCapability(perms, "supervision_view_all");
  const ids = await listSupervisorInstallationIds({
    tenantId: ctx.tenantId,
    adminId: ctx.userId,
    viewAll,
  });
  return { ids, viewAll };
}

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const scoped = await scope(ctx);
  if ("error" in scoped) return scoped.error;
  const sp = request.nextUrl.searchParams;
  const filter = (sp.get("filter") ?? "pendientes") as IncidenteListFilter;
  const installationIds = scoped.ids;
  const [list, kpis] = await Promise.all([
    listIncidentes({
      tenantId: ctx.tenantId,
      installationIds,
      filter,
      page: parseInt(sp.get("page") ?? "1", 10),
      limit: 40,
    }),
    getIncidentesKpis({ tenantId: ctx.tenantId, installationIds }),
  ]);
  return NextResponse.json({ success: true, data: { ...list, kpis } });
}

type ActionBody = {
  ticketId: string;
  action: string;
  comment: string;
  reason: string;
  file: File | null;
};

async function readActionBody(request: NextRequest): Promise<ActionBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const rawFile = form.get("file");
    return {
      ticketId: String(form.get("ticketId") ?? form.get("id") ?? ""),
      action: String(form.get("action") ?? ""),
      comment: String(form.get("comment") ?? ""),
      reason: String(form.get("reason") ?? ""),
      file: rawFile instanceof File && rawFile.size > 0 ? rawFile : null,
    };
  }
  const body = await request.json().catch(() => null);
  return {
    ticketId: String(body?.ticketId ?? body?.id ?? ""),
    action: String(body?.action ?? ""),
    comment: String(body?.comment ?? ""),
    reason: String(body?.reason ?? ""),
    file: null,
  };
}

async function uploadOptionalFile(
  file: File,
  tenantId: string,
): Promise<UploadedReportFile> {
  assertReportFile({ mimeType: file.type, fileSize: file.size });
  const uploaded = await uploadFile(
    Buffer.from(await file.arrayBuffer()),
    file.name,
    file.type,
    "incidentes",
    tenantId,
  );
  return {
    storageKey: uploaded.storageKey,
    fileName: uploaded.fileName,
    contentType: uploaded.mimeType,
    fileSize: uploaded.size,
  };
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const scoped = await scope(ctx);
  if ("error" in scoped) return scoped.error;
  try {
    const body = await readActionBody(request);
    const ticketId = body.ticketId;
    const action = body.action;
    if (!ticketId) {
      return NextResponse.json({ success: false, error: "ticketId requerido" }, { status: 400 });
    }
    if (scoped.ids) {
      if (scoped.ids.length === 0) {
        return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
      }
      const owned = await prisma.opsTicket.findFirst({
        where: {
          id: ticketId,
          tenantId: ctx.tenantId,
          installationId: { in: scoped.ids },
        },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
      }
    }
    const actorName = ctx.userEmail || "Supervisión";
    if (action === "validar") {
      const result = await validarIncidente({
        tenantId: ctx.tenantId,
        ticketId,
        actorId: ctx.userId,
        actorName,
      });
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "rechazar") {
      const result = await rechazarIncidente({
        tenantId: ctx.tenantId,
        ticketId,
        actorId: ctx.userId,
        actorName,
        reason: body.reason,
      });
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "atender") {
      const result = await atenderIncidente({
        tenantId: ctx.tenantId,
        ticketId,
        actorId: ctx.userId,
        actorName,
      });
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "resolver") {
      const files: UploadedReportFile[] = [];
      if (body.file) {
        files.push(await uploadOptionalFile(body.file, ctx.tenantId));
      }
      const result = await resolverIncidentePorSupervision({
        tenantId: ctx.tenantId,
        ticketId,
        actorId: ctx.userId,
        actorName,
        comment: body.comment,
        files,
      });
      return NextResponse.json({ success: true, data: result });
    }
    return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[supervision/incidentes]", err);
    return NextResponse.json({ success: false, error: "No se pudo completar la acción" }, { status: 500 });
  }
}
