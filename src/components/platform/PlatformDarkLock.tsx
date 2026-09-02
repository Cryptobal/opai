"use client";

import { useEffect } from "react";

/** Tailwind darkMode es class en <html>; el wrapper .dark no alcanza. */
export function PlatformDarkLock() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    return () => {
      const saved = localStorage.getItem("opai-theme");
      if (saved === "light") root.classList.remove("dark");
    };
  }, []);
  return null;
}
