"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slack } from "lucide-react";
import { SlackConnectedPanel } from "./SlackConnectedPanel";
import { SlackRoutingTable } from "./SlackRoutingTable";
import { SlackLinkedUsers } from "./SlackLinkedUsers";
import type { SlackChannelOption, SlackConfig } from "./types";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Cancelaste la autorización en Slack.",
  state: "La sesión de conexión no es válida. Intenta de nuevo.",
  expired: "El enlace de conexión expiró. Intenta de nuevo.",
  oauth: "Slack rechazó la conexión. Revisa la configuración de la app.",
  workspace_taken: "Este workspace ya está conectado a otra organización.",
  config: "Falta configurar SLACK_CLIENT_ID en el servidor.",
};

export function SlackConfigClient() {
  const [config, setConfig] = useState<SlackConfig | null>(null);
  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/slack/config");
      const data = (await res.json()) as SlackConfig & { success: boolean };
      setConfig(data);
      if (data.connected) {
        const chRes = await fetch("/api/integrations/slack/channels");
        const chData = await chRes.json();
        if (chData.success) setChannels(chData.channels as SlackChannelOption[]);
      }
    } catch {
      toast.error("No se pudo cargar la configuración de Slack");
    } finally {
      setLoading(false);
    }
  }, []);

  // Toast de retorno del OAuth (?connected=1 / ?error=...) y limpieza de la URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) toast.success("Slack conectado correctamente");
    const err = params.get("error");
    if (err) toast.error(ERROR_MESSAGES[err] ?? "No se pudo conectar Slack");
    if (params.get("connected") || err) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (!config?.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Slack className="h-5 w-5" /> Conectar Slack
          </CardTitle>
          <CardDescription>
            Recibe las notificaciones de OPAI (leads, tickets, documentos, finanzas…) en los
            canales de tu workspace de Slack, con tarjetas y un botón para abrir cada evento en OPAI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/api/integrations/slack/oauth/start">
              <Slack className="h-4 w-4 mr-1.5" /> Conectar con Slack
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <SlackConnectedPanel config={config} channels={channels} onChanged={load} />
      <Card>
        <CardHeader>
          <CardTitle>Ruteo de notificaciones</CardTitle>
          <CardDescription>
            Define a qué canal llega cada evento o módulo. Sin regla, se usa el canal por defecto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SlackRoutingTable config={config} channels={channels} onChanged={load} />
        </CardContent>
      </Card>
      <SlackLinkedUsers />
    </div>
  );
}
