"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { SlackChannelPicker } from "./SlackChannelPicker";
import type { SlackChannelOption, SlackMatchType, SlackRoute } from "./types";

/**
 * Fila de ruteo reutilizable (por módulo o por evento). Mobile: se apila
 * verticalmente. La escritura va a /api/integrations/slack/routes.
 */
export function SlackRouteRow({
  label,
  sublabel,
  matchType,
  matchValue,
  route,
  channels,
  onChanged,
  emphasis,
}: {
  label: string;
  sublabel?: string;
  matchType: SlackMatchType;
  matchValue: string;
  route?: SlackRoute;
  channels: SlackChannelOption[];
  onChanged: () => void;
  emphasis?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/slack/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Error");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function selectChannel(channel: SlackChannelOption | null) {
    if (!channel) return;
    await post({
      kind: "route",
      matchType,
      matchValue,
      channelId: channel.id,
      channelName: channel.name,
      enabled: route?.enabled ?? true,
    });
  }

  async function toggleEnabled(enabled: boolean) {
    if (!route) return;
    await post({
      kind: "route",
      matchType,
      matchValue,
      channelId: route.channelId,
      channelName: route.channelName,
      enabled,
    });
  }

  async function remove() {
    if (!route) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/slack/routes?id=${route.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      onChanged();
    } catch {
      toast.error("No se pudo eliminar la regla");
    } finally {
      setBusy(false);
    }
  }

  async function muteWithoutChannel() {
    // Permite silenciar sin haber elegido canal antes: crea regla enabled=false
    // anclada al canal default (o un placeholder) para que el despacho no caiga
    // al fallthrough.
    const fallback =
      channels.find((c) => c.id === route?.channelId) ??
      channels[0];
    if (!fallback && !route) {
      toast.error("No hay canales disponibles para silenciar esta regla");
      return;
    }
    await post({
      kind: "route",
      matchType,
      matchValue,
      channelId: route?.channelId ?? fallback!.id,
      channelName: route?.channelName ?? fallback!.name,
      enabled: false,
    });
    toast.success("Silenciado en Slack");
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
        emphasis ? "border-border bg-muted/40" : "border-border/60 bg-card/40"
      }`}
    >
      <div className="min-w-0">
        <p className={`truncate ${emphasis ? "text-sm font-semibold uppercase tracking-wide" : "text-sm font-medium"}`}>{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground truncate">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2 sm:w-[320px] sm:shrink-0">
        <div className="min-w-0 flex-1">
          <SlackChannelPicker
            channels={channels}
            value={route?.channelId ?? ""}
            onSelect={selectChannel}
            disabled={busy}
            placeholder={route ? `#${route.channelName}` : "Sin ruta"}
          />
        </div>
        {!route && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 sm:h-9 shrink-0"
            onClick={() => void muteWithoutChannel()}
            disabled={busy}
          >
            Silenciar
          </Button>
        )}
        {route && (
          <>
            <Switch
              checked={route.enabled}
              onCheckedChange={toggleEnabled}
              disabled={busy}
              aria-label={route.enabled ? "Silenciar en Slack" : "Activar regla"}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={remove}
              disabled={busy}
              aria-label="Eliminar regla"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {route && !route.enabled && (
        <p className="text-xs text-status-warn-fg sm:w-full">
          Silenciado: este evento no se publica en Slack (ni en el canal por defecto).
        </p>
      )}
    </div>
  );
}
