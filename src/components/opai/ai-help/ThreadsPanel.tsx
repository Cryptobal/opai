"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal, Pin, Plus, Search, Trash2, Pencil } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { toast } from "sonner";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-service";
import { cn } from "@/lib/utils";
import type { HistoryConversation } from "./types";

const TZ = "America/Santiago";

function relativeDate(iso: string): string {
  try {
    const zoned = toZonedTime(new Date(iso), TZ);
    return formatDistanceToNow(zoned, { addSuffix: true, locale: es });
  } catch {
    return "";
  }
}

export function ThreadsPanel({
  open,
  onClose,
  conversations,
  activeConversationId,
  persistenceEnabled,
  onNew,
  onSelect,
  onRefresh,
  variant = "sheet",
}: {
  open: boolean;
  onClose: () => void;
  conversations: HistoryConversation[];
  activeConversationId: string | null;
  persistenceEnabled: boolean;
  onNew: () => void;
  onSelect: (id: string | null) => void;
  onRefresh: () => Promise<void>;
  variant?: "sheet" | "popover";
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchResults, setSearchResults] = useState<HistoryConversation[] | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSearchResults(null);
      setMenuId(null);
      return;
    }
    // Al abrir hilos (buscar), cursor en el campo de búsqueda.
    const focus = () => searchInputRef.current?.focus({ preventScroll: true });
    let timeoutId = 0;
    const raf = requestAnimationFrame(() => {
      focus();
      timeoutId = window.setTimeout(focus, 80);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [open]);

  useEffect(() => {
    if (!debounced) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/ai/help-chat/conversations?q=${encodeURIComponent(debounced)}`,
        );
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: HistoryConversation[];
        };
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setSearchResults(json.data);
        }
      } catch {
        // noop
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const list = searchResults ?? conversations;
  const { pinned, recent } = useMemo(() => {
    const p: HistoryConversation[] = [];
    const r: HistoryConversation[] = [];
    for (const c of list) {
      if (c.pinnedAt) p.push(c);
      else r.push(c);
    }
    return { pinned: p, recent: r };
  }, [list]);

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

  const rename = async (c: HistoryConversation) => {
    setMenuId(null);
    const next = await promptDialog({
      title: "Renombrar hilo",
      description: "Nuevo nombre del hilo",
      defaultValue: c.title,
      confirmLabel: "Guardar",
    });
    if (next == null) return;
    try {
      await patch(c.id, { title: next.trim() || c.title });
      toast.success("Hilo renombrado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al renombrar");
    }
  };

  const togglePin = async (c: HistoryConversation) => {
    setMenuId(null);
    try {
      await patch(c.id, { pinned: !c.pinnedAt });
      toast.success(c.pinnedAt ? "Hilo desafijado" : "Hilo fijado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al fijar");
    }
  };

  const remove = async (c: HistoryConversation) => {
    setMenuId(null);
    const ok = await confirmDialog({
      title: "Eliminar hilo",
      description: "¿Eliminar este hilo? No se puede deshacer.",
      confirmLabel: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/ai/help-chat/conversations/${c.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo eliminar");
      if (activeConversationId === c.id) onSelect(null);
      await onRefresh();
      toast.success("Hilo eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  if (!open) return null;

  const renderRow = (c: HistoryConversation) => (
    <div
      key={c.id}
      className={cn(
        "group relative flex items-center gap-2 rounded-xl px-3 py-2.5",
        c.id === activeConversationId ? "bg-primary/15" : "hover:bg-ds-surface-2",
      )}
    >
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => {
          onSelect(c.id);
          onClose();
        }}
      >
        <p className="truncate text-ds-body font-medium text-ds-text-1">{c.title}</p>
        <p className="mt-0.5 text-[12px] text-ds-text-4">
          {relativeDate(c.updatedAt)}
          {c._count?.messages != null ? ` · ${c._count.messages} msgs` : ""}
        </p>
      </button>
      <button
        type="button"
        aria-label="Más opciones"
        onClick={() => setMenuId((id) => (id === c.id ? null : c.id))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ds-text-3 hover:bg-ds-surface-3"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menuId === c.id ? (
        <div className="absolute right-2 top-11 z-20 w-40 rounded-xl border border-ds-border-default bg-ds-surface-3 p-1 shadow-lg">
          <MenuBtn icon={<Pencil className="h-3.5 w-3.5" />} label="Renombrar" onClick={() => void rename(c)} />
          <MenuBtn
            icon={<Pin className="h-3.5 w-3.5" />}
            label={c.pinnedAt ? "Desafijar" : "Fijar"}
            onClick={() => void togglePin(c)}
          />
          <MenuBtn
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Eliminar"
            danger
            onClick={() => void remove(c)}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col bg-ds-surface-1 text-ds-text-1",
        variant === "sheet"
          ? "absolute inset-0 z-30"
          : "absolute right-3 top-14 z-30 w-[320px] max-h-[70vh] overflow-hidden rounded-2xl border border-ds-border-default shadow-xl",
      )}
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-ds-border-subtle px-3">
        <button
          type="button"
          aria-label="Volver"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-ds-surface-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="flex-1 font-display text-[14px] font-semibold">Hilos</p>
        <button
          type="button"
          aria-label="Nueva conversación"
          onClick={() => {
            onNew();
            onClose();
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-ds-surface-2"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {persistenceEnabled ? (
        <div className="relative px-3 py-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ds-text-4" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar hilos…"
            autoFocus
            className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-2 pl-8 pr-3 text-ds-body text-ds-text-1 placeholder:text-ds-text-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {pinned.length > 0 ? (
          <Section title="Fijados">{pinned.map(renderRow)}</Section>
        ) : null}
        <Section title="Recientes">
          {recent.length === 0 ? (
            <p className="px-3 py-6 text-center text-ds-body text-ds-text-4">Sin hilos aún</p>
          ) : (
            recent.map(renderRow)
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="px-3 py-1 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
        {title}
      </p>
      {children}
    </div>
  );
}

function MenuBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-ds-body text-left hover:bg-ds-surface-2",
        danger ? "text-status-danger-fg" : "text-ds-text-1",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
