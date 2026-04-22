"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "portal_cliente_selected_installation";
const URL_PARAM = "instalacion";

export type InstallationOption = {
  id: string;
  name: string;
};

type Ctx = {
  /** Id de la instalación activa. Nunca null si hay instalaciones disponibles. */
  installationId: string;
  /** Metadata de la instalación activa. */
  installation: InstallationOption | null;
  /** Listado completo de instalaciones accesibles por este cliente. */
  installations: InstallationOption[];
  /** Cambia la instalación activa. Persiste en localStorage y en el query param `?instalacion=<id>`. */
  setInstallationId: (id: string) => void;
  /** Indica si hay más de una instalación (y por tanto el selector debe ser editable). */
  hasMultiple: boolean;
};

const SelectedInstallationContext = createContext<Ctx | null>(null);

/**
 * Lee el id inicial en este orden:
 * 1. `?instalacion=<id>` en la URL (para links compartibles).
 * 2. `localStorage[portal_cliente_selected_installation]` (persistencia entre sesiones).
 * 3. Primera instalación de la lista.
 *
 * SIEMPRE valida que el id esté en la lista de instalaciones autorizadas.
 */
function resolveInitialId(installations: InstallationOption[]): string {
  if (installations.length === 0) return "";
  const validIds = new Set(installations.map((i) => i.id));

  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get(URL_PARAM);
      if (fromUrl && validIds.has(fromUrl)) return fromUrl;
    } catch {
      // SSR/edge cases
    }
    try {
      const fromStorage = window.localStorage.getItem(STORAGE_KEY);
      if (fromStorage && validIds.has(fromStorage)) return fromStorage;
    } catch {
      // localStorage might be blocked
    }
  }

  return installations[0]?.id ?? "";
}

export function SelectedInstallationProvider({
  installations,
  children,
}: {
  installations: InstallationOption[];
  children: React.ReactNode;
}) {
  const [installationId, setInstallationIdState] = useState<string>(() =>
    resolveInitialId(installations),
  );

  // Si la lista de instalaciones cambia (p. ej. al cambiar de sesión o al refrescar
  // instalaciones desde el servidor) y la actual ya no está, caemos a la primera.
  useEffect(() => {
    if (installations.length === 0) {
      if (installationId !== "") setInstallationIdState("");
      return;
    }
    const validIds = new Set(installations.map((i) => i.id));
    if (!validIds.has(installationId)) {
      setInstallationIdState(resolveInitialId(installations));
    }
  }, [installations, installationId]);

  const setInstallationId = useCallback(
    (id: string) => {
      const exists = installations.some((i) => i.id === id);
      if (!exists) return;
      setInstallationIdState(id);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, id);
        } catch {
          // localStorage might be blocked
        }
        try {
          const url = new URL(window.location.href);
          url.searchParams.set(URL_PARAM, id);
          window.history.replaceState(null, "", url.toString());
        } catch {
          // older browsers
        }
      }
    },
    [installations],
  );

  const installation = useMemo(
    () => installations.find((i) => i.id === installationId) ?? null,
    [installations, installationId],
  );

  const value = useMemo<Ctx>(
    () => ({
      installationId,
      installation,
      installations,
      setInstallationId,
      hasMultiple: installations.length > 1,
    }),
    [installationId, installation, installations, setInstallationId],
  );

  return (
    <SelectedInstallationContext.Provider value={value}>
      {children}
    </SelectedInstallationContext.Provider>
  );
}

export function useSelectedInstallation(): Ctx {
  const ctx = useContext(SelectedInstallationContext);
  if (!ctx) {
    throw new Error(
      "useSelectedInstallation debe usarse dentro de <SelectedInstallationProvider>",
    );
  }
  return ctx;
}

/**
 * Exportado solo para tests. No usar en código de producción.
 */
export const __INTERNAL_FOR_TESTS = {
  STORAGE_KEY,
  URL_PARAM,
  resolveInitialId,
};
