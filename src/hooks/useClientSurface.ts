"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SURFACE,
  SURFACE_COOKIE,
  parseSurface,
  type Surface,
} from "@/lib/surface";

/** Lee la cookie de superficie en cliente (páginas con topbar propio). */
export function useClientSurface(): Surface {
  const [surface, setSurface] = useState<Surface>(DEFAULT_SURFACE);

  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${SURFACE_COOKIE}=`))
      ?.slice(SURFACE_COOKIE.length + 1);
    setSurface(parseSurface(raw ? decodeURIComponent(raw) : null));
  }, []);

  return surface;
}
