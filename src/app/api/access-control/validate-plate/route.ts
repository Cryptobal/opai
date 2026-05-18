import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  cleanPlate,
  validateChileanPlate,
  isWithinSchedule,
  isWithinValidity,
} from "@/lib/access-control/utils";
import type { RutValidationResult } from "@/lib/access-control/types";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Espejo de /validate-rut pero buscando match por patente. Reutiliza
 * el shape RutValidationResult para que el frontend muestre el mismo
 * ListValidationResult sin código duplicado. Aplica el mismo gating
 * per-recordType (whitelistRecordTypes / blacklistRecordTypes) que
 * /validate-rut para que la UX sea consistente: si el tipo no tiene
 * lista aplicada, no se reporta match aunque haya entradas en la BD.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`validate-plate:${ip}`, { limit: 20, windowSeconds: 60 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intente nuevamente en un momento." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const body = await request.json();
    const { vehiclePlate, installationId, recordType } = body as {
      vehiclePlate: string;
      installationId: string;
      recordType?: string;
    };

    if (!vehiclePlate || !validateChileanPlate(vehiclePlate).valid) {
      return NextResponse.json(
        { success: false, error: "Patente inválida" },
        { status: 400 }
      );
    }

    const cleaned = cleanPlate(vehiclePlate);
    const effectiveType = recordType || "visit";

    // Resolver tenant para filtrar scope global cross-tenant.
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    // Gating per-recordType usando config.
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

    // ── Blacklist: solo si este tipo aplica ──
    const directBlacklistEntry = blacklistTypes.includes(effectiveType)
      ? await safeAccessControlQuery(
          () => prisma.accessControlList.findFirst({
            where: {
              vehiclePlate: cleaned,
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

    const directBlacklistMatchesType = directBlacklistEntry
      ? ((directBlacklistEntry.recordTypes ?? []).length > 0
          ? (directBlacklistEntry.recordTypes ?? []).includes(effectiveType)
          : (directBlacklistEntry.recordType ?? "visit") === effectiveType)
      : false;

    const groupedBlacklistEntry = installation && blacklistTypes.includes(effectiveType) && !directBlacklistMatchesType
      ? await safeAccessControlQuery(
          () => prisma.accessControlListGroupMember.findFirst({
            where: {
              listEntry: {
                vehiclePlate: cleaned,
                tenantId: installation.tenantId,
                listType: "blacklist",
                isActive: true,
              },
              group: {
                tenantId: installation.tenantId,
                listType: "blacklist",
                isActive: true,
                installationLinks: { some: { installationId } },
                OR: [
                  { recordTypes: { isEmpty: true } },
                  { recordTypes: { has: effectiveType } },
                ],
              },
            },
            select: { listEntry: true },
          }),
          null,
        )
      : null;

    const groupedBlacklistMatchesType = groupedBlacklistEntry
      ? ((groupedBlacklistEntry.listEntry.recordTypes ?? []).length > 0
          ? (groupedBlacklistEntry.listEntry.recordTypes ?? []).includes(effectiveType)
          : (groupedBlacklistEntry.listEntry.recordType ?? "visit") === effectiveType)
      : false;

    const blacklistEntry = directBlacklistMatchesType
      ? directBlacklistEntry
      : groupedBlacklistMatchesType
        ? groupedBlacklistEntry?.listEntry
        : null;

    if (blacklistEntry) {
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

    // ── Whitelist: solo si este tipo aplica ──
    const directWhitelistEntryRaw = whitelistTypes.includes(effectiveType)
      ? await safeAccessControlQuery(
          () => prisma.accessControlList.findFirst({
            where: {
              vehiclePlate: cleaned,
              installationId,
              listType: "whitelist",
              isActive: true,
              OR: [{ singleUse: { not: true } }, { usedAt: null }],
            },
          }),
          null,
        )
      : null;

    const directWhitelistMatchesType = directWhitelistEntryRaw
      ? ((directWhitelistEntryRaw.recordTypes ?? []).length > 0
          ? (directWhitelistEntryRaw.recordTypes ?? []).includes(effectiveType)
          : (directWhitelistEntryRaw.recordType ?? "visit") === effectiveType)
      : false;

    const groupedWhitelistEntry = installation && whitelistTypes.includes(effectiveType) && !directWhitelistMatchesType
      ? await safeAccessControlQuery(
          () => prisma.accessControlListGroupMember.findFirst({
            where: {
              listEntry: {
                vehiclePlate: cleaned,
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
                  { recordTypes: { has: effectiveType } },
                ],
              },
            },
            select: { listEntry: true },
          }),
          null,
        )
      : null;

    const groupedWhitelistMatchesType = groupedWhitelistEntry
      ? ((groupedWhitelistEntry.listEntry.recordTypes ?? []).length > 0
          ? (groupedWhitelistEntry.listEntry.recordTypes ?? []).includes(effectiveType)
          : (groupedWhitelistEntry.listEntry.recordType ?? "visit") === effectiveType)
      : false;

    const whitelistEntry = directWhitelistMatchesType
      ? directWhitelistEntryRaw
      : groupedWhitelistMatchesType
        ? groupedWhitelistEntry?.listEntry
        : null;

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

    // Sin match
    const result: RutValidationResult = {
      valid: true,
      listMatch: null,
      personData: null,
      isFrequent: false,
    };
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[AccessControl] Error validating plate:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar patente" },
      { status: 500 }
    );
  }
}
