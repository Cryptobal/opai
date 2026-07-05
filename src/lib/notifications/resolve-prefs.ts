import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { type Audience, type UnifiedNotificationType } from "./catalog";
import { normalizePrefs, type ChannelPrefsLegacy } from "./channel-types";
import { applySlackTenantEmailDefault } from "./doc-expiry-channel-defaults";

export interface ResolvedPrefs {
  bell: boolean;
  email: boolean;
  /** True if either desktop or mobile push are enabled. Kept for backwards-compat. */
  push: boolean;
  pushDesktop: boolean;
  pushMobile: boolean;
  /** DM personal del bot en Slack (Fase 6; opt-in, default OFF). */
  slack: boolean;
  inQuietHours: boolean;
}

export interface ResolvePrefsParams {
  tenantId: string;
  type: UnifiedNotificationType;
  subscriberType: 'ADMIN' | 'GUARD' | 'CLIENT';
  subscriberId: string;
  audience: Audience;
  /** Si el tenant tiene workspace Slack activo (evita N queries en notify broadcast). */
  tenantSlackActive?: boolean;
  now?: Date;
}

interface SettingValue {
  pushGlobalConfig?: Record<string, { pushEnabled?: boolean }>;
}

interface UserPrefMap {
  [key: string]: ChannelPrefsLegacy;
}

export async function resolvePrefs(p: ResolvePrefsParams): Promise<ResolvedPrefs> {
  const { tenantId, type, subscriberType, subscriberId, audience, now = new Date() } = p;
  const catalogDefaults = type.defaults[audience] ?? {};
  let tenantSlackActive = p.tenantSlackActive;
  if (tenantSlackActive === undefined) {
    tenantSlackActive = !!(await getWorkspaceForTenant(tenantId));
  }
  const defaults = applySlackTenantEmailDefault(type.key, catalogDefaults, tenantSlackActive);

  // 1. Tenant-wide push override (Setting.pushGlobalConfig) — apaga ambos push
  let tenantPushDisabled = false;
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: `notification_preferences:${tenantId}` },
      select: { value: true },
    });
    if (setting?.value) {
      const parsed = JSON.parse(setting.value) as SettingValue;
      const tenantOverride = parsed.pushGlobalConfig?.[type.key];
      if (tenantOverride?.pushEnabled === false) tenantPushDisabled = true;
    }
  } catch {
    // ignore parse errors → fail open
  }

  // 2. User-level prefs (NotificationPreference unificada)
  const userPref = await prisma.notificationPreference.findUnique({
    where: { subscriberType_subscriberId: { subscriberType, subscriberId } },
  });
  const userPrefMap = (userPref?.preferences as UserPrefMap | null) ?? {};
  const userOverride = normalizePrefs(userPrefMap[type.key]);

  // Defaults del catálogo se expanden a 4 canales (push → pushDesktop=pushMobile)
  const bell = userOverride.bell ?? defaults.bell ?? false;
  const email = userOverride.email ?? defaults.email ?? false;
  let pushDesktop = userOverride.pushDesktop ?? defaults.push ?? false;
  let pushMobile = userOverride.pushMobile ?? defaults.push ?? false;
  // Slack personal: SIEMPRE opt-in — sin default de catálogo, arranca en false.
  let slack = userOverride.slack ?? false;

  if (tenantPushDisabled) {
    pushDesktop = false;
    pushMobile = false;
  }

  // 3. Quiet hours (per-user, in user TZ) — apaga ambos push si no es crítico
  let inQuietHours = false;
  if (
    userPref?.quietHoursStart != null &&
    userPref.quietHoursStart !== undefined &&
    userPref?.quietHoursEnd != null &&
    userPref.quietHoursEnd !== undefined
  ) {
    const tz = userPref.quietHoursTz ?? 'America/Santiago';
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
    const hourStr = fmt.formatToParts(now).find((part) => part.type === 'hour')?.value ?? '0';
    const hour = parseInt(hourStr, 10);
    const start = userPref.quietHoursStart;
    const end = userPref.quietHoursEnd;
    inQuietHours = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  }

  if (inQuietHours && !type.critical) {
    pushDesktop = false;
    pushMobile = false;
    slack = false; // el DM personal respeta No molestar igual que push
  }

  return {
    bell,
    email,
    push: pushDesktop || pushMobile,
    pushDesktop,
    pushMobile,
    slack,
    inQuietHours,
  };
}
