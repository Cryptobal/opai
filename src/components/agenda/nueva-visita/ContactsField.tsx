"use client";

import { useEffect, useRef, useState } from "react";
import type { ContactOption } from "./types";

export function ContactsField({
  accountId,
  selected,
  onChange,
}: {
  accountId: string | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [list, setList] = useState<ContactOption[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!accountId) {
      setList([]);
      return;
    }
    const mine = ++seq.current;
    fetch(`/api/crm/contacts?accountId=${accountId}`)
      .then((r) => r.json())
      .then((j) => {
        if (mine === seq.current) setList(j.data ?? []);
      })
      .catch(() => undefined);
  }, [accountId]);

  if (!accountId) return null;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-ds-text-3">Contactos a invitar</p>
      {list.length === 0 ? (
        <p className="text-[12px] text-ds-text-4">La cuenta no tiene contactos cargados.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {list.map((c) => {
            const name = `${c.firstName} ${c.lastName}`.trim();
            const checked = selected.includes(c.id);
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2 ds-tap">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ds-text-1">{name}</span>
                    <span className="block truncate text-[12px] text-ds-text-4">
                      {[c.roleTitle, c.email].filter(Boolean).join(" · ") || "Sin datos"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
