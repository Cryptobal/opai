"use client";

import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

export function usePushNotifications(onToken?: (token: string) => void) {
  const registered = useRef(false);

  const register = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || registered.current) return;

    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") return;

    await PushNotifications.register();

    PushNotifications.addListener("registration", (token) => {
      onToken?.(token.value);
    });

    PushNotifications.addListener("registrationError", (error) => {
      console.error("[PUSH] Registration error:", error);
    });

    registered.current = true;
  }, [onToken]);

  useEffect(() => {
    register();
  }, [register]);

  return { register };
}
