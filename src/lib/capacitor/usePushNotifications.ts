"use client";

import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

export type PushUserType = "guardia" | "supervisor" | "cliente" | "admin";

export interface UsePushNotificationsOptions {
  userId: string;
  userType: PushUserType;
  /** Optional callback after the token is registered server-side. */
  onToken?: (token: string) => void;
}

/**
 * Registers for native Capacitor push and persists the FCM/APNs token via
 * `/api/push/register`. No-op on web. Never mount on Terreno (shared device).
 *
 * Body shape matches `src/app/api/push/register/route.ts`:
 * `{ token, platform, userId, userType, deviceInfo? }`.
 * `tenantId` is resolved server-side from the session — never sent.
 */
export function usePushNotifications(options: UsePushNotificationsOptions) {
  const { userId, userType, onToken } = options;
  const registered = useRef(false);

  const register = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || registered.current) return;
    if (!userId || !userType) return;

    const platform = Capacitor.getPlatform();
    if (platform !== "ios" && platform !== "android") return;

    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") return;

    await PushNotifications.register();

    PushNotifications.addListener("registration", (token) => {
      const value = token.value;
      void (async () => {
        try {
          const res = await fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: value,
              platform,
              userId,
              userType,
              deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            }),
          });
          if (!res.ok) {
            const truncated = value.length <= 12 ? value : `${value.slice(0, 12)}…`;
            console.error(
              `[PUSH] register failed status=${res.status} token=${truncated}`,
            );
            return;
          }
          onToken?.(value);
        } catch (err) {
          console.error("[PUSH] register request error:", err);
        }
      })();
    });

    PushNotifications.addListener("registrationError", (error) => {
      console.error("[PUSH] Registration error:", error);
    });

    registered.current = true;
  }, [userId, userType, onToken]);

  useEffect(() => {
    void register();
  }, [register]);

  return { register };
}
