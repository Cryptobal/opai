"use client";

import { Capacitor } from "@capacitor/core";

export function usePlatform() {
  const platform = Capacitor.getPlatform(); // 'web' | 'ios' | 'android'
  const isNative = Capacitor.isNativePlatform();

  return {
    platform,
    isNative,
    isIOS: platform === "ios",
    isAndroid: platform === "android",
    isWeb: platform === "web",
  };
}
