/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Star, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-service";
import {
  AVAILABLE_MAILBOX_COLORS,
  MAX_DISPLAY_LABEL_LENGTH,
  type MailboxColorKey,
} from "@/modules/crm/email/mailbox-identity";
import { tintSoft } from "@/components/crm/correos/mailbox-tints";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Account = {
  id: string;
  email: string;
  status: string;
  updatedAt: string;
  color?: string | null;
  displayLabel?: string | null;
  isDefault?: boolean;
  sortIndex?: number;
  /** Email del dueño de la casilla; solo presente para Owner/Admin. */
  ownerEmail?: string | null;
  userId?: string;
  /** true si la casilla pertenece al usuario de sesión (editable). */
  isOwn?: boolean;
};

/**
 * Lista las casillas Gmail propias del usuario; Owner/Admin ven todas las del
 * tenant (con el email del dueño) y pueden desconectar cualquiera. El dueño
 * puede editar color, etiqueta y marcar por defecto.
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

  const patchOwn = async (
    id: string,
    body: { color?: string; displayLabel?: string; isDefault?: boolean },
  ) => {
    setBusy(id);
    try {
      const res = await fetch("/api/crm/gmail/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) {
        toast.error("No se pudo actualizar la casilla");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

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
        Cuentas de Gmail conectadas a este espacio. Color y etiqueta identifican
        cada casilla en la bandeja unificada.
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
          {accounts.map((acc) => {
            const color = acc.color ?? "teal";
            const label = acc.displayLabel ?? "Mail";
            // PATCH solo lo acepta el dueño; Owner/Admin ven casillas ajenas
            // solo para desconectar — sin editar identidad.
            const canEditIdentity = acc.status === "active" && acc.isOwn !== false;
            return (
              <li
                key={acc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 text-[13px]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {canEditIdentity ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Color de ${acc.email}`}
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold ds-tap sm:h-8 sm:w-8 ${tintSoft(color)}`}
                          disabled={busy === acc.id}
                        >
                          {label.slice(0, 2).toUpperCase()}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto border-ds-border-default bg-ds-surface-1 p-2">
                        <div className="grid grid-cols-3 gap-1.5">
                          {AVAILABLE_MAILBOX_COLORS.map((key: MailboxColorKey) => (
                            <button
                              key={key}
                              type="button"
                              aria-label={key}
                              onClick={() => void patchOwn(acc.id, { color: key })}
                              className={`h-10 w-10 rounded-lg ds-tap ${tintSoft(key)} ${
                                color === key ? "ring-2 ring-primary" : ""
                              }`}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold ${tintSoft(color)}`}
                    >
                      {label.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{acc.email}</span>
                      <Badge variant={acc.status === "active" ? "success" : "secondary"}>
                        {acc.status === "active" ? "activa" : "desconectada"}
                      </Badge>
                      {acc.isDefault && (
                        <Badge variant="secondary">por defecto</Badge>
                      )}
                    </div>
                    {canEditIdentity && acc.status === "active" ? (
                      <Input
                        aria-label="Etiqueta corta"
                        defaultValue={label}
                        maxLength={MAX_DISPLAY_LABEL_LENGTH}
                        className="mt-1 h-10 max-w-[8rem] text-[12px] sm:h-9"
                        onBlur={(e) => {
                          const next = e.target.value.trim().slice(0, MAX_DISPLAY_LABEL_LENGTH);
                          if (next && next !== label) {
                            void patchOwn(acc.id, { displayLabel: next });
                          }
                        }}
                      />
                    ) : (
                      <span className="text-[12px] text-ds-text-4">{label}</span>
                    )}
                    {acc.ownerEmail && acc.ownerEmail !== acc.email && (
                      <span className="block text-[12px] text-ds-text-4">
                        dueño: {acc.ownerEmail}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canEditIdentity && acc.status === "active" && !acc.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 sm:h-8"
                      onClick={() => void patchOwn(acc.id, { isDefault: true })}
                      disabled={busy === acc.id}
                      title="Marcar como casilla por defecto"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
