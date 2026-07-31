"use client";

import { useEffect, useState } from "react";
import type { AccountSuggestion } from "./CorreoAccountSuggestionChips";

/**
 * Caché por `threadId`: la cadena de contexto y el Copiloto piden las
 * mismas cuentas sugeridas. Con este caché — resultado + petición en vuelo —
 * ambos consumidores comparten UNA sola petición a
 * `/api/crm/correos/{id}/suggest-account` (regla: no aumentar peticiones por
 * apertura de hilo).
 */
const resultCache = new Map<string, AccountSuggestion[]>();
const inflight = new Map<string, Promise<AccountSuggestion[]>>();

function fetchSuggestions(threadId: string): Promise<AccountSuggestion[]> {
  const existing = inflight.get(threadId);
  if (existing) return existing;
  const p = fetch(`/api/crm/correos/${threadId}/suggest-account`)
    .then((r) => r.json())
    .then((d) => (Array.isArray(d.suggestions) ? (d.suggestions as AccountSuggestion[]) : []))
    .catch(() => [] as AccountSuggestion[])
    .then((res) => {
      resultCache.set(threadId, res);
      inflight.delete(threadId);
      return res;
    });
  inflight.set(threadId, p);
  return p;
}

/**
 * Cuentas sugeridas para un hilo sin cuenta. `enabled=false` (hilo ya asociado)
 * no dispara petición y devuelve lista vacía.
 */
export function useCorreoSuggestedAccounts(
  threadId: string,
  enabled: boolean,
): AccountSuggestion[] {
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>(() =>
    enabled ? resultCache.get(threadId) ?? [] : [],
  );

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      return;
    }
    const cached = resultCache.get(threadId);
    if (cached) {
      setSuggestions(cached);
      return;
    }
    let alive = true;
    void fetchSuggestions(threadId).then((res) => {
      if (alive) setSuggestions(res);
    });
    return () => {
      alive = false;
    };
  }, [threadId, enabled]);

  return suggestions;
}
