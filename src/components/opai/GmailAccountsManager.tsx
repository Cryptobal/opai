/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Account = {
  id: string;
  email: string;
  status: string;
  updatedAt: string;
};

/**
 * Lista TODAS las casillas Gmail del tenant y permite desconectar cualquiera.
 * Útil para limpiar cuentas huérfanas o de ex-integrantes cuyo token murió
 * (aparecen aquí aunque no estén en la lista de Usuarios). Desconectar corta la
 * conexión y borra los tokens; los hilos ya sincronizados se conservan.
 */
export function GmailAccountsManager() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/gmail/accounts");
      if (!res.ok) return;
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disconnect = async (acc: Account) => {
    if (!confirm(`¿Desconectar ${acc.email}? Se cortará la sincronización de esta casilla.`)) {
      return;
    }
    setBusy(acc.id);
    try {
      const res = await fetch(`/api/crm/gmail/accounts?id=${encodeURIComponent(acc.id)}`, {
        method: "DELETE",
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  };

  if (!accounts || accounts.length <= 1) return null; // nada que administrar

  return (
    <div className="mt-4 rounded-xl border border-ds-border-1 bg-ds-surface-1 p-3">
      <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
        Casillas conectadas ({accounts.length})
      </p>
      <ul className="flex flex-col gap-1.5">
        {accounts.map((acc) => (
          <li
            key={acc.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px]"
          >
            <span className="min-w-0 flex-1 truncate">
              {acc.email}{" "}
              <Badge variant={acc.status === "active" ? "success" : "secondary"}>
                {acc.status === "active" ? "activa" : "desconectada"}
              </Badge>
            </span>
            {acc.status === "active" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 text-status-danger-fg"
                onClick={() => disconnect(acc)}
                disabled={busy === acc.id}
              >
                {busy === acc.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unplug className="mr-1 h-3.5 w-3.5" />
                )}
                Desconectar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
