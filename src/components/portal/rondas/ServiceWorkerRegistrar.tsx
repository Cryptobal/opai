"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Use unified sw.js — scope '/' covers all portals
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
    }
  }, []);

  return null;
}
