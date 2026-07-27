"use client";

import { useEffect, useMemo, useState } from "react";
import { Pin, PinOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/simple-select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type HistoryConversation = {
  id: string;
  title: string;
  updatedAt: string;
  pinnedAt?: string | null;
  _count?: { messages: number };
};

export function ConversationHistoryBar({
  conversations,
  activeConversationId,
  persistenceEnabled,
  onNew,
  onSelect,
  onRefresh,
}: {
  conversations: HistoryConversation[];
  activeConversationId: string | null;
  persistenceEnabled: boolean;
  onNew: () => void;
  onSelect: (id: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchResults, setSearchResults] = useState<HistoryConversation[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/ai/help-chat/conversations?q=${encodeURIComponent(debounced)}`);
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: HistoryConversation[];
        };
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setSearchResults(json.data);
        }
      } catch {
        // noop
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const list = searchResults ?? conversations;
  const options = useMemo(
    () => [
      { value: "", label: "Conversación nueva" },
      ...list.map((c) => ({
        value: c.id,
        label: `${c.pinnedAt ? "📌 " : ""}${c.title}`,
      })),
    ],
    [list],
  );

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;

  const patch = async (id: string, body: { title?: string; pinned?: boolean }) => {
    const res = await fetch(`/api/ai/help-chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) throw new Error(json.error || "No se pudo actualizar");
    await onRefresh();
  };

  const rename = async () => {
    if (!activeConversationId || !active) return;
    const next = window.prompt("Nuevo nombre del hilo", active.title);
    if (next == null) return;
    try {
      await patch(activeConversationId, { title: next });
      toast.success("Hilo renombrado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al renombrar");
    }
  };

  const togglePin = async () => {
    if (!activeConversationId || !active) return;
    try {
      await patch(activeConversationId, { pinned: !active.pinnedAt });
      toast.success(active.pinnedAt ? "Hilo desafijado" : "Hilo fijado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al fijar");
    }
  };

  const remove = async () => {
    if (!activeConversationId) return;
    if (!window.confirm("¿Eliminar este hilo? No se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/ai/help-chat/conversations/${activeConversationId}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo eliminar");
      onSelect(null);
      await onRefresh();
      toast.success("Hilo eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  return (
    <div className="border-b border-white/[0.06] px-3 py-2 bg-black/10 space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-10 sm:h-8 gap-1 border-white/20 bg-white/5 text-white"
          onClick={onNew}
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva
        </Button>
        <SimpleSelect
          className="h-10 sm:h-9 flex-1 min-w-0 rounded-md border border-white/15 bg-white/5 px-2 text-xs text-white truncate"
          value={activeConversationId ?? ""}
          onValueChange={(v) => onSelect(v || null)}
          disabled={!persistenceEnabled}
          options={options}
        />
        {activeConversationId ? (
          <div className="flex items-center gap-0.5 shrink-0">
            <IconBtn label="Renombrar" onClick={() => void rename()}>
              <Pencil className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={active?.pinnedAt ? "Desafijar" : "Fijar"}
              onClick={() => void togglePin()}
              active={Boolean(active?.pinnedAt)}
            >
              {active?.pinnedAt ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn label="Eliminar" onClick={() => void remove()} danger>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        ) : null}
      </div>
      {persistenceEnabled ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searching ? "Buscando…" : "Buscar hilos…"}
            className="h-10 sm:h-9 w-full rounded-md border border-white/15 bg-white/5 pl-8 pr-3 text-[13px] text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          />
        </div>
      ) : null}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md text-white/55 hover:bg-white/10 hover:text-white transition",
        active && "bg-white/10 text-primary",
        danger && "hover:text-status-danger-fg",
      )}
    >
      {children}
    </button>
  );
}
