"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistrar({ scope }: { scope?: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Detect portal scope from URL if not provided
    const effectiveScope =
      scope ??
      window.location.pathname.match(/^(\/portal\/[^/]+)/)?.[1] ??
      "/";

    async function setup() {
      // Unregister any old service workers (e.g., /rondas-sw.js) before registering
      // the unified sw.js, to prevent scope conflicts on existing installs.
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((r) => !r.active?.scriptURL.endsWith("/sw.js"))
          .map((r) => r.unregister())
      );

      // Also unregister any sw.js with a mismatched scope (e.g. '/' on a portal page)
      await Promise.all(
        registrations
          .filter(
            (r) =>
              r.active?.scriptURL.endsWith("/sw.js") &&
              r.scope !== new URL(effectiveScope, window.location.origin).href
          )
          .map((r) => r.unregister())
      );

      navigator.serviceWorker
        .register("/sw.js", { scope: effectiveScope })
        .catch((err) => {
          console.warn("[SW] Registration failed:", err);
        });
    }

    setup().catch((err) => console.warn("[SW] Setup failed:", err));
  }, [scope]);

  return null;
}
