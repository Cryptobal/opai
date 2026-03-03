"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/rondas-sw.js").catch((err) => {
        console.warn("[Rondas SW] Registration failed:", err);
      });
    }
  }, []);

  return null;
}
