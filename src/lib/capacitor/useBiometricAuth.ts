"use client";

import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

export function useBiometricAuth() {
  const [available, setAvailable] = useState(false);

  const checkAvailability = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setAvailable(false);
      return false;
    }

    try {
      const { NativeBiometric } = await import("capacitor-native-biometric");
      const result = await NativeBiometric.isAvailable();
      setAvailable(result.isAvailable);
      return result.isAvailable;
    } catch {
      setAvailable(false);
      return false;
    }
  }, []);

  const authenticate = useCallback(async (reason = "Verificar identidad") => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
      const { NativeBiometric } = await import("capacitor-native-biometric");
      await NativeBiometric.verifyIdentity({ reason });
      return true;
    } catch {
      return false;
    }
  }, []);

  return { available, checkAvailability, authenticate };
}
