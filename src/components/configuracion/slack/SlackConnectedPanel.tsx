"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Send, Hash, X, ShieldOff } from "lucide-react";
import { SlackChannelPicker } from "./SlackChannelPicker";
import type { SlackChannelOption, SlackConfig } from "./types";

/** Panel del estado conectado: workspace, canal por defecto, prueba, desconectar. */
export function SlackConnectedPanel({
  config,
  channels,
  onChanged,
}: {
  config: SlackConfig;
  channels: SlackChannelOption[];
  onChanged: () => void;
}) {
  const [savingDefault, setSavingDefault] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [savingExclusions, setSavingExclusions] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/integrations/slack/governance")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.success) setExcludedIds(d.excludedChannelIds ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function saveExclusions(nextIds: string[]) {
    setSavingExclusions(true);
    try {
      const res = await fetch("/api/integrations/slack/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: nextIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setExcludedIds(data.excludedChannelIds ?? nextIds);
      toast.success("Canales excluidos actualizados");
    } catch {
      toast.error("No se pudo guardar la exclusión");
    } finally {
      setSavingExclusions(false);
    }
  }

  function addExclusion(channel: SlackChannelOption | null) {
    if (!channel || excludedIds.includes(channel.id)) return;
    void saveExclusions([...excludedIds, channel.id]);
  }
  function removeExclusion(id: string) {
    void saveExclusions(excludedIds.filter((x) => x !== id));
  }
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  async function joinAll() {
    setJoining(true);
    try {
      const res = await fetch("/api/integrations/slack/join-all", { method: "POST" });
      const data = await res.json();
      if (data.success) { toast.success(data.message ?? "OPAI se unió a los canales públicos"); onChanged(); }
      else toast.error(`Slack: ${data.error ?? "error"}`);
    } catch {
      toast.error("No se pudo unir a los canales");
    } finally {
      setJoining(false);
    }
  }

  async function setDefault(channel: SlackChannelOption | null) {
    if (!channel) return;
    setSavingDefault(true);
    try {
      const res = await fetch("/api/integrations/slack/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "default", channelId: channel.id, channelName: channel.name }),
      });
      if (!res.ok) throw new Error();
      toast.success("Canal por defecto actualizado");
      onChanged();
    } catch {
      toast.error("No se pudo guardar el canal por defecto");
    } finally {
      setSavingDefault(false);
    }
  }

  async function sendTest() {
    if (!config.defaultChannel) return;
    setTesting(true);
    try {
      const res = await fetch("/api/integrations/slack/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: config.defaultChannel.id }),
      });
      const data = await res.json();
      if (data.success) toast.success("Tarjeta de prueba enviada");
      else toast.error(`Slack: ${data.error ?? "error"}`);
    } catch {
      toast.error("No se pudo enviar la prueba");
    } finally {
      setTesting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/slack/config", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Slack desconectado");
      onChanged();
    } catch {
      toast.error("No se pudo desconectar");
    } finally {
      setDisconnecting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate">{config.teamName ?? "Workspace de Slack"}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Bot: {config.botUserId}</p>
        </div>
        <Badge variant="success">ACTIVE</Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Canal por defecto</label>
          <SlackChannelPicker
            channels={channels}
            value={config.defaultChannel?.id ?? ""}
            onSelect={setDefault}
            disabled={savingDefault}
            placeholder={config.defaultChannel ? `#${config.defaultChannel.name}` : "Elegir canal…"}
          />
          <p className="text-xs text-muted-foreground">
            Recibe las notificaciones sin regla específica de evento o módulo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={sendTest}
            disabled={testing || !config.defaultChannel}
          >
            <Send className="h-4 w-4 mr-1.5" />
            Enviar prueba
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={joinAll}
            disabled={joining}
            title="OPAI se une a todos los canales públicos. Los privados requieren /invite @OPAI."
          >
            <Hash className="h-4 w-4 mr-1.5" />
            {joining ? "Uniéndose…" : "Unirse a todos los canales públicos"}
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href="/api/integrations/slack/oauth/start" title="Vuelve a autorizar la app para otorgar permisos nuevos (no borra la configuración)">
              Re-autorizar
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            Desconectar
          </Button>
        </div>

        {/* Gobernanza (Fase 16): canales que OPAI NUNCA leerá ni usará de contexto. */}
        <div className="space-y-1.5 border-t border-border pt-4">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldOff className="h-3.5 w-3.5" /> Canales que OPAI no leerá
          </label>
          <SlackChannelPicker
            channels={channels.filter((c) => !excludedIds.includes(c.id))}
            value=""
            onSelect={addExclusion}
            disabled={savingExclusions}
            placeholder="Agregar canal a excluir…"
          />
          {excludedIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {excludedIds.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1">
                  #{channelName(id)}
                  <button type="button" onClick={() => removeExclusion(id)} disabled={savingExclusions} aria-label="Quitar" className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin exclusiones: OPAI puede leer cualquier canal donde sea miembro.</p>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Desconectar Slack"
        description="Se dejarán de enviar notificaciones a Slack. Podrás reconectar cuando quieras; el ruteo se conserva."
        confirmLabel="Desconectar"
        loadingLabel="Desconectando..."
        loading={disconnecting}
        onConfirm={disconnect}
      />
    </Card>
  );
}
