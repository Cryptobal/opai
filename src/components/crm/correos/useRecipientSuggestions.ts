"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type RecipientSuggestion = {
  email: string;
  name: string | null;
  source: "crm" | "recent" | "mailbox";
  contactId?: string | null;
};

const CACHE_KEY = "opai-recipients-frequent-v1";
const DEBOUNCE_MS = 150;
const LIMIT = 8;

/** Flag de rollback (C21a): con NEXT_PUBLIC_EMAIL_RECIPIENTS_TYPEAHEAD=false
 * los campos vuelven al texto libre (sin sugerencias ni fetches). */
function typeaheadEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EMAIL_RECIPIENTS_TYPEAHEAD !== "false";
}

function readCache(): RecipientSuggestion[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecipientSuggestion[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function localFilter(
  cache: RecipientSuggestion[],
  q: string,
): RecipientSuggestion[] {
  if (!q) return cache.slice(0, LIMIT);
  const query = q.toLowerCase();
  return cache
    .filter(
      (s) =>
        s.email.toLowerCase().includes(query) ||
        (s.name ?? "").toLowerCase().includes(query),
    )
    .slice(0, LIMIT);
}

/**
 * Sugerencias de destinatarios (C21a) con latencia percibida < 150 ms: al
 * montar precarga los ~20 frecuentes del usuario (memoria + localStorage) y
 * filtra localmente mientras llega el merge CRM+frecency del servidor
 * (debounce 150 ms). El resultado del servidor reemplaza al filtro local.
 */
export function useRecipientSuggestions(query: string): {
  suggestions: RecipientSuggestion[];
  loading: boolean;
} {
  const [cache, setCache] = useState<RecipientSuggestion[]>([]);
  const [server, setServer] = useState<RecipientSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  // Precarga del caché local + refresco de frecuentes desde el servidor.
  useEffect(() => {
    if (!typeaheadEnabled()) return;
    setCache(readCache());
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/crm/correos/recipients?q=&limit=20");
        if (!res.ok || !alive) return;
        const data = await res.json();
        const items: RecipientSuggestion[] = data.items ?? [];
        setCache(items);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(items));
        } catch {
          /* storage lleno o bloqueado: seguimos solo en memoria */
        }
      } catch {
        /* offline: el caché local sigue sirviendo */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Merge del servidor con debounce; se descartan respuestas fuera de orden.
  useEffect(() => {
    const q = query.trim();
    setServer(null);
    if (!q || !typeaheadEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/crm/correos/recipients?q=${encodeURIComponent(q)}`,
          );
          if (!res.ok) return;
          const data = await res.json();
          if (requestSeq.current === seq) setServer(data.items ?? []);
        } catch {
          /* fallback: sugerencias locales */
        } finally {
          if (requestSeq.current === seq) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const suggestions = useMemo(
    () => server ?? localFilter(cache, query.trim()),
    [server, cache, query],
  );

  return { suggestions, loading };
}
