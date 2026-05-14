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
 * ListValidationResult sin código duplicado. `personData` puede traer
 * la patente además de los campos comunes (fullName, company, ...).
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
    const { vehiclePlate, installationId } = body as { vehiclePlate: string; installationId: string };

    if (!vehiclePlate || !validateChileanPlate(vehiclePlate).valid) {
      return NextResponse.json(
        { success: false, error: "Patente inválida" },
        { status: 400 }
      );
    }

    const cleaned = cleanPlate(vehiclePlate);

    // Blacklist (local + global)
    const blacklistEntry = await safeAccessControlQuery(
      () => prisma.accessControlList.findFirst({
        where: {
          vehiclePlate: cleaned,
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

    // Whitelist (excluyendo single-use ya consumidos)
    const whitelistEntry = await safeAccessControlQuery(
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
