import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateRut, cleanRut, isWithinSchedule, isWithinValidity } from "@/lib/access-control/utils";
import type { RutValidationResult } from "@/lib/access-control/types";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`validate-rut:${ip}`, { limit: 20, windowSeconds: 60 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intente nuevamente en un momento." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const body = await request.json();
    const { rut, installationId, recordType } = body as {
      rut: string;
      installationId: string;
      recordType?: string;
    };

    if (!rut || !validateRut(rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    const cleaned = cleanRut(rut);
    const effectiveType = recordType || "visit";

    // Resolver el tenantId de la instalación para filtrar global scope.
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    // Cargar config para gating per-tipo de las listas.
    const listConfig = await safeAccessControlQuery(
      () => prisma.accessControlConfig.findUnique({
        where: { installationId },
        select: {
          useWhitelist: true,
          useBlacklist: true,
          whitelistRecordTypes: true,
          blacklistRecordTypes: true,
        },
      }),
      null,
    );
    const DEFAULTS = ["visit", "provider", "vehicle", "staff", "delivery"];
    const blacklistTypes = (listConfig?.blacklistRecordTypes ?? []).length > 0
      ? listConfig!.blacklistRecordTypes
      : (listConfig?.useBlacklist ? DEFAULTS : []);
    const whitelistTypes = (listConfig?.whitelistRecordTypes ?? []).length > 0
      ? listConfig!.whitelistRecordTypes
      : (listConfig?.useWhitelist ? DEFAULTS : []);

    // Check blacklist solo si este tipo aplica.
    const blacklistEntry = blacklistTypes.includes(effectiveType)
      ? await safeAccessControlQuery(
          () => prisma.accessControlList.findFirst({
            where: {
              rut: cleaned,
              listType: "blacklist",
              isActive: true,
              OR: [
                { installationId },
                ...(installation
                  ? [{ scope: "global", tenantId: installation.tenantId } as const]
                  : []),
              ],
            },
          }),
          null,
        )
      : null;

    const blacklistMatchesType = blacklistEntry
      ? ((blacklistEntry.recordTypes ?? []).length > 0
          ? (blacklistEntry.recordTypes ?? []).includes(effectiveType)
          : (blacklistEntry.recordType ?? "visit") === effectiveType)
      : false;

    if (blacklistEntry && blacklistMatchesType) {
      const result: RutValidationResult = {
        valid: true,
        listMatch: "blacklist",
        personData: {
          id: blacklistEntry.id,
          fullName: blacklistEntry.fullName,
          company: blacklistEntry.company || undefined,
          blockReason: blacklistEntry.blockReason || undefined,
          scope: blacklistEntry.scope as "local" | "global",
        },
        isFrequent: false,
      };
      return NextResponse.json({ success: true, data: result });
    }

    // Check whitelist solo si este tipo aplica.
    const whitelistEntryRaw = whitelistTypes.includes(effectiveType)
      ? await safeAccessControlQuery(
          () => prisma.accessControlList.findFirst({
            where: {
              rut: cleaned,
              installationId,
              listType: "whitelist",
              isActive: true,
              OR: [{ singleUse: { not: true } }, { usedAt: null }],
            },
          }),
          null,
        )
      : null;

    const whitelistMatchesType = whitelistEntryRaw
      ? ((whitelistEntryRaw.recordTypes ?? []).length > 0
          ? (whitelistEntryRaw.recordTypes ?? []).includes(effectiveType)
          : (whitelistEntryRaw.recordType ?? "visit") === effectiveType)
      : false;

    const whitelistEntry = whitelistEntryRaw && whitelistMatchesType ? whitelistEntryRaw : null;

    if (whitelistEntry) {
      const withinSchedule = isWithinSchedule(
        whitelistEntry.allowedDays,
        whitelistEntry.allowedTimeFrom,
        whitelistEntry.allowedTimeTo,
      );
      const withinValidity = isWithinValidity(
        whitelistEntry.validFrom,
        whitelistEntry.validUntil,
      );

      const result: RutValidationResult = {
        valid: true,
        listMatch: "whitelist",
        personData: {
          id: whitelistEntry.id,
          fullName: whitelistEntry.fullName,
          company: whitelistEntry.company || undefined,
          validFrom: whitelistEntry.validFrom?.toISOString() || null,
          validUntil: whitelistEntry.validUntil?.toISOString() || null,
          allowedDays: whitelistEntry.allowedDays,
          allowedTimeFrom: whitelistEntry.allowedTimeFrom,
          allowedTimeTo: whitelistEntry.allowedTimeTo,
          isWithinSchedule: withinSchedule,
          isWithinValidity: withinValidity,
        },
        isFrequent: false,
      };
      return NextResponse.json({ success: true, data: result });
    }

    // Check known visitors (frequent)
    const knownVisitor = await safeAccessControlQuery(
      () => prisma.accessControlKnownVisitor.findUnique({ where: { rut: cleaned } }),
      null,
    );

    // Check pre-registration: hoy o dentro de un rango (multi-día)
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const preregistration = await safeAccessControlQuery(
      () => prisma.accessControlPreregistration.findFirst({
        where: {
          visitorRut: cleaned,
          installationId,
          status: "pending",
          OR: [
            // Rango multi-día: expectedDate <= now <= expectedEndDate
            { expectedDate: { lte: now }, expectedEndDate: { gte: today } },
            // Single-day: hoy y sin endDate
            { expectedDate: { gte: today, lt: tomorrow }, expectedEndDate: null },
          ],
        },
      }),
      null,
    );

    const result: RutValidationResult = {
      valid: true,
      listMatch: null,
      personData: null,
      isFrequent: !!knownVisitor,
      frequentData: knownVisitor
        ? {
            fullName: knownVisitor.fullName,
            company: knownVisitor.company,
            lastVisitAt: knownVisitor.lastVisitAt?.toISOString() || null,
            visitCount: knownVisitor.visitCount,
          }
        : undefined,
      preregistration: preregistration
        ? {
            id: preregistration.id,
            visitorName: preregistration.visitorName,
            hostName: preregistration.hostName,
            purpose: preregistration.purpose,
            expectedDate: preregistration.expectedDate.toISOString(),
          }
        : null,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[AccessControl] Error validating RUT:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar RUT" },
      { status: 500 }
    );
  }
}
