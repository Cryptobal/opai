import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { render } from "@react-email/render";
import NotificationEmail from "@/emails/NotificationEmail";
import { resolvePermissions } from "@/lib/permissions-server";
import { hasModuleAccess, canView, type ModuleKey } from "@/lib/permissions";
import { getUnifiedType, type Audience, type UnifiedNotificationType } from "./catalog";
import { resolvePrefs } from "./resolve-prefs";
import { sendPushToSubscriptions } from "./push-sender";

type SubType = 'ADMIN' | 'GUARD' | 'CLIENT';

export interface NotifyParams {
  tenantId: string;
  /** Canonical key OR alias — auto-resolved against the catalog. */
  type: string;
  /** Override audience if the type supports multiple. Defaults to the first declared. */
  audience?: Audience;
  /** Targeted mode: deliver only to these subscriber IDs. */
  targetIds?: string[];
  /** Required when targetIds is set; defaults to the audience's natural subscriber type. */
  targetType?: SubType;
  title: string;
  body?: string;
  /** Email-specific override; falls back to body. */
  emailBody?: string;
  link?: string;
  data?: Record<string, unknown>;
  emailSecondaryAction?: { url: string; label: string; color?: string };
  /** Channel overrides for legitimate edge cases (e.g. force-bell on a usually-silent type). */
  forceChannels?: { bell?: boolean; email?: boolean; push?: boolean };
}

interface Recipient {
  id: string;
  email?: string | null;
}

const audienceToSubType = (a: Audience): SubType =>
  a === 'admin' ? 'ADMIN' : a === 'guardia' ? 'GUARD' : 'CLIENT';

export async function notify(params: NotifyParams): Promise<{ delivered: number }> {
  const typeDef = getUnifiedType(params.type);
  if (!typeDef) {
    console.error(`[notify] Unknown notification type: ${params.type}`);
    return { delivered: 0 };
  }

  const audience: Audience = params.audience ?? typeDef.audiences[0];
  const subType: SubType = params.targetType ?? audienceToSubType(audience);

  const recipients = params.targetIds && params.targetIds.length > 0
    ? await fetchRecipientsByIds(params.tenantId, subType, params.targetIds)
    : await fetchAudienceRecipients(params.tenantId, subType, typeDef);
  if (recipients.length === 0) return { delivered: 0 };

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { slug: true },
  });
  const tenantSlug = tenant?.slug ?? null;

  let bellCreatedForBroadcast = false;
  let delivered = 0;

  for (const r of recipients) {
    const prefs = await resolvePrefs({
      tenantId: params.tenantId,
      type: typeDef,
      subscriberType: subType,
      subscriberId: r.id,
      audience,
    });
    const eff = {
      bell: params.forceChannels?.bell ?? prefs.bell,
      email: params.forceChannels?.email ?? prefs.email,
      push: params.forceChannels?.push ?? (prefs.pushDesktop || prefs.pushMobile),
      pushDesktop: params.forceChannels?.push ?? prefs.pushDesktop,
      pushMobile: params.forceChannels?.push ?? prefs.pushMobile,
    };

    // Bell: only admins (portal users have no bell). Targeted vs broadcast:
    // - targeted (specific IDs) → one row per admin with data.targetUserId
    // - broadcast (audience-wide) → one shared row visible to everyone with permission
    if (eff.bell && subType === 'ADMIN') {
      const isTargeted = !!params.targetIds && params.targetIds.length > 0;
      if (isTargeted) {
        await prisma.notification.create({
          data: {
            tenantId: params.tenantId,
            type: typeDef.key,
            title: params.title,
            message: params.body ?? null,
            link: params.link ?? null,
            data: { ...(params.data ?? {}), targetUserId: r.id } as object,
          },
        });
      } else if (!bellCreatedForBroadcast) {
        await prisma.notification.create({
          data: {
            tenantId: params.tenantId,
            type: typeDef.key,
            title: params.title,
            message: params.body ?? null,
            link: params.link ?? null,
            data: (params.data ?? {}) as object,
          },
        });
        bellCreatedForBroadcast = true;
      }
    }

    // Email
    if (eff.email && r.email) {
      try {
        const cfg = await getTenantEmailConfig(params.tenantId);
        const html = await render(
          NotificationEmail({
            title: params.title,
            message: params.emailBody ?? params.body,
            actionUrl: params.link,
            actionLabel: params.link ? 'Ver en OPAI' : undefined,
            secondaryActionUrl: params.emailSecondaryAction?.url,
            secondaryActionLabel: params.emailSecondaryAction?.label,
            secondaryActionColor: params.emailSecondaryAction?.color,
            category: typeDef.category,
            notificationType: typeDef.key,
            tenantSlug,
          }),
        );
        await resend.emails.send({
          from: cfg.from,
          replyTo: cfg.replyTo,
          to: r.email,
          subject: params.title,
          html,
        });
      } catch (err) {
        console.error(`[notify] email error for ${r.id}:`, err);
      }
    }

    // Push
    if (eff.pushDesktop || eff.pushMobile) {
      await sendPushToSubscriptions({
        tenantId: params.tenantId,
        subscriberType: subType,
        subscriberId: r.id,
        notifKey: typeDef.key,
        title: params.title,
        body: params.body ?? '',
        url: params.link,
        data: params.data,
        coalesce: typeDef.coalesce,
        channels: { desktop: eff.pushDesktop, mobile: eff.pushMobile },
      });
    }

    delivered++;
  }

  return { delivered };
}

// — Helpers —

async function fetchRecipientsByIds(
  tenantId: string,
  subType: SubType,
  ids: string[],
): Promise<Recipient[]> {
  if (subType === 'ADMIN') {
    const admins = await prisma.admin.findMany({
      where: { id: { in: ids }, tenantId, status: 'active' },
      select: { id: true, email: true },
    });
    return admins;
  }
  if (subType === 'GUARD') {
    const guards = await prisma.opsGuardia.findMany({
      where: { id: { in: ids }, tenantId },
      include: { persona: { select: { email: true } } },
    });
    return guards.map((g) => ({ id: g.id, email: g.persona.email }));
  }
  // CLIENT
  const contacts = await prisma.crmContact.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, email: true },
  });
  return contacts;
}

async function fetchAudienceRecipients(
  tenantId: string,
  subType: SubType,
  typeDef: UnifiedNotificationType,
): Promise<Recipient[]> {
  // Audience-wide broadcasts only fan-out for ADMIN here. Portal users (guardia/
  // cliente/rondas) only receive targeted notifications via callsites passing
  // explicit targetIds.
  if (subType !== 'ADMIN') return [];

  const admins = await prisma.admin.findMany({
    where: { tenantId, status: 'active' },
    select: { id: true, email: true, role: true, roleTemplateId: true },
  });

  const eligible: Recipient[] = [];
  // 'chat' module is not a real ModuleKey; broadcasts of that type aren't
  // expected (chat uses its own delivery), so we let it pass without filtering.
  if (typeDef.module === 'chat') {
    return admins.map((a) => ({ id: a.id, email: a.email }));
  }
  const moduleKey = typeDef.module as ModuleKey;
  for (const a of admins) {
    try {
      const perms = await resolvePermissions({
        role: a.role,
        roleTemplateId: a.roleTemplateId,
      });
      const ok = typeDef.submodule
        ? canView(perms, moduleKey, typeDef.submodule)
        : hasModuleAccess(perms, moduleKey);
      if (ok) eligible.push({ id: a.id, email: a.email });
    } catch {
      // If permission resolution fails, skip the admin — fail closed for safety.
    }
  }
  return eligible;
}
