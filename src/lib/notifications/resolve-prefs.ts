import { prisma } from "@/lib/prisma";
import { type Audience, type UnifiedNotificationType } from "./catalog";

export interface ResolvedPrefs {
  bell: boolean;
  email: boolean;
  push: boolean;
  inQuietHours: boolean;
}

export interface ResolvePrefsParams {
  tenantId: string;
  type: UnifiedNotificationType;
  subscriberType: 'ADMIN' | 'GUARD' | 'CLIENT';
  subscriberId: string;
  audience: Audience;
  now?: Date;
}

interface SettingValue {
  pushGlobalConfig?: Record<string, { pushEnabled?: boolean }>;
}

interface UserPrefMap {
  [key: string]: { bell?: boolean; email?: boolean; push?: boolean };
}

export async function resolvePrefs(p: ResolvePrefsParams): Promise<ResolvedPrefs> {
  const { tenantId, type, subscriberType, subscriberId, audience, now = new Date() } = p;
  const defaults = type.defaults[audience] ?? {};

  // 1. Tenant-wide push override (Setting.pushGlobalConfig)
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
  const userOverride = userPrefMap[type.key] ?? {};

  let bell = userOverride.bell ?? defaults.bell ?? false;
  let email = userOverride.email ?? defaults.email ?? false;
  let push = userOverride.push ?? defaults.push ?? false;
  if (tenantPushDisabled) push = false;

  // 3. Quiet hours (per-user, in user TZ)
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

  // Quiet hours bypass for critical types
  if (inQuietHours && !type.critical) {
    push = false; // bell + email still flow during quiet hours
  }

  return { bell, email, push, inQuietHours };
}
