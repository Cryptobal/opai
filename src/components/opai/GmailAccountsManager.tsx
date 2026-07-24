/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmDialog } from "@/components/ui/confirm-service";

type Account = {
  id: string;
  email: string;
  status: string;
  updatedAt: string;
  /** Email del dueño de la casilla; solo presente para Owner/Admin. */
  ownerEmail?: string | null;
};

/**
 * Lista las casillas Gmail propias del usuario; Owner/Admin ven todas las del
 * tenant (con el email del dueño) y pueden desconectar cualquiera. Útil para
 * limpiar cuentas huérfanas o de ex-integrantes cuyo token murió (aparecen
 * aquí aunque no estén en la lista de Usuarios). Desconectar revoca el grant
 * en Google y borra los tokens; los hilos ya sincronizados se conservan.
 *
 * `alwaysShow`: en la página de configuración de Gmail se muestra siempre
 * (loading / vacío / lista) para que la sección se vea igual que Drive/Calendar.
 */
export function GmailAccountsManager({
  alwaysShow = false,
}: {
  alwaysShow?: boolean;
} = {}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/gmail/accounts");
      if (!res.ok) {
        setAccounts([]);
        return;
      }
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
    if (!(await confirmDialog({
      description: `¿Desconectar ${acc.email}? Se cortará la sincronización de esta casilla.`,
      confirmLabel: "Desconectar",
    }))) {
      return;
    }
    setBusy(acc.id);
    try {
      const res = await fetch(`/api/crm/gmail/accounts?id=${encodeURIComponent(acc.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          upstreamRevoked?: boolean;
        } | null;
        // La desconexión local procede aunque Google falle; avisar para que el
        // permiso pueda retirarse a mano en myaccount.google.com/permissions.
        if (data && data.upstreamRevoked === false) {
          toast.warning(
            `${acc.email} quedó desconectada de OPAI, pero no se pudo revocar el acceso en Google. ` +
              "Revocá el acceso de OPAI manualmente en myaccount.google.com/permissions (cuenta del dueño de la casilla).",
          );
        }
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  if (!alwaysShow && (!accounts || accounts.length === 0)) return null;

  const count = accounts?.length ?? 0;

  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3">
      <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
        Casillas de correo del equipo{accounts ? ` (${count})` : ""}
      </p>
      <p className="mb-2 text-[12px] text-ds-text-4">
        Cuentas de Gmail conectadas a este espacio. Desconectá las que ya no uses.
      </p>
      {accounts === null ? (
        <div className="flex items-center gap-2 px-2 py-3 text-[13px] text-ds-text-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando casillas…
        </div>
      ) : count === 0 ? (
        <p className="px-2 py-2 text-[13px] text-ds-text-3">
          Todavía no hay casillas Gmail conectadas.
        </p>
      ) : (
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
                {acc.ownerEmail && acc.ownerEmail !== acc.email && (
                  <span className="ml-1 text-[12px] text-ds-text-4">
                    dueño: {acc.ownerEmail}
                  </span>
                )}
              </span>
              {acc.status === "active" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 shrink-0 text-status-danger-fg sm:h-8"
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
      )}
    </div>
  );
}
