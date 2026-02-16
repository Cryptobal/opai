"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SectionPageType =
  | "account"
  | "contact"
  | "installation"
  | "deal"
  | "lead"
  | "guardia";

type SectionPrefs = {
  order: string[];
  collapsed: string[];
};

type PersistedSectionPrefs = {
  order?: string[];
  collapsed?: string[];
};

type UseSectionPreferencesParams = {
  pageType: SectionPageType;
  fixedSectionKey: string;
  sectionKeys: string[];
};

type UseSectionPreferencesResult = {
  orderedKeys: string[];
  collapsedKeys: Set<string>;
  loading: boolean;
  toggleSection: (key: string) => void;
  openSection: (key: string) => void;
  closeSection: (key: string) => void;
  reorderSections: (nextKeys: string[]) => void;
  resetToDefault: () => void;
};

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

function getDefaultOrder(fixedSectionKey: string, sectionKeys: string[]): string[] {
  const valid = unique(sectionKeys);
  const rest = valid.filter((key) => key !== fixedSectionKey);
  return [fixedSectionKey, ...rest];
}

function getDefaultCollapsed(fixedSectionKey: string, sectionKeys: string[]): string[] {
  return unique(sectionKeys).filter((key) => key !== fixedSectionKey);
}

function sanitizePrefs(
  raw: SectionPrefs,
  fixedSectionKey: string,
  sectionKeys: string[]
): SectionPrefs {
  const valid = new Set(sectionKeys);
  const defaultOrder = getDefaultOrder(fixedSectionKey, sectionKeys);

  const filteredOrder = unique(raw.order).filter((key) => valid.has(key) && key !== fixedSectionKey);
  const missing = defaultOrder.filter(
    (key) => key !== fixedSectionKey && !filteredOrder.includes(key)
  );
  const order = [fixedSectionKey, ...filteredOrder, ...missing];

  const collapsed = unique(raw.collapsed).filter(
    (key) => valid.has(key) && key !== fixedSectionKey
  );

  return { order, collapsed };
}

function cacheKey(pageType: SectionPageType): string {
  return `ui_section_prefs_cache:${pageType}`;
}

function readCache(
  pageType: SectionPageType,
  fixedSectionKey: string,
  sectionKeys: string[]
): SectionPrefs {
  if (typeof window === "undefined") {
    return {
      order: getDefaultOrder(fixedSectionKey, sectionKeys),
      collapsed: getDefaultCollapsed(fixedSectionKey, sectionKeys),
    };
  }

  const fallback: SectionPrefs = {
    order: getDefaultOrder(fixedSectionKey, sectionKeys),
    collapsed: getDefaultCollapsed(fixedSectionKey, sectionKeys),
  };

  try {
    const raw = window.localStorage.getItem(cacheKey(pageType));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PersistedSectionPrefs;
    const order = Array.isArray(parsed.order) ? parsed.order : [];
    const collapsed = Array.isArray(parsed.collapsed)
      ? parsed.collapsed
      : getDefaultCollapsed(fixedSectionKey, sectionKeys);
    return sanitizePrefs(
      { order, collapsed },
      fixedSectionKey,
      sectionKeys
    );
  } catch {
    return fallback;
  }
}

