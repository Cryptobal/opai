"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Tag } from "@/components/opai-ds";
import { confirmDialog } from "@/components/ui/confirm-service";
import { useCorreoWorkOptional } from "./CorreoWorkContext";

type ThreadContact = {
  id: string;
  contactId: string;
  name: string;
  email: string | null;
  accountId: string;
  addedVia: string;
  isPrimary: boolean;
};

type AccountContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

/**
 * Chips multi-selección de contactos del hilo, poblados desde la cuenta.
 */
export function CorreoThreadContacts({
  threadId,
  accountId,
}: {
  threadId: string;
  accountId: string | null;
}) {
  const work = useCorreoWorkOptional();
  const [contacts, setContacts] = useState<ThreadContact[]>([]);
  const [accountContacts, setAccountContacts] = useState<AccountContact[]>([]);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/crm/correos/${threadId}/contacts`)
      .then((r) => r.json())
      .then((d) => setContacts(Array.isArray(d.contacts) ? d.contacts : []))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!accountId || !picking) return;
    fetch(`/api/crm/contacts?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d.data) ? d.data : [];
        setAccountContacts(items);
      })
      .catch(() => setAccountContacts([]));
  }, [accountId, picking]);

  async function add(contactId: string, force = false) {
    const res = await fetch(`/api/crm/correos/${threadId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, force }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.code === "OUT_OF_ACCOUNT") {
      const ok = await confirmDialog({
        title: "Contacto de otra cuenta",
        description: "Este contacto no pertenece a la cuenta del hilo. ¿Lo vinculás igual?",
        confirmLabel: "Vincular",
      });
      if (ok) return add(contactId, true);
      return;
    }
    if (!res.ok) {
      toast.error(body.error || "No se pudo agregar el contacto");
      return;
    }
    setPicking(false);
    load();
    await work?.reload("contact");
  }

  async function remove(contactId: string, name: string) {
    const ok = await confirmDialog({
      title: "Quitar contacto del hilo",
      description: `Se desvinculará a ${name} de este correo. El contacto no se elimina del CRM.`,
      confirmLabel: "Quitar",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (!ok) return;

    setRemovingId(contactId);
    try {
      const res = await fetch(
        `/api/crm/correos/${threadId}/contacts?contactId=${encodeURIComponent(contactId)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof body.error === "string" ? body.error : "No se pudo quitar el contacto",
        );
        return;
      }
      setContacts((prev) => prev.filter((c) => c.contactId !== contactId));
      toast.success("Contacto desvinculado");
      await work?.reload("contact");
    } finally {
      setRemovingId(null);
    }
  }

  if (!accountId) {
    return (
      <p className="text-[12px] text-ds-text-4">Asocia una cuenta para elegir contactos.</p>
    );
  }

  const linkedIds = new Set(contacts.map((c) => c.contactId));
  const available = accountContacts.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {loading && contacts.length === 0 && (
          <span className="text-[12px] text-ds-text-4">Cargando…</span>
        )}
        {contacts.map((c) => (
          <span
            key={c.contactId}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 py-0.5 pl-2.5 pr-1 text-[12px] text-ds-text-1"
          >
            <span className="min-w-0 truncate">{c.name}</span>
            {c.isPrimary && (
              <Tag variant="brand" size="sm">
                Principal
              </Tag>
            )}
            <button
              type="button"
              aria-label={`Quitar ${c.name}`}
              title="Quitar del hilo"
              disabled={removingId === c.contactId}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void remove(c.contactId, c.name);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ds-text-4 ds-tap hover:bg-status-danger-soft hover:text-status-danger-fg disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-ds-border-default px-2.5 text-[12px] text-ds-text-2 ds-tap"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>
      {contacts[0]?.email && (
        <p className="truncate text-[12px] text-ds-text-4">{contacts[0].email}</p>
      )}
      {picking && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-1">
          {available.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void add(c.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ds-text-2 ds-tap hover:bg-ds-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {`${c.firstName} ${c.lastName}`.trim()}
                </span>
                {c.email && (
                  <span className="shrink-0 text-[12px] text-ds-text-4">{c.email}</span>
                )}
              </button>
            </li>
          ))}
          {available.length === 0 && (
            <li className="px-2 py-1.5 text-[12px] text-ds-text-4">
              No hay más contactos en esta cuenta
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
