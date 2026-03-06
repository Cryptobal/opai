import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateRut, cleanRut, isWithinSchedule, isWithinValidity } from "@/lib/access-control/utils";
import type { RutValidationResult } from "@/lib/access-control/types";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut, installationId } = body as { rut: string; installationId: string };

    if (!rut || !validateRut(rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    const cleaned = cleanRut(rut);

    // Check blacklist (local for this installation + global)
    const blacklistEntry = await safeAccessControlQuery(
      () => prisma.accessControlList.findFirst({
        where: {
          rut: cleaned,
          listType: "blacklist",
          isActive: true,
          OR: [{ installationId }, { scope: "global" }],
        },
      }),
      null,
    );

    if (blacklistEntry) {
      const result: RutValidationResult = {
        valid: true,
        listMatch: "blacklist",
        personData: {
          fullName: blacklistEntry.fullName,
          company: blacklistEntry.company || undefined,
          blockReason: blacklistEntry.blockReason || undefined,
          scope: blacklistEntry.scope as "local" | "global",
        },
        isFrequent: false,
      };
      return NextResponse.json({ success: true, data: result });
    }

    // Check whitelist
    const whitelistEntry = await safeAccessControlQuery(
      () => prisma.accessControlList.findFirst({
        where: { rut: cleaned, installationId, listType: "whitelist", isActive: true },
      }),
      null,
    );

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

    // Check pre-registration for today
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
          expectedDate: { gte: today, lt: tomorrow },
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
