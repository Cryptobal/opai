"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    async function setup() {
      // Unregister any old service workers (e.g., /rondas-sw.js) before registering
      // the unified sw.js, to prevent scope conflicts on existing installs.
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((r) => !r.active?.scriptURL.endsWith("/sw.js"))
          .map((r) => r.unregister())
      );

      // Use unified sw.js — scope '/' covers all portals
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
    }

    setup().catch((err) => console.warn("[SW] Setup failed:", err));
  }, []);

  return null;
}
