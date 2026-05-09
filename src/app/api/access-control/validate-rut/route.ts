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

    // Check whitelist (excluyendo entradas de uso único ya consumidas)
    const whitelistEntry = await safeAccessControlQuery(
      () => prisma.accessControlList.findFirst({
        where: {
          rut: cleaned,
          installationId,
          listType: "whitelist",
          isActive: true,
          // Excluir uso único ya consumido: válido si NO es uso único, o si lo es pero aún no se ha usado
          OR: [{ singleUse: { not: true } }, { usedAt: null }],
        },
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
