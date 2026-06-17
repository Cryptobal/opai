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
const subscribers = new Set<(s: CpqCatalogsState) => void>();

function notify() {
  if (cache) subscribers.forEach((fn) => fn(cache as CpqCatalogsState));
}

function fetchCatalogs(): Promise<CpqCatalogsState> {
  return Promise.all([
    fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
    fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
    fetch("/api/cpq/roles?active=true").then((r) => r.json()),
  ]).then(([p, c, r]) => ({
    puestos: p.data || [],
    cargos: c.data || [],
    roles: r.data || [],
  }));
}

function loadCatalogs(): Promise<CpqCatalogsState> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchCatalogs()
      .then((next) => {
        cache = next;
        notify();
        return next;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Invalida el cache y recarga los catálogos, notificando a todos los hooks
 * montados (para que un puesto/cargo recién creado aparezca en todos los selects).
 */
export function refreshCpqCatalogs(): Promise<CpqCatalogsState> {
  cache = null;
  inflight = fetchCatalogs()
    .then((next) => {
      cache = next;
      notify();
      return next;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Catálogos CPQ compartidos (una sola carga por sesión de página, con refresco global). */
export function useCpqCatalogs(): CpqCatalogsState {
  const [data, setData] = useState<CpqCatalogsState | null>(cache);

  useEffect(() => {
    subscribers.add(setData);
    if (cache) setData(cache);
    else void loadCatalogs();
    return () => {
      subscribers.delete(setData);
    };
  }, []);

  return data ?? { puestos: [], cargos: [], roles: [] };
}
