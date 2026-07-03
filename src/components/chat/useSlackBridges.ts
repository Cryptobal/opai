"use client";

import { useCallback, useEffect, useState } from "react";

export interface SlackBridgeInfo {
  id: string;
  slackChannelId: string;
  slackChannelName: string;
  chatChannelId: string;
}

/**
 * Carga (una vez por montaje) el estado de los puentes Slack ↔ canal de chat.
 * Sólo hace fetch si `enabled` es true (viewer admin) — los endpoints
 * `config`/`bridges` exigen `requireSlackAdmin`, así que un no-admin ni los toca.
 *
 * Expone:
 *  - `connected`: hay workspace Slack ACTIVO en el tenant.
 *  - `bridgeByChatChannelId`: mapa canal de chat → puente, para pintar el estado
 *    sin un fetch por canal.
 *  - `refresh()`: recarga tras conectar/desconectar.
 */
export function useSlackBridges(enabled: boolean) {
  const [connected, setConnected] = useState(false);
  const [bridgeByChatChannelId, setBridgeByChatChannelId] = useState<
    Record<string, SlackBridgeInfo>
  >({});

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const [cfgRes, brRes] = await Promise.all([
        fetch("/api/integrations/slack/config"),
        fetch("/api/integrations/slack/bridges"),
      ]);
      const cfg = await cfgRes.json().catch(() => null);
      const isConnected = Boolean(cfg?.connected);
      setConnected(isConnected);

      if (isConnected && brRes.ok) {
        const br = await brRes.json().catch(() => null);
        const map: Record<string, SlackBridgeInfo> = {};
        for (const b of (br?.bridges ?? []) as SlackBridgeInfo[]) {
          if (b?.chatChannelId) map[b.chatChannelId] = b;
        }
        setBridgeByChatChannelId(map);
      } else {
        setBridgeByChatChannelId({});
      }
    } catch {
      // Silencioso: sin datos, la UI simplemente no muestra el ítem.
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { connected, bridgeByChatChannelId, refresh: load };
}
