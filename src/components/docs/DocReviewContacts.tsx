"use client";

/**
 * Gestiona los contactos CRM asociados al contrato (revisores con acceso
 * de lectura vía Portal Cliente). Permite agregar/quitar desde la ficha
 * del documento sin salir del visor.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Search,
  User,
  UserPlus,
  X,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tag } from "@/components/opai-ds";

type AccountContact = {
  id: string;
  name: string;
  email: string;
  roleTitle: string | null;
  isPrimary: boolean;
  portalEnabled: boolean;
  associated: boolean;
};

type Props = {
  documentId: string;
  /** Contact associations already loaded with the document (for optimistic first paint). */
  initialAssociated?: Array<{
    id: string;
    entityId: string;
    entityName?: string | null;
  }>;
  onChanged?: () => void;
};

export function DocReviewContacts({
  documentId,
  initialAssociated,
  onChanged,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/docs/documents/${documentId}/contacts`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "No se pudieron cargar contactos");
      }
      setContacts(json.data.contacts ?? []);
    } catch (err) {
      console.error(err);
      // Fallback visual con lo que ya trajo el documento
      if (initialAssociated?.length) {
        setContacts(
          initialAssociated.map((a) => ({
            id: a.entityId,
            name: a.entityName || "Contacto",
            email: "",
            roleTitle: null,
            isPrimary: false,
            portalEnabled: true,
            associated: true,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [documentId, initialAssociated]);

  useEffect(() => {
    load();
  }, [load]);

  const associated = contacts.filter((c) => c.associated);
  const available = contacts.filter((c) => !c.associated);
  const filtered = query.trim()
    ? available.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.roleTitle ?? "").toLowerCase().includes(q)
        );
      })
    : available;

  const addContact = async (contactId: string) => {
    setBusyId(contactId);
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId] }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "No se pudo asociar el contacto");
      }
      toast.success("Contacto asociado al contrato");
      setPickerOpen(false);
      setQuery("");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al asociar contacto",
      );
    } finally {
      setBusyId(null);
    }
  };

  const removeContact = async (contactId: string) => {
    setBusyId(contactId);
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId] }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "No se pudo quitar el contacto");
      }
      toast.success("Contacto desasociado");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al quitar contacto",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2 px-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ds-text-3">
          Contactos con acceso al contrato
        </span>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 sm:h-8 items-center gap-1.5 rounded-md border border-ds-border-default bg-ds-surface-1 px-2.5 text-xs text-ds-text-2 hover:bg-ds-surface-2 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Agregar
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={4}
            className="w-80 p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="border-b border-ds-border-subtle p-2">
              <div className="flex items-center gap-2 rounded-md border border-ds-border-default bg-background px-2">
                <Search className="h-3.5 w-3.5 text-ds-text-3" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar contacto de la cuenta…"
                  className="h-10 sm:h-8 w-full bg-transparent text-ds-body text-foreground placeholder:text-ds-text-3 outline-none"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {loading && (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-ds-text-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando…
                </div>
              )}
              {!loading && available.length === 0 && (
                <p className="px-3 py-4 text-xs text-ds-text-3">
                  No hay más contactos con email en la cuenta, o todos ya están
                  asociados.
                </p>
              )}
              {!loading && available.length > 0 && filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-ds-text-3">
                  Sin coincidencias para &quot;{query}&quot;.
                </p>
              )}
              {!loading &&
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => addContact(c.id)}
                    className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-ds-surface-2 focus:bg-ds-surface-2 focus:outline-none disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2 text-ds-body font-medium text-foreground">
                      <Plus className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
                      <span className="truncate">{c.name || "(Sin nombre)"}</span>
                      {c.isPrimary && (
                        <Tag variant="info" size="sm">
                          Principal
                        </Tag>
                      )}
                    </div>
                    <div className="pl-5 text-xs text-ds-text-3 truncate">
                      {c.email}
                      {c.roleTitle ? ` · ${c.roleTitle}` : ""}
                      {!c.portalEnabled ? " · Sin portal" : ""}
                    </div>
                  </button>
                ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {loading && associated.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-ds-text-3 py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando contactos…
        </div>
      ) : associated.length === 0 ? (
        <p className="text-xs text-ds-text-3">
          Ningún contacto asociado. Agrega a quienes deben revisar el contrato
          en el Portal Cliente (o envíales la revisión: se asocian solos).
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {associated.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-md bg-ds-surface-2 border border-ds-border-subtle px-2 py-1 text-xs max-w-full"
            >
              <User className="h-3 w-3 text-ds-text-3 shrink-0" />
              <a
                href={`/opai/crm/contactos/${c.id}`}
                className="truncate hover:text-primary transition-colors"
                title={c.email}
              >
                {c.name || c.email || "Contacto"}
              </a>
              {c.isPrimary && (
                <Tag variant="info" size="sm">
                  Principal
                </Tag>
              )}
              {!c.portalEnabled && (
                <span
                  className="inline-flex items-center gap-0.5 text-status-warn-fg"
                  title="Aún no tiene acceso al Portal Cliente. Envíale la revisión para que cree su PIN."
                >
                  <ShieldAlert className="h-3 w-3" />
                </span>
              )}
              <button
                type="button"
                aria-label={`Quitar a ${c.name || c.email}`}
                disabled={busyId === c.id}
                onClick={() => removeContact(c.id)}
                className="ml-0.5 rounded p-0.5 text-ds-text-3 hover:text-status-danger-fg hover:bg-status-danger-soft transition-colors disabled:opacity-50"
              >
                {busyId === c.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
