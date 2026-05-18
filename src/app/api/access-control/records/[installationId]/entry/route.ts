import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { cleanRut, validateRut } from "@/lib/access-control/utils";
import { isTableMissingError } from "@/lib/access-control/safe-query";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const body = await request.json();

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // Validate RUT if provided
    if (body.rut && !validateRut(body.rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    const cleaned = body.rut ? cleanRut(body.rut) : null;

    // ── Defense in depth: revalidar listas server-side ──
    // Las listas ahora se aplican por tipo de registro: solo se valida
    // la blacklist/whitelist si el recordType del request está incluido
    // en blacklistRecordTypes / whitelistRecordTypes del config. Si los
    // arrays están vacíos, fallback a los booleans legacy interpretados
    // como "aplica a los 5 defaults".
    if (cleaned) {
      const config = await prisma.accessControlConfig.findUnique({
        where: { installationId },
        select: {
          useWhitelist: true,
          useBlacklist: true,
          whitelistRecordTypes: true,
          blacklistRecordTypes: true,
        },
      });

      const DEFAULTS = ["visit", "provider", "vehicle", "staff", "delivery"];
      const blacklistTypes = (config?.blacklistRecordTypes ?? []).length > 0
        ? config!.blacklistRecordTypes
        : (config?.useBlacklist ? DEFAULTS : []);
      const whitelistTypes = (config?.whitelistRecordTypes ?? []).length > 0
        ? config!.whitelistRecordTypes
        : (config?.useWhitelist ? DEFAULTS : []);

      const recordType = String(body.recordType ?? "visit");

      if (blacklistTypes.includes(recordType)) {
        // Cross-tenant safety: queries con scope:"global" deben filtrar
        // por tenantId para no leakar entradas globales de otros tenants.
        const directCandidate = await prisma.accessControlList.findFirst({
          where: {
            rut: cleaned,
            listType: "blacklist",
            isActive: true,
            OR: [
              { installationId },
              { scope: "global", tenantId: installation.tenantId },
            ],
          },
          select: { id: true, blockReason: true, recordType: true, recordTypes: true },
        });

        const directMatchesType = (() => {
          if (!directCandidate) return false;
          const arr = directCandidate.recordTypes ?? [];
          if (arr.length > 0) return arr.includes(recordType);
          return (directCandidate.recordType ?? "visit") === recordType;
        })();

        const groupedCandidate = !directMatchesType
          ? await prisma.accessControlListGroupMember.findFirst({
              where: {
                listEntry: {
                  rut: cleaned,
                  tenantId: installation.tenantId,
                  listType: "blacklist",
                  isActive: true,
                },
                group: {
                  tenantId: installation.tenantId,
                  listType: "blacklist",
                  isActive: true,
                  installationLinks: { some: { installationId } },
                  // Group recordTypes: empty means "all", otherwise must include this recordType
                  OR: [
                    { recordTypes: { isEmpty: true } },
                    { recordTypes: { has: recordType } },
                  ],
                },
              },
              select: {
                group: { select: { id: true, name: true, recordTypes: true } },
                listEntry: {
                  select: { id: true, blockReason: true, recordType: true, recordTypes: true },
                },
              },
            })
          : null;

        // Para entries vía GRUPO, el grupo dicta los recordTypes (ya filtrado en
        // el query de groupedCandidate). El listEntry.recordTypes[] sólo aplica
        // como override per-persona si está poblado; vacío → hereda del grupo.
        // El campo legacy listEntry.recordType (default "visit") NO se usa
        // para gating en este branch.
        const groupedMatchesType = (() => {
          if (!groupedCandidate) return false;
          const arr = groupedCandidate.listEntry.recordTypes ?? [];
          if (arr.length > 0) return arr.includes(recordType);
          return true;
        })();

        const candidate = directMatchesType
          ? directCandidate
          : groupedMatchesType
            ? groupedCandidate?.listEntry
            : null;

        if (candidate) {
          if (body.entryGuardId) {
            await prisma.accessControlDeniedAttempt
              .create({
                data: {
                  tenantId: installation.tenantId,
                  installationId,
                  guardId: body.entryGuardId,
                  rut: cleaned,
                  fullName: body.fullName || null,
                  blacklistEntryId: candidate.id,
                  blockReason: candidate.blockReason || "blacklist_match",
                  gpsLat: body.gpsLat ?? null,
                  gpsLng: body.gpsLng ?? null,
                },
              })
              .catch((e) => {
                console.error("[AccessControl] denied attempt log failed:", e);
              });
          }
          return NextResponse.json(
            {
              success: false,
              error: "Persona en lista negra. Acceso denegado.",
              code: "BLACKLIST_MATCH",
            },
            { status: 403 }
          );
        }
      }

      if (whitelistTypes.includes(recordType)) {
        const directCandidate = await prisma.accessControlList.findFirst({
          where: {
            rut: cleaned,
            installationId,
            listType: "whitelist",
            isActive: true,
          },
          select: { id: true, recordType: true, recordTypes: true },
        });

        const directWhitelistMatches = (() => {
          if (!directCandidate) return false;
          const arr = directCandidate.recordTypes ?? [];
          if (arr.length > 0) return arr.includes(recordType);
          return (directCandidate.recordType ?? "visit") === recordType;
        })();

        const groupedCandidate = !directWhitelistMatches
          ? await prisma.accessControlListGroupMember.findFirst({
              where: {
                listEntry: {
                  rut: cleaned,
                  tenantId: installation.tenantId,
                  listType: "whitelist",
                  isActive: true,
                  OR: [{ singleUse: { not: true } }, { usedAt: null }],
                },
                group: {
                  tenantId: installation.tenantId,
                  listType: "whitelist",
                  isActive: true,
                  installationLinks: { some: { installationId } },
                  OR: [
                    { recordTypes: { isEmpty: true } },
                    { recordTypes: { has: recordType } },
                  ],
                },
              },
              select: {
                listEntry: { select: { id: true, recordType: true, recordTypes: true } },
              },
            })
          : null;

        // Ver comentario análogo en groupedMatchesType (blacklist).
        const groupedWhitelistMatches = (() => {
          if (!groupedCandidate) return false;
          const arr = groupedCandidate.listEntry.recordTypes ?? [];
          if (arr.length > 0) return arr.includes(recordType);
          return true;
        })();

        const candidate = directWhitelistMatches
          ? directCandidate
          : groupedWhitelistMatches
            ? groupedCandidate?.listEntry
            : null;
        const whitelistMatches = directWhitelistMatches || groupedWhitelistMatches;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const prereg = await prisma.accessControlPreregistration.findFirst({
          where: {
            visitorRut: cleaned,
            installationId,
            status: "pending",
            expectedDate: { gte: today, lt: tomorrow },
          },
          select: { id: true },
        });

        if (!(candidate && whitelistMatches) && !prereg) {
          if (body.entryGuardId) {
            await prisma.accessControlDeniedAttempt
              .create({
                data: {
                  tenantId: installation.tenantId,
                  installationId,
                  guardId: body.entryGuardId,
                  rut: cleaned,
                  fullName: body.fullName || null,
                  blockReason: "no_in_whitelist",
                  gpsLat: body.gpsLat ?? null,
                  gpsLng: body.gpsLng ?? null,
                },
              })
              .catch((e) => {
                console.error("[AccessControl] denied attempt log failed:", e);
              });
          }
          return NextResponse.json(
            {
              success: false,
              error: "Persona no autorizada (no está en lista blanca).",
              code: "NO_IN_WHITELIST",
            },
            { status: 403 }
          );
        }
      }
    }

    // Create the access record
    const record = await prisma.accessControlRecord.create({
      data: {
        tenantId: installation.tenantId,
        installationId,
        recordType: body.recordType,
        rut: cleaned,
        fullName: body.fullName || null,
        company: body.company || null,
        documentSerial: body.documentSerial || null,
        entryAt: body.offlineCreatedAt ? new Date(body.offlineCreatedAt) : new Date(),
        entryGuardId: body.entryGuardId,
        entryGpsLat: body.gpsLat ?? null,
        entryGpsLng: body.gpsLng ?? null,
        vehiclePlate: body.vehiclePlate || null,
        vehiclePlatePhotoUrl: body.vehiclePlatePhotoUrl || null,
        vehicleType: body.vehicleType || null,
        vehicleBrandModel: body.vehicleBrandModel || null,
        visitorPhotoUrl: body.visitorPhotoUrl || null,
        credentialPhotoUrl: body.credentialPhotoUrl || null,
        entrySignatureUrl: body.entrySignatureUrl || null,
        customFields: (body.customFields || {}) as Prisma.InputJsonValue,
        qrSource: body.qrSource || null,
        idValidationStatus: body.idValidationStatus || "not_checked",
        listMatch: body.listMatch || null,
        preregistrationId: body.preregistrationId || null,
        isSynced: !body.deviceId,
        deviceId: body.deviceId || null,
        offlineCreatedAt: body.offlineCreatedAt ? new Date(body.offlineCreatedAt) : null,
        entryObservations: body.observations || null,
      },
    });

    // Update known visitors cache
    if (cleaned && body.fullName) {
      await prisma.accessControlKnownVisitor.upsert({
        where: { rut: cleaned },
        update: {
          fullName: body.fullName,
          company: body.company || null,
          lastVisitAt: new Date(),
          visitCount: { increment: 1 },
          lastPhotoUrl: body.visitorPhotoUrl || undefined,
          metadata: (body.customFields || {}) as Prisma.InputJsonValue,
        },
        create: {
          tenantId: installation.tenantId,
          rut: cleaned,
          fullName: body.fullName,
          company: body.company || null,
          lastVisitAt: new Date(),
          visitCount: 1,
          lastPhotoUrl: body.visitorPhotoUrl || null,
          metadata: (body.customFields || {}) as Prisma.InputJsonValue,
        },
      });
    }

    // Update preregistration status if linked
    if (body.preregistrationId) {
      await prisma.accessControlPreregistration.update({
        where: { id: body.preregistrationId },
        data: { status: "checked_in" },
      });
    }

    // Si la entrada vino de un whitelist con uso único, marcar usedAt
    if (cleaned && body.listMatch === "whitelist") {
      await prisma.accessControlList
        .updateMany({
          where: {
            rut: cleaned,
            installationId,
            listType: "whitelist",
            isActive: true,
            singleUse: true,
            usedAt: null,
          },
          data: { usedAt: new Date(), isActive: false },
        })
        .catch((e) => {
          console.error("[AccessControl] singleUse update failed:", e);
        });
    }

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    if (isTableMissingError(error)) {
      return NextResponse.json(
        { success: false, error: "Las tablas de control de acceso aún no existen. Ejecute la migración." },
        { status: 503 }
      );
    }
    console.error("[AccessControl] Error creating entry record:", error);
    return NextResponse.json(
      { success: false, error: "Error al registrar entrada" },
      { status: 500 }
    );
  }
}
