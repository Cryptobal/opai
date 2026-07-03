"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SelectOption } from "@/components/configuracion/slack/SearchableSelect";

interface ChatChannelSlackBridgeProps {
  open: boolean;
  mode: "connect" | "disconnect"; // connect → elegir canal · disconnect → confirmar
  chatChannelId: string;
  channelName: string; // nombre visible del canal de OPAI
  bridge: { id: string; slackChannelName: string } | null; // puente existente
  onClose: () => void;
  onChanged: () => void; // tras conectar/desconectar OK (refresca + cierra)
}

/** Modal para vincular/desvincular un canal de OPAI con Slack desde el menú del
 *  chat. Usa los bridges existentes (POST/DELETE): validan admin + tenant + bot. */
export function ChatChannelSlackBridge({
  open,
  mode,
  chatChannelId,
  channelName,
  bridge,
  onClose,
  onChanged,
}: ChatChannelSlackBridgeProps) {
  const [slackOpts, setSlackOpts] = useState<SelectOption[]>([]);
  const [slackId, setSlackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/slack/channels");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error");
      setSlackOpts(
        (data.channels as { id: string; name: string; isPrivate: boolean }[]).map((ch) => ({
          value: ch.id,
          label: `#${ch.name}`,
          hint: ch.isPrivate ? "privado" : undefined,
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar los canales de Slack");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && mode === "connect") {
      setSlackId(null);
      void loadChannels();
    }
  }, [open, mode, loadChannels]);

  const connect = async () => {
    if (!slackId) {
      toast.error("Elige un canal de Slack");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/slack/bridges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatChannelId, slackChannelId: slackId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error");
      toast.success("Canal vinculado. Ambos canales fueron avisados.");
      onChanged();
    } catch (err) {
      // El error del API ya es accionable (ej. "/invite @OPAI …").
      toast.error(err instanceof Error ? err.message : "No se pudo vincular el canal");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!bridge) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/slack/bridges?id=${bridge.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      toast.success("Canal desconectado de Slack");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desconectar");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "disconnect") {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => { if (!o) onClose(); }}
        title="Desconectar de Slack"
        description={`Dejarás de espejar «${channelName}» con #${bridge?.slackChannelName ?? ""}. Se avisará en ambos canales.`}
        confirmLabel="Desconectar"
        onConfirm={disconnect}
        loading={busy}
        loadingLabel="Desconectando…"
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular «{channelName}» con Slack</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Los mensajes de este canal (incluidos guardias y contactos de cliente) serán visibles
            en Slack, y viceversa. Se publicará un aviso en ambos canales al conectar.
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Canal de Slack</p>
            <SearchableSelect
              options={slackOpts}
              value={slackId}
              onChange={setSlackId}
              placeholder={loading ? "Cargando canales…" : "Elige un canal de Slack"}
              disabled={loading || busy}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button size="sm" onClick={connect} disabled={busy || loading}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {busy ? "Conectando…" : "Conectar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
