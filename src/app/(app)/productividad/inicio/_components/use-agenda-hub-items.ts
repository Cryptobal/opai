"use client";

import { useEffect, useState } from "react";
import { addDaysChile, startOfDayChile } from "@/lib/dates-cl";
import type { HubAgendaItem } from "@/components/agenda/agenda-hub-item";

export type UseAgendaHubItemsResult = {
  items: HubAgendaItem[];
  loading: boolean;
  expanded: boolean;
  setExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
};

/**
 * Carga compartida de `/api/agenda` para el hub de Productividad.
 * Mismo rango y manejo de error que el fetch embebido histórico de AgendaHubCard.
 */
export function useAgendaHubItems(): UseAgendaHubItemsResult {
  const [items, setItems] = useState<HubAgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const from = startOfDayChile(new Date());
    const to = addDaysChile(from, expanded ? 7 : 4);
    fetch(`/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setItems(j.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded]);

  return { items, loading, expanded, setExpanded };
}
