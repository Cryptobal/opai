"use client";

import { useEffect } from "react";

/** La página pública de reporte es light; el root layout fuerza `dark`. */
export function ForceLightHtml() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    root.style.background = "#f4f6f3";
    return () => {
      if (hadDark) root.classList.add("dark");
      root.style.colorScheme = "";
      root.style.background = "";
    };
  }, []);
  return null;
}
