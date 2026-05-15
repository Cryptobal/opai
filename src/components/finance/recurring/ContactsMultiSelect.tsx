"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail } from "lucide-react";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roleTitle: string | null;
}

interface Props {
  accountId: string;
  value: string[];
  onChange: (next: string[]) => void;
}

export function ContactsMultiSelect({ accountId, value, onChange }: Props) {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/crm/contacts?accountId=${accountId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.success) {
          setError(j?.error ?? "No se pudieron cargar los contactos");
          setContacts([]);
          return;
        }
        const list: Contact[] = (Array.isArray(j.data) ? j.data : []).filter(
          (c: Contact) => !!c.email,
        );
        setContacts(list);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error de red");
          setContacts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-ds-text-3 py-2">
        <Loader2 className="size-3.5 animate-spin" /> Cargando contactos…
      </div>
    );
  }
  if (error) {
    return <div className="text-xs text-status-error-fg py-1">{error}</div>;
  }
  if (contacts.length === 0) {
    return (
      <div className="text-xs text-ds-text-3 py-2">
        Este cliente no tiene contactos con email. Agregalos primero en CRM.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-56 overflow-y-auto">
      {contacts.map((c) => {
        const checked = value.includes(c.id);
        const fullName = [c.firstName, c.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        return (
          <label
            key={c.id}
            className="flex items-start gap-2 text-[13px] cursor-pointer hover:bg-ds-surface-3 rounded px-1.5 py-1"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggle(c.id)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ds-text-1 truncate">
                {fullName || c.email}
              </div>
              <div className="text-xs text-ds-text-3 flex items-center gap-1.5 truncate">
                <Mail className="size-3 flex-none" />
                <span className="truncate">{c.email}</span>
                {c.roleTitle ? (
                  <>
                    <span>·</span>
                    <span className="truncate">{c.roleTitle}</span>
                  </>
                ) : null}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
