/**
 * POST /api/onboarding/start
 *
 * Crea un ClientOnboarding para un deal won y los OpsTicket asociados.
 * Notifica un digest por equipo (best-effort).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { onboardingStartSchema } from "@/lib/validations/onboarding";
import { startOnboardingForDeal } from "@/lib/onboarding/start-onboarding";

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, onboardingStartSchema);
    if (parsed.error) return parsed.error;

    let result;
    try {
      result = await startOnboardingForDeal(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        parsed.data,
      );
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "ALREADY_EXISTS") {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 409 },
        );
      }
      throw err;
    }

    // Digest notifications (best-effort, no bloquear).
    try {
      const { notifyOnboardingTeamDigests } = await import(
        "@/lib/onboarding/notify-digest"
      );
      await notifyOnboardingTeamDigests({
        tenantId: ctx.tenantId,
        onboardingId: result.onboardingId,
        ticketsByTeam: result.ticketsByTeam,
      });
    } catch (e) {
      console.error("[onboarding] digest notify failed:", e);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[onboarding] start failed:", error);
    const message = error instanceof Error ? error.message : "Failed to start onboarding";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
