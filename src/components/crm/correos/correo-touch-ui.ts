"use client";

import { useEffect, useState } from "react";

/** iPad / teléfono / pantalla táctil — habilita swipe, header con acciones y sheets. */
export function isCorreoTouchUi(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

export function useCorreoTouchUi(): boolean {
  const [touch, setTouch] = useState(isCorreoTouchUi);
  useEffect(() => {
    const apply = () => setTouch(isCorreoTouchUi());
    apply();
    const mq = window.matchMedia("(pointer: coarse)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return touch;
}
