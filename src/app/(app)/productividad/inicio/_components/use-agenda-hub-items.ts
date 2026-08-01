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
    let silentTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    const from = startOfDayChile(new Date());
    const to = addDaysChile(from, expanded ? 7 : 4);
    const url = `/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`;

    const apply = (j: { items?: HubAgendaItem[] }) => {
      if (!cancelled) setItems(j.items ?? []);
    };

    fetch(url)
      .then((r) => r.json())
      .then(apply)
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        // Si Google llegó tarde al cache del server, refrescar sin spinner.
        silentTimer = setTimeout(() => {
          fetch(url)
            .then((r) => r.json())
            .then(apply)
            .catch(() => {});
        }, 3_000);
      });
    return () => {
      cancelled = true;
      if (silentTimer) clearTimeout(silentTimer);
    };
  }, [expanded]);

  return { items, loading, expanded, setExpanded };
}
