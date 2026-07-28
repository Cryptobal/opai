"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, Check, Loader2, Lock, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatChannelSlackBridgeProps {
  open: boolean;
  mode: "connect" | "disconnect";
  chatChannelId: string;
  channelName: string;
  bridge: { id: string; slackChannelName: string } | null;
  onClose: () => void;
  onChanged: () => void;
}

type SlackChannelOpt = {
  id: string;
  name: string;
  isPrivate: boolean;
};

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
  const [slackChannels, setSlackChannels] = useState<SlackChannelOpt[]>([]);
  const [bridgedBySlackId, setBridgedBySlackId] = useState<Map<string, string>>(new Map());
  const [slackId, setSlackId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadChannels = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [chRes, brRes] = await Promise.all([
        fetch("/api/integrations/slack/channels"),
        fetch("/api/integrations/slack/bridges"),
      ]);
      const chData = await chRes.json();
      if (!chRes.ok || !chData.success) {
        throw new Error(chData.error || "No se pudieron cargar los canales de Slack");
      }
      setSlackChannels(
        (chData.channels as { id: string; name: string; isPrivate: boolean }[]).map((ch) => ({
          id: ch.id,
          name: ch.name,
          isPrivate: ch.isPrivate,
        })),
      );

      const occupied = new Map<string, string>();
      if (brRes.ok) {
        const brData = await brRes.json();
        const bridges = (brData.bridges ?? brData.data ?? []) as Array<{
          slackChannelId: string;
          chatChannelName?: string;
          chatChannelId?: string;
        }>;
        for (const b of bridges) {
          if (b.slackChannelId) {
            occupied.set(
              b.slackChannelId,
              b.chatChannelName ?? b.chatChannelId ?? "otro canal de OPAI",
            );
          }
        }
      }
      setBridgedBySlackId(occupied);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudieron cargar los canales de Slack";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && mode === "connect") {
      setSlackId(null);
      setQuery("");
      void loadChannels();
      // Foco en buscador tras montar
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, mode, loadChannels]);

  const selected = useMemo(
    () => slackChannels.find((c) => c.id === slackId) ?? null,
    [slackChannels, slackId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return slackChannels;
    return slackChannels.filter((c) => c.name.toLowerCase().includes(q));
  }, [slackChannels, query]);

  const allOccupied =
    slackChannels.length > 0 && slackChannels.every((c) => bridgedBySlackId.has(c.id));

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
      <DialogContent className="max-w-[520px] max-h-[85vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-ds-border-subtle shrink-0">
          <DialogTitle className="truncate pr-6" title={channelName}>
            Vincular «{channelName}» con Slack
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {/* Preview puente */}
          <div className="flex items-center gap-3 rounded-xl border border-ds-border-default bg-ds-surface-2 px-3 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] uppercase tracking-wide text-ds-text-4">OPAI</p>
              <p className="text-[13px] font-medium text-ds-text-1 truncate" title={channelName}>
                {channelName}
              </p>
            </div>
            <ArrowLeftRight className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
            <div className="flex-1 min-w-0 text-right">
              <p className="text-[12px] uppercase tracking-wide text-ds-text-4">Slack</p>
              <p
                className={cn(
                  "text-[13px] font-medium truncate",
                  selected ? "text-ds-text-1" : "text-ds-text-4",
                )}
                title={selected ? `#${selected.name}` : undefined}
              >
                {selected ? `#${selected.name}` : "Elige un canal"}
              </p>
            </div>
          </div>

          {/* Aviso transparencia */}
          <div className="flex gap-2.5 rounded-xl border border-status-warn-border bg-status-warn-soft p-3 text-[13px] text-status-warn-fg">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <p>
              El espejo es bidireccional: incluye mensajes de guardias y contactos de cliente.
              Al conectar se publica un aviso en ambos canales.
            </p>
          </div>

          {/* Picker */}
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-ds-text-2">Canal de Slack</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ds-text-4" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={loading ? "Cargando canales…" : "Buscar canal…"}
                disabled={loading || busy}
                className="w-full h-10 sm:h-9 pl-8 pr-3 text-[13px] rounded-md border border-ds-border-default bg-ds-surface-1 placeholder:text-ds-text-4 focus:outline-none focus:ring-1 focus:ring-status-info-border"
                autoFocus
              />
            </div>

            {loadError ? (
              <div className="rounded-lg border border-status-danger-border bg-status-danger-soft p-3 text-[13px] text-status-danger-fg space-y-2">
                <p>{loadError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadChannels()}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <ul
                className="max-h-[220px] overflow-y-auto rounded-lg border border-ds-border-default divide-y divide-ds-border-subtle"
                role="listbox"
                aria-label="Canales de Slack"
              >
                {loading && (
                  <li className="flex items-center justify-center gap-2 py-8 text-[13px] text-ds-text-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando…
                  </li>
                )}
                {!loading && filtered.length === 0 && (
                  <li className="py-8 text-center text-[13px] text-ds-text-3">
                    {slackChannels.length === 0
                      ? "No hay canales disponibles"
                      : "Ningún canal coincide con la búsqueda"}
                  </li>
                )}
                {!loading &&
                  filtered.map((ch) => {
                    const occupiedBy = bridgedBySlackId.get(ch.id);
                    const disabled = Boolean(occupiedBy);
                    const selectedRow = slackId === ch.id;
                    return (
                      <li key={ch.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedRow}
                          disabled={disabled || busy}
                          onClick={() => setSlackId(ch.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 h-11 text-left text-[13px] transition-colors",
                            disabled
                              ? "opacity-50 cursor-not-allowed bg-ds-surface-2"
                              : selectedRow
                                ? "bg-status-info-soft text-ds-text-1"
                                : "hover:bg-ds-surface-2 text-ds-text-2",
                          )}
                        >
                          {ch.isPrivate ? (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
                          ) : (
                            <span className="text-ds-text-4 shrink-0 w-3.5 text-center">#</span>
                          )}
                          <span className="truncate flex-1 min-w-0">{ch.name}</span>
                          {occupiedBy && (
                            <span className="shrink-0 text-[12px] text-ds-text-4 truncate max-w-[45%]">
                              ya vinculado · {occupiedBy}
                            </span>
                          )}
                          {selectedRow && !disabled && (
                            <Check className="h-4 w-4 shrink-0 text-status-info-fg" />
                          )}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}

            {allOccupied && !loading && !loadError && (
              <p className="text-[12px] text-ds-text-3">
                Todos los canales de Slack ya están vinculados a un canal de OPAI.
              </p>
            )}

            <p className="text-[12px] text-ds-text-3">
              El bot <span className="font-medium text-ds-text-2">@OPAI</span> debe ser miembro del
              canal. Si no lo es, ejecuta <code className="font-mono">/invite @OPAI</code> en Slack y
              reintenta.
            </p>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-ds-border-subtle shrink-0 flex-row justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={connect}
            disabled={busy || loading || !slackId || Boolean(slackId && bridgedBySlackId.has(slackId))}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {busy ? "Conectando…" : "Conectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
