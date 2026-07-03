"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Plus, Unlink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect, type SelectOption } from "./SearchableSelect";

interface Bridge {
  id: string;
  slackChannelName: string;
  chatChannelName: string;
  createdByName: string;
  createdAt: string;
}

export function SlackBridges() {
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [chatOpts, setChatOpts] = useState<SelectOption[]>([]);
  const [slackOpts, setSlackOpts] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatId, setChatId] = useState<string | null>(null);
  const [slackId, setSlackId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Bridge | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bRes, cRes, sRes] = await Promise.all([
        fetch("/api/integrations/slack/bridges"),
        fetch("/api/chat/channels"),
        fetch("/api/integrations/slack/channels"),
      ]);
      const [b, c, s] = await Promise.all([bRes.json(), cRes.json(), sRes.json()]);
      if (b.success) setBridges(b.bridges);
      if (c.success) {
        setChatOpts((c.data as { id: string; name: string }[]).map((ch) => ({ value: ch.id, label: ch.name })));
      }
      if (s.success) {
        setSlackOpts((s.channels as { id: string; name: string; isPrivate: boolean }[]).map((ch) => ({
          value: ch.id,
          label: `#${ch.name}`,
          hint: ch.isPrivate ? "privado" : undefined,
        })));
      }
    } catch {
      toast.error("No se pudieron cargar los puentes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!chatId || !slackId) {
      toast.error("Elige un canal de OPAI y uno de Slack");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/slack/bridges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatChannelId: chatId, slackChannelId: slackId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error");
      toast.success("Puente creado. Ambos canales fueron avisados.");
      setChatId(null); setSlackId(null); setCreating(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el puente");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/slack/bridges?id=${removing.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      toast.success("Puente desconectado");
      setRemoving(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desconectar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle>Puentes de canales</CardTitle>
            <CardDescription>Espeja un canal de OPAI con un canal de Slack, en ambos sentidos.</CardDescription>
          </div>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo puente
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {creating && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Los mensajes de este canal (incluidos guardias y contactos de cliente) serán visibles
              en Slack, y viceversa. Se publicará un aviso en ambos canales al conectar.
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Canal de OPAI</p>
              <SearchableSelect options={chatOpts} value={chatId} onChange={setChatId} placeholder="Elige un canal de OPAI" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Canal de Slack</p>
              <SearchableSelect options={slackOpts} value={slackId} onChange={setSlackId} placeholder="Elige un canal de Slack" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={busy}>Cancelar</Button>
              <Button size="sm" onClick={create} disabled={busy}>{busy ? "Conectando…" : "Conectar"}</Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : bridges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay puentes. Crea uno para espejar un canal.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {bridges.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.chatChannelName} ↔ #{b.slackChannelName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    creado por {b.createdByName} · {new Date(b.createdAt).toLocaleDateString("es-CL")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setRemoving(b)}
                >
                  <Unlink className="mr-1.5 h-4 w-4" /> Desconectar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => { if (!o) setRemoving(null); }}
        title="Desconectar puente"
        description={`Dejarás de espejar «${removing?.chatChannelName ?? ""}» con #${removing?.slackChannelName ?? ""}. Se avisará en ambos canales.`}
        confirmLabel="Desconectar"
        onConfirm={remove}
        loading={busy}
        loadingLabel="Desconectando…"
      />
    </Card>
  );
}
