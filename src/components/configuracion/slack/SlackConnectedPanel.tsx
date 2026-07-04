"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Send, Hash } from "lucide-react";
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
