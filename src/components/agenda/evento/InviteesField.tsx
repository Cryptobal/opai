"use client";

import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/opai-ds";

export type TenantUser = { id: string; name: string; email?: string | null };

export type InviteesValue = {
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string }>;
};

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function InviteesField({
  id = "event-invitees",
  users,
  participantIds,
  externalEmails,
  onChange,
}: {
  id?: string;
  users: TenantUser[];
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string }>;
  onChange: (next: InviteesValue) => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const selectedUsers = participantIds
    .map((uid) => byId.get(uid))
    .filter((u): u is TenantUser => Boolean(u));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users.filter((u) => !participantIds.includes(u.id)).slice(0, 6);
    return users
      .filter((u) => !participantIds.includes(u.id))
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [users, participantIds, query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const addUser = (uid: string) => {
    if (participantIds.includes(uid)) return;
    onChange({
      participantIds: [...participantIds, uid],
      externalEmails,
    });
    setQuery("");
    setOpen(false);
  };

  const removeUser = (uid: string) => {
    onChange({
      participantIds: participantIds.filter((p) => p !== uid),
      externalEmails,
    });
  };

  const addExternal = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!isEmailLike(email)) return false;
    if (externalEmails.some((e) => e.email.toLowerCase() === email)) {
      setQuery("");
      return true;
    }
    const tenantMatch = users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (tenantMatch) {
      addUser(tenantMatch.id);
      return true;
    }
    onChange({
      participantIds,
      externalEmails: [...externalEmails, { email }],
    });
    setQuery("");
    setOpen(false);
    return true;
  };

  const removeExternal = (email: string) => {
    onChange({
      participantIds,
      externalEmails: externalEmails.filter((e) => e.email !== email),
    });
  };

  return (
    <div ref={ref} className="relative space-y-1">
      <Label htmlFor={id} className="text-[12px] text-ds-text-3">
        Invitados (equipo o externos)
      </Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ds-border-default bg-ds-surface-1 p-1.5">
        {selectedUsers.map((u) => (
          <span
            key={u.id}
            className="flex items-center gap-1 rounded-full bg-ds-surface-2 py-0.5 pl-0.5 pr-1.5 text-[12px] text-ds-text-1"
          >
            <Avatar name={u.name} size="sm" variant="brand" />
            <span className="max-w-[120px] truncate">{u.name}</span>
            <button
              type="button"
              onClick={() => removeUser(u.id)}
              aria-label={`Quitar ${u.name}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {externalEmails.map((e) => (
          <span
            key={e.email}
            className="flex items-center gap-1 rounded-full bg-ds-surface-2 px-2 py-0.5 text-[12px] text-ds-text-1"
          >
            <span className="max-w-[160px] truncate">{e.email}</span>
            <button
              type="button"
              onClick={() => removeExternal(e.email)}
              aria-label={`Quitar ${e.email}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const raw = query.replace(/,$/, "").trim();
              if (suggestions[0] && !isEmailLike(raw)) {
                addUser(suggestions[0].id);
                return;
              }
              addExternal(raw);
            } else if (
              e.key === "Backspace" &&
              !query &&
              (externalEmails.length > 0 || participantIds.length > 0)
            ) {
              if (externalEmails.length > 0) {
                removeExternal(externalEmails[externalEmails.length - 1].email);
              } else {
                removeUser(participantIds[participantIds.length - 1]);
              }
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              const raw = query.trim();
              if (raw && isEmailLike(raw)) addExternal(raw);
            }, 120);
          }}
          placeholder="Buscar usuario o email…"
          className="h-10 min-w-[140px] flex-1 bg-transparent px-1.5 text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4 sm:h-8"
        />
      </div>
      {open && (suggestions.length > 0 || isEmailLike(query.trim())) && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 p-1.5 shadow-ds-lg">
          <div className="max-h-56 overflow-y-auto">
            {suggestions.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addUser(u.id)}
                className="flex w-full min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 sm:min-h-0"
              >
                <Avatar name={u.name} size="sm" variant="brand" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {u.email && (
                  <span className="truncate text-[12px] text-ds-text-4">{u.email}</span>
                )}
              </button>
            ))}
            {isEmailLike(query.trim()) &&
              !users.some(
                (u) => (u.email ?? "").toLowerCase() === query.trim().toLowerCase(),
              ) &&
              !externalEmails.some(
                (e) => e.email.toLowerCase() === query.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addExternal(query)}
                  className="flex w-full min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 sm:min-h-0"
                >
                  Agregar externo{" "}
                  <span className="font-medium text-ds-text-2">{query.trim()}</span>
                </button>
              )}
          </div>
        </div>
      )}
      <p className="text-[12px] text-ds-text-4">
        Elige gente del tenant o escribe un email externo y Enter.
      </p>
    </div>
  );
}
