"use client";

import { useEffect, useState } from "react";
import type { CpqCargo, CpqPuestoTrabajo, CpqRol } from "@/types/cpq";

export type CpqCatalogsState = {
  puestos: CpqPuestoTrabajo[];
  cargos: CpqCargo[];
  roles: CpqRol[];
};

let cache: CpqCatalogsState | null = null;
let inflight: Promise<CpqCatalogsState> | null = null;

function loadCatalogs(): Promise<CpqCatalogsState> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = Promise.all([
      fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
      fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
      fetch("/api/cpq/roles?active=true").then((r) => r.json()),
    ])
      .then(([p, c, r]) => {
        const next: CpqCatalogsState = {
          puestos: p.data || [],
          cargos: c.data || [],
          roles: r.data || [],
        };
        cache = next;
        return next;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Catálogos CPQ compartidos (una sola carga por sesión de página). */
export function useCpqCatalogs(): CpqCatalogsState {
  const [data, setData] = useState<CpqCatalogsState | null>(cache);

  useEffect(() => {
    let cancelled = false;
    void loadCatalogs().then((next) => {
      if (!cancelled) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return data ?? { puestos: [], cargos: [], roles: [] };
}
