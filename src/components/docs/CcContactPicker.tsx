"use client";

/**
 * CcContactPicker — picker to autofill a CC recipient with one of the
 * account's CRM contacts. Used inside the SignatureRequestModal.
 *
 * Loads contacts lazily when the popover opens for the first time.
 */

import { useEffect, useState } from "react";
import { UserPlus, Search, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Contact = {
  id: string;
  name: string;
  email: string;
  roleTitle: string | null;
  isPrimary: boolean;
};

type Props = {
  documentId: string;
  onSelect: (c: { name: string; email: string; roleTitle: string | null }) => void;
};

export function CcContactPicker({ documentId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/docs/documents/${documentId}/suggested-cc`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success && Array.isArray(d.data)) setContacts(d.data);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, documentId]);

  const filtered = query.trim()
    ? contacts.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.roleTitle ?? "").toLowerCase().includes(q)
        );
      })
    : contacts;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Buscar entre contactos del cliente"
          title="Buscar entre contactos del cliente"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-80 min-w-[20rem] max-w-[20rem] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border p-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contacto..."
              className="h-8 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando contactos...
            </div>
          )}
          {!loading && contacts.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              Este documento no está asociado a una cuenta o la cuenta no tiene
              contactos con email.
            </p>
          )}
          {!loading && contacts.length > 0 && filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No hay coincidencias para "{query}".
            </p>
          )}
          {!loading &&
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect({ name: c.name, email: c.email, roleTitle: c.roleTitle });
                  setOpen(false);
                }}
                className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="truncate">{c.name || "(Sin nombre)"}</span>
                  {c.isPrimary && (
                    <span className="text-[10px] uppercase tracking-wide text-primary">
                      Principal
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.email}
                  {c.roleTitle ? ` · ${c.roleTitle}` : ""}
                </div>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
