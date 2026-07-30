"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "../agenda-calendar.types";
import type { ContactOption } from "../nueva-visita/types";

type Props = {
  users: AgendaTeamMember[];
  accountId: string | null;
  participantIds: string[];
  externalEmails: string[];
  conflictUserIds: Set<string>;
  onParticipantIds: (ids: string[]) => void;
  onExternalEmails: (emails: string[]) => void;
};

/** Chips + typeahead de equipo y contactos CRM (y correo libre) del quick-create. */
export function QuickCreateParticipants({
  users,
  accountId,
  participantIds,
  externalEmails,
  conflictUserIds,
  onParticipantIds,
  onExternalEmails,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  useEffect(() => {
    if (!accountId) {
      setContacts([]);
      return;
    }
    fetch(`/api/crm/contacts?accountId=${accountId}`)
      .then((r) => r.json())
      .then((j) => setContacts(j.data ?? []))
      .catch(() => setContacts([]));
  }, [accountId]);

  const term = q.trim().toLowerCase();
  const teamMatches = term
    ? users
        .filter((u) => !participantIds.includes(u.id) && u.name.toLowerCase().includes(term))
        .slice(0, 4)
    : [];
  const contactMatches = term
    ? contacts
        .filter((c) => {
          if (!c.email || externalEmails.includes(c.email.toLowerCase())) return false;
          return `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(term);
        })
        .slice(0, 4)
    : [];
  const rawEmail = term.includes("@") && !externalEmails.includes(term) ? term : null;

  const addEmail = (email: string) => {
    onExternalEmails([...externalEmails, email.toLowerCase()]);
    setQ("");
  };

  return (
    <div className="relative flex min-h-9 flex-wrap items-center gap-1.5">
      {participantIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onParticipantIds(participantIds.filter((p) => p !== id))}
          className="flex h-7 items-center gap-1 rounded-full bg-ds-surface-2 pl-0.5 pr-2 text-[12px] text-ds-text-1 ds-tap"
        >
          <Avatar name={usersById.get(id)?.name ?? "?"} size="sm" className="h-5 w-5 text-[12px]" />
          {usersById.get(id)?.name ?? id}
          {conflictUserIds.has(id) && <span className="text-status-warn-fg">⚠</span>}
          <X className="h-3 w-3 text-ds-text-4" />
        </button>
      ))}
      {externalEmails.map((email) => (
        <button
          key={email}
          type="button"
          onClick={() => onExternalEmails(externalEmails.filter((e) => e !== email))}
          className="flex h-7 items-center gap-1 rounded-full bg-ds-surface-2 px-2 text-[12px] text-ds-text-2 ds-tap"
        >
          {email}
          <X className="h-3 w-3 text-ds-text-4" />
        </button>
      ))}

      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => window.setTimeout(() => setEditing(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && rawEmail) {
              e.preventDefault();
              e.stopPropagation();
              addEmail(rawEmail);
            }
          }}
          placeholder="Nombre o correo…"
          className="h-7 min-w-32 flex-1 border-0 bg-transparent p-0 text-ds-body text-ds-text-1 outline-none placeholder:text-ds-text-4 focus:ring-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-7 items-center gap-1 rounded-full border border-dashed border-ds-border-default px-2.5 text-[12px] text-ds-text-3 ds-tap"
        >
          <Plus className="h-3 w-3" /> Agregar
        </button>
      )}

      {editing && term && (teamMatches.length > 0 || contactMatches.length > 0 || rawEmail) && (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-xl border border-ds-border-default bg-ds-surface-1 p-1 shadow-ds-lg">
          {teamMatches.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onParticipantIds([...participantIds, u.id]);
                setQ("");
                inputRef.current?.focus();
              }}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-ds-body text-ds-text-2 hover:bg-ds-surface-3 ds-tap"
            >
              <Avatar name={u.name} size="sm" className="h-5 w-5 text-[12px]" />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="text-[12px] text-ds-text-4">Equipo</span>
            </button>
          ))}
          {contactMatches.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addEmail(c.email!.toLowerCase())}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-ds-body text-ds-text-2 hover:bg-ds-surface-3 ds-tap",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {`${c.firstName} ${c.lastName}`.trim()}
              </span>
              <span className="min-w-0 truncate text-[12px] text-ds-text-4">{c.email}</span>
            </button>
          ))}
          {rawEmail && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addEmail(rawEmail)}
              className="flex h-8 w-full items-center rounded-lg px-2 text-left text-ds-body text-primary hover:bg-ds-surface-3 ds-tap"
            >
              Invitar a {rawEmail}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
