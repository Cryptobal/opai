"use client";

import { usePushNotifications, type PushUserType } from "./usePushNotifications";

/**
 * Mount-only helper that registers a native push token for the given identity.
 * No-op on web (hook checks Capacitor.isNativePlatform). Do NOT mount on Terreno.
 */
export function NativePushRegistrar({
  userId,
  userType,
}: {
  userId: string;
  userType: PushUserType;
}) {
  usePushNotifications({ userId, userType });
  return null;
}
