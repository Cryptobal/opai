import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { calcDocStatus } from "@/lib/docs-operacionales";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const filtro = searchParams.get("filtro") ?? "obligatorio_visita";
    const search = searchParams.get("search")?.trim() ?? "";

    // 1. Get document types (global + instalacion) with optional obligatorioEnVisita filter
    const tiposWhere: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      isActive: true,
      capa: { in: ["global", "instalacion"] },
    };
    if (filtro === "obligatorio_visita") {
      tiposWhere.obligatorioEnVisita = true;
    }

    const tipos = await prisma.tipoDocOperacional.findMany({
      where: tiposWhere,
      orderBy: { order: "asc" },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        capa: true,
        tieneVencimiento: true,
        diasAlerta: true,
        obligatorioEnVisita: true,
        obligatorio: true,
      },
    });

    // 2. Get active installations with optional name search
    const instWhere: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      status: "active",
    };
    if (search) {
      instWhere.name = { contains: search, mode: "insensitive" };
    }

    const installations = await prisma.crmInstallation.findMany({
      where: instWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    const installationIds = installations.map((i) => i.id);
    const tipoIds = tipos.map((t) => t.id);

    if (installationIds.length === 0 || tipoIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { tipos, rows: [] },
      });
    }

    // 3. Get digital docs for these installations + types
    const docs = await prisma.docOperacional.findMany({
      where: {
        tenantId: ctx.tenantId,
        tipoId: { in: tipoIds },
        OR: [
          { capa: "global", installationId: null },
          { capa: "instalacion", installationId: { in: installationIds } },
        ],
      },
      select: {
        id: true,
        tipoId: true,
        capa: true,
        installationId: true,
        expiresAt: true,
        status: true,
        fileName: true,
      },
    });

    // 4. Get latest physical verification per tipo+installation using distinct
    const verificaciones = await prisma.docVerificacionFisica.findMany({
      where: {
        tenantId: ctx.tenantId,
        tipoDocId: { in: tipoIds },
        installationId: { in: installationIds },
        capa: { in: ["global", "instalacion"] },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["tipoDocId", "installationId"],
      select: {
        tipoDocId: true,
        installationId: true,
        presente: true,
        createdAt: true,
        supervisor: { select: { name: true } },
      },
    });

    // 5. Get last supervision visit per installation
    const lastVisits = await prisma.opsVisitaSupervision.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        status: "completed",
      },
      orderBy: { checkInAt: "desc" },
      distinct: ["installationId"],
      select: {
        installationId: true,
        checkInAt: true,
      },
    });

    // Build lookup maps
    // Global docs indexed by tipoId
    const globalDocByTipo = new Map<string, (typeof docs)[0]>();
    // Installation docs indexed by "tipoId|installationId"
    const instDocByKey = new Map<string, (typeof docs)[0]>();
    for (const doc of docs) {
      if (doc.capa === "global") {
        // Use most recent (first encountered since we don't have orderBy, just overwrite)
        if (!globalDocByTipo.has(doc.tipoId)) {
          globalDocByTipo.set(doc.tipoId, doc);
        }
      } else if (doc.installationId) {
        const key = `${doc.tipoId}|${doc.installationId}`;
        if (!instDocByKey.has(key)) {
          instDocByKey.set(key, doc);
        }
      }
    }

    // Verificaciones indexed by "tipoDocId|installationId"
    const verifByKey = new Map<string, (typeof verificaciones)[0]>();
    for (const v of verificaciones) {
      if (v.tipoDocId) {
        verifByKey.set(`${v.tipoDocId}|${v.installationId}`, v);
      }
    }

    // Last visits indexed by installationId
    const lastVisitByInst = new Map<string, (typeof lastVisits)[0]>();
    for (const v of lastVisits) {
      lastVisitByInst.set(v.installationId, v);
    }

    // 6. Build response rows
    const rows = installations.map((inst) => {
      const lastVisit = lastVisitByInst.get(inst.id);

      const cells = tipos.map((tipo) => {
        // For global types, use global doc; for instalacion types, use installation-specific doc
        let doc: (typeof docs)[0] | undefined;
        if (tipo.capa === "global") {
          doc = globalDocByTipo.get(tipo.id);
        } else {
          doc = instDocByKey.get(`${tipo.id}|${inst.id}`);
        }

        const verif = verifByKey.get(`${tipo.id}|${inst.id}`);

        const digitalStatus = doc
          ? calcDocStatus(doc.expiresAt, tipo.tieneVencimiento, tipo.diasAlerta)
          : null;

        return {
          tipoDocId: tipo.id,
          digitalStatus,
          docId: doc?.id ?? null,
          fileName: doc?.fileName ?? null,
          fisicaPresente: verif?.presente ?? null,
          ultimaVerificacion: verif?.createdAt?.toISOString() ?? null,
          supervisorName: verif?.supervisor?.name ?? null,
        };
      });

      return {
        installationId: inst.id,
        installationName: inst.name,
        lastVisit: lastVisit?.checkInAt?.toISOString() ?? null,
        cells,
      };
    });

    return NextResponse.json({
      success: true,
      data: { tipos, rows },
    });
  } catch (error) {
    console.error("[GRILLA-DOCS] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener grilla de documentos" },
      { status: 500 }
    );
  }
}
