"use client";

/** Valor UF del día (CLP) para conversiones de display en el workspace. */

import { useEffect, useState } from "react";

export function useUfValue(): number | null {
  const [ufValue, setUfValue] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fx/uf")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const n = Number(d?.value);
        if (d?.success && Number.isFinite(n) && n > 0) setUfValue(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return ufValue;
}
