import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { calcDocStatus } from "@/lib/docs-operacionales";
import { getInstallationContractCoverage } from "@/lib/crm/installation-contracts";

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
        fileUrl: true,
      },
    });

    // 4a. Verificaciones físicas por tipoDocId (camino correcto)
    const verificacionesByTipo = await prisma.docVerificacionFisica.findMany({
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
        hallazgo: {
          select: {
            id: true,
            status: true,
            severity: true,
            ticket: { select: { id: true, code: true, status: true } },
          },
        },
      },
    });

    // 4b. Fallback: verificaciones legacy con guardiaDocType (antes del fix del wizard)
    //     Se mapean por codigo del tipo para no perder datos históricos.
    const codigoToTipoId = new Map<string, string>();
    for (const t of tipos) codigoToTipoId.set(t.codigo, t.id);
    const codigos = Array.from(codigoToTipoId.keys());
    const verificacionesByCodigo = codigos.length
      ? await prisma.docVerificacionFisica.findMany({
          where: {
            tenantId: ctx.tenantId,
            tipoDocId: null,
            guardiaDocType: { in: codigos },
            installationId: { in: installationIds },
            capa: { in: ["global", "instalacion"] },
          },
          orderBy: { createdAt: "desc" },
          distinct: ["guardiaDocType", "installationId"],
          select: {
            guardiaDocType: true,
            installationId: true,
            presente: true,
            createdAt: true,
            supervisor: { select: { name: true } },
            hallazgo: {
              select: {
                id: true,
                status: true,
                severity: true,
                ticket: { select: { id: true, code: true, status: true } },
              },
            },
          },
        })
      : [];

    // 4c. Hallazgos abiertos asociados a documentación para badge en grilla
    //     Con el nuevo modelo (dedup) hay como máximo UN finding abierto por (installation, tipoDoc).
    //     Como fallback aún soportamos match heurístico por `description` para findings legacy sin tipoDocId.
    const openFindings = await prisma.opsSupervisionFinding.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        category: "documentation",
        status: { in: ["open", "in_progress"] },
      },
      orderBy: { firstDetectedAt: "asc" },
      select: {
        id: true,
        installationId: true,
        description: true,
        severity: true,
        status: true,
        tipoDocId: true,
        occurrenceCount: true,
        firstDetectedAt: true,
        lastDetectedAt: true,
        ticket: { select: { id: true, code: true, status: true, createdAt: true } },
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
    // Tipado común para mezclar ambos arrays
    type VerifCell = {
      presente: boolean;
      createdAt: Date;
      supervisor: { name: string | null } | null;
      hallazgo: {
        id: string;
        status: string;
        severity: string;
        ticket: { id: string; code: string | null; status: string } | null;
      } | null;
    };
    const verifByKey = new Map<string, VerifCell>();
    // Primero las que ya tienen tipoDocId (camino correcto)
    for (const v of verificacionesByTipo) {
      if (v.tipoDocId) {
        verifByKey.set(`${v.tipoDocId}|${v.installationId}`, {
          presente: v.presente,
          createdAt: v.createdAt,
          supervisor: v.supervisor,
          hallazgo: v.hallazgo,
        });
      }
    }
    // Luego fallback por código (datos legacy) — sólo si no hay ya una entrada por tipoDocId
    for (const v of verificacionesByCodigo) {
      if (!v.guardiaDocType) continue;
      const tipoId = codigoToTipoId.get(v.guardiaDocType);
      if (!tipoId) continue;
      const key = `${tipoId}|${v.installationId}`;
      if (!verifByKey.has(key)) {
        verifByKey.set(key, {
          presente: v.presente,
          createdAt: v.createdAt,
          supervisor: v.supervisor,
          hallazgo: v.hallazgo,
        });
      }
    }

    // Indexación de hallazgos abiertos:
    // 1) findingsByTipo: match exacto por (installationId + tipoDocId) — camino nuevo
    // 2) findingsByInstLegacy: match heurístico por description para findings legacy sin tipoDocId
    const findingsByTipo = new Map<string, typeof openFindings[number]>();
    const findingsByInstLegacy = new Map<string, typeof openFindings>();
    for (const f of openFindings) {
      if (f.tipoDocId) {
        const key = `${f.tipoDocId}|${f.installationId}`;
        const existing = findingsByTipo.get(key);
        // Si hay varios (no debería con la dedup), mantenemos el más antiguo (canónico)
        if (!existing || new Date(f.firstDetectedAt) < new Date(existing.firstDetectedAt)) {
          findingsByTipo.set(key, f);
        }
      } else {
        const arr = findingsByInstLegacy.get(f.installationId) ?? [];
        arr.push(f);
        findingsByInstLegacy.set(f.installationId, arr);
      }
    }

    // Last visits indexed by installationId
    const lastVisitByInst = new Map<string, (typeof lastVisits)[0]>();
    for (const v of lastVisits) {
      lastVisitByInst.set(v.installationId, v);
    }

    const contratoMandanteTipo = tipos.find((tipo) => tipo.codigo === "contrato_mandante");
    const contractCoverage = contratoMandanteTipo
      ? await getInstallationContractCoverage({
          tenantId: ctx.tenantId,
          installationIds,
          alertDaysBefore: contratoMandanteTipo.diasAlerta,
        })
      : new Map();

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

        const accountContract =
          tipo.codigo === "contrato_mandante" ? contractCoverage.get(inst.id) : null;

        const digitalStatus = accountContract
          ? accountContract.status === "sin_documento"
            ? null
            : accountContract.status
          : doc
          ? calcDocStatus(doc.expiresAt, tipo.tieneVencimiento, tipo.diasAlerta)
          : null;

        // Hallazgos abiertos asociados a esta celda.
        // Nuevo modelo: un único finding canónico por (installation, tipoDoc) con occurrenceCount.
        // Fallback legacy: match heurístico por nombre del tipo en description.
        type HallazgoCell = {
          id: string;
          severity: string;
          status: string;
          ticketCode: string | null;
          ticketId: string | null;
          description?: string;
          occurrenceCount?: number;
          firstDetectedAt?: string | null;
          lastDetectedAt?: string | null;
          ticketCreatedAt?: string | null;
        };
        let hallazgos: HallazgoCell[] = [];
        const canonical = findingsByTipo.get(`${tipo.id}|${inst.id}`);
        if (canonical) {
          hallazgos = [
            {
              id: canonical.id,
              severity: canonical.severity,
              status: canonical.status,
              ticketCode: canonical.ticket?.code ?? null,
              ticketId: canonical.ticket?.id ?? null,
              description: canonical.description,
              occurrenceCount: canonical.occurrenceCount,
              firstDetectedAt: canonical.firstDetectedAt?.toISOString() ?? null,
              lastDetectedAt: canonical.lastDetectedAt?.toISOString() ?? null,
              ticketCreatedAt: canonical.ticket?.createdAt?.toISOString() ?? null,
            },
          ];
        } else if (verif?.hallazgo && (verif.hallazgo.status === "open" || verif.hallazgo.status === "in_progress")) {
          hallazgos.push({
            id: verif.hallazgo.id,
            severity: verif.hallazgo.severity,
            status: verif.hallazgo.status,
            ticketCode: verif.hallazgo.ticket?.code ?? null,
            ticketId: verif.hallazgo.ticket?.id ?? null,
          });
        } else {
          const legacyFindings = findingsByInstLegacy.get(inst.id) ?? [];
          const matches = legacyFindings.filter((f) =>
            f.description.toLowerCase().includes(tipo.nombre.toLowerCase()),
          );
          hallazgos = matches.map((f) => ({
            id: f.id,
            severity: f.severity,
            status: f.status,
            ticketCode: f.ticket?.code ?? null,
            ticketId: f.ticket?.id ?? null,
            description: f.description,
            occurrenceCount: f.occurrenceCount,
            firstDetectedAt: f.firstDetectedAt?.toISOString() ?? null,
            lastDetectedAt: f.lastDetectedAt?.toISOString() ?? null,
            ticketCreatedAt: f.ticket?.createdAt?.toISOString() ?? null,
          }));
        }

        return {
          tipoDocId: tipo.id,
          digitalStatus,
          docId: accountContract?.contractId ?? doc?.id ?? null,
          fileName: accountContract?.title ?? doc?.fileName ?? null,
          fileUrl: accountContract?.pdfUrl ?? doc?.fileUrl ?? null,
          expiresAt: accountContract?.expiresAt?.toISOString() ?? doc?.expiresAt?.toISOString() ?? null,
          fisicaPresente: verif?.presente ?? null,
          ultimaVerificacion: verif?.createdAt?.toISOString() ?? null,
          supervisorName: verif?.supervisor?.name ?? null,
          hallazgosAbiertos: hallazgos.length,
          hallazgos,
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
