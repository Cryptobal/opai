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
  /** Si no se pasa, todas las secciones son colapsables */
  fixedSectionKey?: string | null;
  sectionKeys: string[];
  /** Secciones que empiezan contraídas por defecto. Si true, todas empiezan cerradas */
  defaultCollapsedSectionKeys?: string[] | true;
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

function getDefaultOrder(
  fixedSectionKey: string | null | undefined,
  sectionKeys: string[],
  _defaultCollapsedSectionKeys?: string[] | true
): string[] {
  const valid = unique(sectionKeys);
  if (fixedSectionKey) {
    const rest = valid.filter((key) => key !== fixedSectionKey);
    return [fixedSectionKey, ...rest];
  }
  return valid;
}

function getDefaultCollapsed(
  fixedSectionKey: string | null | undefined,
  sectionKeys: string[],
  defaultCollapsedSectionKeys?: string[] | true
): string[] {
  const valid = unique(sectionKeys);
  if (defaultCollapsedSectionKeys === true) {
    return valid;
  }
  if (Array.isArray(defaultCollapsedSectionKeys) && defaultCollapsedSectionKeys.length) {
    return defaultCollapsedSectionKeys.filter((key) => valid.includes(key));
  }
  // Default: all sections open (empty collapsed array)
  return [];
}

function sanitizePrefs(
  raw: SectionPrefs,
  fixedSectionKey: string | null | undefined,
  sectionKeys: string[],
  defaultCollapsedSectionKeys?: string[] | true
): SectionPrefs {
  const valid = new Set(sectionKeys);
  const defaultOrder = getDefaultOrder(fixedSectionKey, sectionKeys, defaultCollapsedSectionKeys);

  if (fixedSectionKey) {
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

  const filteredOrder = unique(raw.order).filter((key) => valid.has(key));
  const missing = defaultOrder.filter((key) => !filteredOrder.includes(key));
  const order = [...filteredOrder, ...missing];
  const collapsed = unique(raw.collapsed).filter((key) => valid.has(key));
  return { order, collapsed };
}

function cacheKey(pageType: SectionPageType): string {
  return `ui_section_prefs_cache:${pageType}`;
}

function readCache(
  pageType: SectionPageType,
  fixedSectionKey: string | null | undefined,
  sectionKeys: string[],
  defaultCollapsedSectionKeys?: string[] | true
): SectionPrefs {
  const fallback: SectionPrefs = {
    order: getDefaultOrder(fixedSectionKey, sectionKeys, defaultCollapsedSectionKeys),
    collapsed: getDefaultCollapsed(fixedSectionKey, sectionKeys, defaultCollapsedSectionKeys),
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(cacheKey(pageType));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PersistedSectionPrefs;
    const order = Array.isArray(parsed.order) ? parsed.order : [];
    const collapsed = Array.isArray(parsed.collapsed)
      ? parsed.collapsed
      : getDefaultCollapsed(fixedSectionKey, sectionKeys, defaultCollapsedSectionKeys);
    return sanitizePrefs(
      { order, collapsed },
      fixedSectionKey,
      sectionKeys,
      defaultCollapsedSectionKeys
    );
  } catch {
    return fallback;
  }
}

export function useSectionPreferences({
  pageType,
  fixedSectionKey,
  sectionKeys,
  defaultCollapsedSectionKeys,
}: UseSectionPreferencesParams): UseSectionPreferencesResult {
  const stableKeys = useMemo(() => unique(sectionKeys), [sectionKeys]);
  const defaultPrefs = useMemo(
    () => ({
      order: getDefaultOrder(fixedSectionKey, stableKeys, defaultCollapsedSectionKeys),
      collapsed: getDefaultCollapsed(fixedSectionKey, stableKeys, defaultCollapsedSectionKeys),
    }),
    [fixedSectionKey, stableKeys, defaultCollapsedSectionKeys]
  );

  // Inicializar siempre con orden por defecto para que servidor y cliente coincidan (evitar hydration mismatch).
  const [prefs, setPrefs] = useState<SectionPrefs>(() => ({
    order: getDefaultOrder(fixedSectionKey, stableKeys, defaultCollapsedSectionKeys),
    collapsed: getDefaultCollapsed(fixedSectionKey, stableKeys, defaultCollapsedSectionKeys),
  }));
  const [loading, setLoading] = useState(true);

  const didLoadServerRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeSetPrefs = useCallback(
    (next: SectionPrefs) => {
      const sanitized = sanitizePrefs(next, fixedSectionKey, stableKeys, defaultCollapsedSectionKeys);
      setPrefs(sanitized);
    },
    [fixedSectionKey, stableKeys, defaultCollapsedSectionKeys]
  );

  // Sincronizar orden y collapsed desde cache al cambiar tipo de página o claves
  useEffect(() => {
    const cached = readCache(pageType, fixedSectionKey, stableKeys, defaultCollapsedSectionKeys);
    setPrefs(
      sanitizePrefs(
        { order: cached.order, collapsed: cached.collapsed },
        fixedSectionKey,
        stableKeys,
        defaultCollapsedSectionKeys
      )
    );
  }, [pageType, fixedSectionKey, stableKeys, defaultCollapsedSectionKeys]);

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
              stableKeys,
              defaultCollapsedSectionKeys
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
  }, [pageType, defaultPrefs, safeSetPrefs, defaultCollapsedSectionKeys]);

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
          collapsed: prefs.collapsed,
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
      if (fixedSectionKey && key === fixedSectionKey) return;
      setPrefs((prev) => {
        const collapsed = new Set(prev.collapsed);
        if (collapsed.has(key)) collapsed.delete(key);
        else collapsed.add(key);
        return sanitizePrefs(
          { order: prev.order, collapsed: Array.from(collapsed) },
          fixedSectionKey,
          stableKeys,
          defaultCollapsedSectionKeys
        );
      });
    },
    [fixedSectionKey, stableKeys, defaultCollapsedSectionKeys]
  );

  const openSection = useCallback(
    (key: string) => {
      if (fixedSectionKey && key === fixedSectionKey) return;
      setPrefs((prev) =>
        sanitizePrefs(
          {
            order: prev.order,
            collapsed: prev.collapsed.filter((it) => it !== key),
          },
          fixedSectionKey,
          stableKeys,
          defaultCollapsedSectionKeys
        )
      );
    },
    [fixedSectionKey, stableKeys, defaultCollapsedSectionKeys]
  );

  const closeSection = useCallback(
    (key: string) => {
      if (fixedSectionKey && key === fixedSectionKey) return;
      setPrefs((prev) =>
        sanitizePrefs(
          {
            order: prev.order,
            collapsed: unique([...prev.collapsed, key]),
          },
          fixedSectionKey,
          stableKeys,
          defaultCollapsedSectionKeys
        )
      );
    },
    [fixedSectionKey, stableKeys, defaultCollapsedSectionKeys]
  );

  const reorderSections = useCallback(
    (nextKeys: string[]) => {
      setPrefs((prev) =>
        sanitizePrefs(
          {
            order: fixedSectionKey
              ? [fixedSectionKey, ...nextKeys.filter((key) => key !== fixedSectionKey)]
              : nextKeys,
            collapsed: prev.collapsed,
          },
          fixedSectionKey,
          stableKeys,
          defaultCollapsedSectionKeys
        )
      );
    },
    [fixedSectionKey, stableKeys, defaultCollapsedSectionKeys]
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