export function useSectionPreferences({
  pageType,
  fixedSectionKey,
  sectionKeys,
}: UseSectionPreferencesParams): UseSectionPreferencesResult {
  const stableKeys = useMemo(() => unique(sectionKeys), [sectionKeys]);
  const defaultPrefs = useMemo(
    () => ({
      order: getDefaultOrder(fixedSectionKey, stableKeys),
      collapsed: getDefaultCollapsed(fixedSectionKey, stableKeys),
    }),
    [fixedSectionKey, stableKeys]
  );

  // Inicializar siempre con orden por defecto para que servidor y cliente coincidan (evitar hydration mismatch).
  // El orden guardado en localStorage se aplica en useEffect después del montaje.
  const [prefs, setPrefs] = useState<SectionPrefs>(() => ({
    order: getDefaultOrder(fixedSectionKey, stableKeys),
    collapsed: getDefaultCollapsed(fixedSectionKey, stableKeys),
  }));
  const [loading, setLoading] = useState(true);

  const didLoadServerRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeSetPrefs = useCallback(
    (next: SectionPrefs) => {
      const sanitized = sanitizePrefs(next, fixedSectionKey, stableKeys);
      setPrefs(sanitized);
    },
    [fixedSectionKey, stableKeys]
  );

  // Sincronizar orden desde cache al cambiar tipo de página o claves; preservar collapsed
  // para que las secciones no se cierren en cada re-render del padre.
  useEffect(() => {
    const cached = readCache(pageType, fixedSectionKey, stableKeys);
    setPrefs((prev) =>
      sanitizePrefs(
        { order: cached.order, collapsed: prev.collapsed },
        fixedSectionKey,
        stableKeys
      )
    );
  }, [pageType, fixedSectionKey, stableKeys]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/user/preferences?pageType=${encodeURIComponent(pageType)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          success?: boolean;
          data?: SectionPrefs;
        };
        if (cancelled) return;

        if (response.ok && payload.success && payload.data) {
          // Actualizar solo el orden desde el servidor; preservar estado abierto/cerrado local.
          setPrefs((prev) =>
            sanitizePrefs(
              {
                order: payload.data!.order ?? prev.order,
                collapsed: prev.collapsed,
              },
              fixedSectionKey,
              stableKeys
            )
          );
        } else {
          safeSetPrefs(defaultPrefs);
        }
      } catch {
        if (!cancelled) safeSetPrefs(defaultPrefs);
      } finally {
        if (!cancelled) {
          didLoadServerRef.current = true;
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageType, defaultPrefs, safeSetPrefs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const data: PersistedSectionPrefs = {
        order: prefs.order,
        collapsed: prefs.collapsed,
      };
      window.localStorage.setItem(cacheKey(pageType), JSON.stringify(data));
    } catch {
      // no-op
    }
  }, [prefs, pageType]);

  useEffect(() => {
    if (!didLoadServerRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageType,
          order: prefs.order,
          // No persistimos estado de colapso para forzar inicio contraído en cada ingreso.
          collapsed: [],
        }),
      }).catch(() => {
        // silent fail, the local cache still preserves UX
      });
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [pageType, prefs]);

  const toggleSection = useCallback(
    (key: string) => {
      if (key === fixedSectionKey) return;
      setPrefs((prev) => {
        const collapsed = new Set(prev.collapsed);
        if (collapsed.has(key)) collapsed.delete(key);
        else collapsed.add(key);
        return sanitizePrefs(
          { order: prev.order, collapsed: Array.from(collapsed) },
          fixedSectionKey,
          stableKeys
        );
      });
    },
    [fixedSectionKey, stableKeys]
  );

  const openSection = useCallback(
    (key: string) => {
      if (key === fixedSectionKey) return;
      setPrefs((prev) =>
        sanitizePrefs(
          {
            order: prev.order,
            collapsed: prev.collapsed.filter((it) => it !== key),
          },
          fixedSectionKey,
          stableKeys
        )
      );
    },
    [fixedSectionKey, stableKeys]
  );

  const closeSection = useCallback(
    (key: string) => {
      if (key === fixedSectionKey) return;
      setPrefs((prev) =>
        sanitizePrefs(
          {
            order: prev.order,
            collapsed: unique([...prev.collapsed, key]),
          },
          fixedSectionKey,
          stableKeys
        )
      );
    },
    [fixedSectionKey, stableKeys]
  );

  const reorderSections = useCallback(
    (nextKeys: string[]) => {
      setPrefs((prev) =>
        sanitizePrefs(
          {
            order: [fixedSectionKey, ...nextKeys.filter((key) => key !== fixedSectionKey)],
            collapsed: prev.collapsed,
          },
          fixedSectionKey,
          stableKeys
        )
      );
    },
    [fixedSectionKey, stableKeys]
  );

  const resetToDefault = useCallback(() => {
    safeSetPrefs(defaultPrefs);
  }, [defaultPrefs, safeSetPrefs]);

  return {
    orderedKeys: prefs.order,
    collapsedKeys: new Set(prefs.collapsed),
    loading,
    toggleSection,
    openSection,
    closeSection,
    reorderSections,
    resetToDefault,
  };
}
