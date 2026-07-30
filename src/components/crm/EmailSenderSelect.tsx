"use client";

import { useEffect, useState } from "react";

type SenderAccount = { id: string; email: string; status: string };

/**
 * Selector de casilla remitente (PR-04, C02). Lista las casillas Gmail
 * conectadas del usuario de sesión (el GET de accounts ya viene scoped por
 * usuario) y solo se muestra cuando hay más de una.
 *
 * En reply (`lockedAccountId`) la casilla del hilo queda fija y no editable:
 * permitir cambiarla reintroduciría el envío cross-cuenta (B1). Si se quisiera
 * enviar desde otra casilla, el correo debe salir como mensaje nuevo sin
 * threadId — decisión documentada en el PR.
 */
export function EmailSenderSelect({
  value,
  onChange,
  lockedAccountId = null,
}: {
  value: string | null;
  onChange: (accountId: string | null) => void;
  /** id de la casilla del hilo cuando el composer está en modo reply. */
  lockedAccountId?: string | null;
}) {
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/crm/gmail/accounts");
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const own = (data.accounts ?? []).filter(
          (a: SenderAccount) => a.status === "active",
        );
        setAccounts(own);
      } catch {
        /* sin lista: el server usa la única casilla o exige selección */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Default: única casilla o primera de la lista, para que el payload lleve
  // siempre una selección explícita cuando hay múltiples.
  useEffect(() => {
    if (lockedAccountId) return;
    if (!value && accounts.length > 0) onChange(accounts[0].id);
  }, [accounts, value, lockedAccountId, onChange]);

  if (lockedAccountId) {
    const locked = accounts.find((a) => a.id === lockedAccountId);
    if (!locked || accounts.length < 2) return null;
    return (
      <p className="text-[12px] text-ds-text-3">
        Respondiendo desde <span className="font-medium">{locked.email}</span>{" "}
        (casilla del hilo)
      </p>
    );
  }

  if (accounts.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-[12px] text-ds-text-3">
      De:
      <select
        value={value ?? accounts[0]?.id ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-ds-body text-ds-text-2"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.email}
          </option>
        ))}
      </select>
    </label>
  );
}
