"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { SlackChannelPicker } from "./SlackChannelPicker";
import type { SlackChannelOption, SlackRoute } from "./types";

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
}: {
  label: string;
  sublabel?: string;
  matchType: "KEY" | "MODULE";
  matchValue: string;
  route?: SlackRoute;
  channels: SlackChannelOption[];
  onChanged: () => void;
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

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground truncate">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2 sm:w-[260px] sm:shrink-0">
        <div className="min-w-0 flex-1">
          <SlackChannelPicker
            channels={channels}
            value={route?.channelId ?? ""}
            onSelect={selectChannel}
            disabled={busy}
            placeholder={route ? `#${route.channelName}` : "Sin ruta"}
          />
        </div>
        {route && (
          <>
            <Switch checked={route.enabled} onCheckedChange={toggleEnabled} disabled={busy} aria-label="Activar regla" />
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
    </div>
  );
}
