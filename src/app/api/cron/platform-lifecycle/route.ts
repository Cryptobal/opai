/**
 * API Route: /api/cron/platform-lifecycle
 * GET — transiciones diarias de trial/gracia + recordatorios.
 *
 * Schedule: 0 9 * * * (06:00 CL en horario estándar UTC-3 en verano es 05:00).
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  applyTransition,
  deriveTenantAccess,
  isTransitionAllowed,
  normalizeBillingStatus,
} from "@/lib/platform/tenant-lifecycle";
import { getLifecycleSettings } from "@/lib/platform/settings";
import { hasPlatformAuditToday, logPlatformAction } from "@/lib/platform/audit";
import { sendTenantLifecycleEmail } from "@/lib/platform/lifecycle-emails";
import { notifyPlatform } from "@/lib/notifications/notify-platform";
import { buildEmailUrl } from "@/lib/emails/site-url";
import type { TenantLifecycleEmailKind } from "@/emails/TenantLifecycleEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function reminderAction(daysLeft: number): string {
  return `lifecycle.reminder.trial_expiring_${daysLeft}`;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getLifecycleSettings();
    if (!settings.enabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "lifecycle.enabled=false",
      });
    }

    const now = new Date();
    const tenants = await prisma.tenant.findMany({
      where: {
        plan: {
          is: {
            OR: [
              {
                billingStatus: {
                  in: ["trial", "trialing", "trial_expired", "past_due"],
                },
              },
              { trialEndsAt: { not: null } },
              { graceEndsAt: { not: null } },
            ],
          },
        },
      },
      include: {
        plan: true,
        admins: {
          where: { role: "owner", status: "active" },
          select: { email: true, name: true },
          take: 3,
        },
      },
    });

    let transitions = 0;
    let reminders = 0;
    let emails = 0;
    let emailErrors = 0;

    for (const tenant of tenants) {
      if (!tenant.plan) continue;
      if (settings.exemptSlugs.includes(tenant.slug)) continue;

      const access = deriveTenantAccess(
        {
          tenantId: tenant.id,
          slug: tenant.slug,
          active: tenant.active,
          suspendedAt: tenant.suspendedAt,
          plan: {
            billingStatus: tenant.plan.billingStatus,
            trialEndsAt: tenant.plan.trialEndsAt,
            graceEndsAt: tenant.plan.graceEndsAt,
            statusChangedAt: tenant.plan.statusChangedAt,
          },
        },
        now,
        settings,
      );

      const persisted = normalizeBillingStatus(tenant.plan.billingStatus);
      const derived = access.state;

      if (persisted && derived !== persisted && isTransitionAllowed(persisted, derived)) {
        try {
          await prisma.$transaction((tx) =>
            applyTransition(tx, {
              tenantId: tenant.id,
              to: derived,
              reason: `cron:${persisted}->${derived}`,
              actorType: "system",
              actorId: "lifecycle",
              actorEmail: "system:lifecycle",
              now,
            }),
          );
          transitions += 1;

          if (derived === "trial_expired") {
            await notifyAndEmail(tenant, "trial_expired", access.daysLeft, settings.emailsEnabled);
            emails += settings.emailsEnabled ? 1 : 0;
          } else if (derived === "suspended") {
            await notifyAndEmail(tenant, "tenant_suspended", access.daysLeft, settings.emailsEnabled);
            emails += settings.emailsEnabled ? 1 : 0;
          }
        } catch (error) {
          console.error("[CRON] platform-lifecycle transition failed", {
            tenantId: tenant.id,
            from: persisted,
            to: derived,
            error,
          });
        }
        continue;
      }

      if (
        derived === "trialing" &&
        access.daysLeft != null &&
        settings.trialReminderDays.includes(access.daysLeft)
      ) {
        const action = reminderAction(access.daysLeft);
        const already = await hasPlatformAuditToday({
          tenantId: tenant.id,
          action,
          now,
        });
        if (!already) {
          await logPlatformAction({
            actorType: "system",
            actorId: "lifecycle",
            actorEmail: "system:lifecycle",
            action,
            tenantId: tenant.id,
            targetType: "Tenant",
            targetId: tenant.id,
            after: { daysLeft: access.daysLeft },
          });
          reminders += 1;
          if (settings.emailsEnabled) {
            const sent = await notifyAndEmail(
              tenant,
              "trial_expiring",
              access.daysLeft,
              true,
            );
            if (sent.ok) emails += 1;
            else emailErrors += 1;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      scanned: tenants.length,
      transitions,
      reminders,
      emails,
      emailErrors,
      emailsEnabled: settings.emailsEnabled,
    });
  } catch (error) {
    console.error("[CRON] platform-lifecycle error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

async function notifyAndEmail(
  tenant: {
    id: string;
    name: string;
    slug: string;
    billingEmail: string | null;
    admins: { email: string; name: string }[];
  },
  kind: TenantLifecycleEmailKind,
  daysLeft: number | undefined,
  sendOwnerEmail: boolean,
): Promise<{ ok: boolean }> {
  const owner = tenant.admins[0];
  const ownerName = owner?.name ?? tenant.name;
  const recipients = [
    ...tenant.admins.map((a) => a.email),
    tenant.billingEmail ?? "",
  ].filter(Boolean);

  const platformEvent =
    kind === "trial_expiring"
      ? "trial_expiring"
      : kind === "trial_expired"
        ? "trial_expired"
        : "tenant_auto_suspended";

  await notifyPlatform({
    event: platformEvent,
    ownerEmail: owner?.email ?? tenant.billingEmail ?? "unknown@opai.cl",
    ownerName,
    commercialName: tenant.name,
    tenantSlug: tenant.slug,
    platformAdminUrl: buildEmailUrl(`/platform/tenants/${tenant.id}`),
    daysLeft: daysLeft ?? null,
  });

  if (!sendOwnerEmail) return { ok: true };

  const result = await sendTenantLifecycleEmail({
    to: recipients,
    kind,
    tenantName: tenant.name,
    ownerName,
    daysLeft,
  });

  if (!result.ok) {
    await logPlatformAction({
      actorType: "system",
      actorId: "lifecycle",
      actorEmail: "system:lifecycle",
      action: "lifecycle.email_failed",
      tenantId: tenant.id,
      targetType: "Tenant",
      targetId: tenant.id,
      after: { kind, error: result.error },
    });
  }

  return { ok: result.ok };
}
