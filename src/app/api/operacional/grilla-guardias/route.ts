import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { calcDocStatus } from "@/lib/docs-operacionales";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const filtro = searchParams.get("filtro") ?? "obligatorio_visita";
    const search = searchParams.get("search")?.trim() ?? "";

    // 1. Get guard document config
    const guardConfig = await getGuardiaDocumentosConfig(ctx.tenantId);

    // 2. Filter doc types by filtro param
    let filteredConfig = guardConfig;
    if (filtro === "obligatorio_visita") {
      filteredConfig = guardConfig.filter((c) => c.obligatorioEnVisita);
    } else if (filtro === "obligatorio") {
      // All that have expiration (commonly "required") — keep all non-hidden types
      filteredConfig = guardConfig.filter((c) => c.visibleInGuardForm !== false);
    }
    // "todos" → use all guardConfig as-is

    // 3. Get active installations with their assigned guards (via currentInstallation relation)
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
      select: {
        id: true,
        name: true,
        guardiasActuales: {
          where: { tenantId: ctx.tenantId, status: "active" },
          select: {
            id: true,
            persona: {
              select: {
                firstName: true,
                lastName: true,
                rut: true,
              },
            },
          },
        },
      },
    });

    // Apply guard name search filter if search is set (installations already filtered by name;
    // also check guard names if the installation name didn't match, but since we already filter
    // installations by name, guard-name search would need a separate query. The spec says
    // "installation/guard name" — handle by also searching guard persona names if search is set.)
    // If no results from installation name search and search is set, do a guard-name search too.
    let installationIds = installations.map((i) => i.id);

    if (search && installationIds.length === 0) {
      // Try searching by guard name
      const guardsByName = await prisma.opsGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "active",
          currentInstallationId: { not: null },
          persona: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        select: { currentInstallationId: true },
      });
      const guardInstIds = [...new Set(guardsByName.map((g) => g.currentInstallationId as string))];

      if (guardInstIds.length > 0) {
        const guardInsts = await prisma.crmInstallation.findMany({
          where: { id: { in: guardInstIds }, tenantId: ctx.tenantId, status: "active" },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            guardiasActuales: {
              where: { tenantId: ctx.tenantId, status: "active" },
              select: {
                id: true,
                persona: {
                  select: {
                    firstName: true,
                    lastName: true,
                    rut: true,
                  },
                },
              },
            },
          },
        });
        installations.push(...guardInsts);
        installationIds = installations.map((i) => i.id);
      }
    }

    // Collect all guardia IDs
    const allGuardiaIds = installations.flatMap((i) => i.guardiasActuales.map((g) => g.id));

    if (allGuardiaIds.length === 0 || filteredConfig.length === 0) {
      const docTypes = filteredConfig.map((c) => ({
        code: c.code,
        hasExpiration: c.hasExpiration,
        alertDaysBefore: c.alertDaysBefore,
        obligatorioEnVisita: c.obligatorioEnVisita,
      }));

      const rows = installations.map((inst) => ({
        installationId: inst.id,
        installationName: inst.name,
        lastVisit: null,
        guardiasCount: inst.guardiasActuales.length,
        guardias: [],
      }));

      return NextResponse.json({ success: true, data: { docTypes, rows } });
    }

    // 4. Get guard documents (OpsDocumentoPersona) for these guards
    const docCodes = filteredConfig.map((c) => c.code);
    const guardDocs = await prisma.opsDocumentoPersona.findMany({
      where: {
        tenantId: ctx.tenantId,
        guardiaId: { in: allGuardiaIds },
        type: { in: docCodes },
      },
      select: {
        id: true,
        guardiaId: true,
        type: true,
        expiresAt: true,
        status: true,
        fileName: true,
      },
    });

    // 5. Get physical verifications for guards (capa: "guardia")
    const guardVerificaciones = await prisma.docVerificacionFisica.findMany({
      where: {
        tenantId: ctx.tenantId,
        guardiaId: { in: allGuardiaIds },
        installationId: { in: installationIds },
        capa: "guardia",
      },
      orderBy: { createdAt: "desc" },
      distinct: ["guardiaDocType", "guardiaId"],
      select: {
        guardiaId: true,
        guardiaDocType: true,
        installationId: true,
        presente: true,
        createdAt: true,
        supervisor: { select: { name: true } },
      },
    });

    // 6. Get last visits per installation
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
    // Guard docs indexed by "guardiaId|type"
    const guardDocByKey = new Map<string, (typeof guardDocs)[0]>();
    for (const doc of guardDocs) {
      const key = `${doc.guardiaId}|${doc.type}`;
      if (!guardDocByKey.has(key)) {
        guardDocByKey.set(key, doc);
      }
    }

    // Guard verificaciones indexed by "guardiaId|guardiaDocType"
    const guardVerifByKey = new Map<string, (typeof guardVerificaciones)[0]>();
    for (const v of guardVerificaciones) {
      if (v.guardiaDocType) {
        const key = `${v.guardiaId}|${v.guardiaDocType}`;
        if (!guardVerifByKey.has(key)) {
          guardVerifByKey.set(key, v);
        }
      }
    }

    // Last visits indexed by installationId
    const lastVisitByInst = new Map<string, (typeof lastVisits)[0]>();
    for (const v of lastVisits) {
      lastVisitByInst.set(v.installationId, v);
    }

    // 7. Build response
    const docTypes = filteredConfig.map((c) => ({
      code: c.code,
      hasExpiration: c.hasExpiration,
      alertDaysBefore: c.alertDaysBefore,
      obligatorioEnVisita: c.obligatorioEnVisita ?? false,
    }));

    const rows = installations.map((inst) => {
      const lastVisit = lastVisitByInst.get(inst.id);

      const guardias = inst.guardiasActuales.map((guardia) => {
        const guardiaName = `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim();

        const cells = filteredConfig.map((docType) => {
          const doc = guardDocByKey.get(`${guardia.id}|${docType.code}`);
          const verif = guardVerifByKey.get(`${guardia.id}|${docType.code}`);

          const digitalStatus = doc
            ? calcDocStatus(doc.expiresAt, docType.hasExpiration, docType.alertDaysBefore)
            : null;

          return {
            code: docType.code,
            digitalStatus,
            docId: doc?.id ?? null,
            fileName: doc?.fileName ?? null,
            fisicaPresente: verif?.presente ?? null,
            ultimaVerificacion: verif?.createdAt?.toISOString() ?? null,
            supervisorName: verif?.supervisor?.name ?? null,
          };
        });

        return {
          guardiaId: guardia.id,
          guardiaName,
          guardiaRut: guardia.persona.rut ?? null,
          cells,
        };
      });

      return {
        installationId: inst.id,
        installationName: inst.name,
        lastVisit: lastVisit?.checkInAt?.toISOString() ?? null,
        guardiasCount: inst.guardiasActuales.length,
        guardias,
      };
    });

    return NextResponse.json({ success: true, data: { docTypes, rows } });
  } catch (error) {
    console.error("[GRILLA-GUARDIAS] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener grilla de documentos de guardias" },
      { status: 500 }
    );
  }
}
