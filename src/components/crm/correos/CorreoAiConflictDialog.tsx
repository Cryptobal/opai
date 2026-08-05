"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { StructureEntityConflictsPayload } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  open: boolean;
  conflicts: StructureEntityConflictsPayload | null;
  busy?: boolean;
  onReuseOverwrite: (accountId?: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
};

const REASON_LABEL: Record<string, string> = {
  thread: "ya vinculado a este correo",
  rut: "mismo RUT",
  exact_name: "mismo nombre",
  similar_name: "nombre similar",
  email: "mismo email",
  name: "mismo nombre",
  similar_title: "título similar",
};

export function CorreoAiConflictDialog({
  open,
  conflicts,
  busy = false,
  onReuseOverwrite,
  onCreateNew,
  onCancel,
}: Props) {
  if (!conflicts) return null;

  const primaryAccount = conflicts.accounts[0];
  const otherAccounts = conflicts.accounts.slice(1);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="max-w-md gap-0 p-0 sm:rounded-2xl">
        <DialogHeader className="space-y-2 border-b border-ds-border-subtle px-4 py-4 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-warn-soft text-status-warn-fg">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="font-display text-[17px] text-ds-text-1">
                Ya existen registros similares
              </DialogTitle>
              <DialogDescription className="text-[13px] text-ds-text-3">
                Si volvés a crear, vas a duplicar. ¿Actualizamos los existentes con
                los datos del plan, o preferís crear registros nuevos?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4 py-3">
          {primaryAccount && (
            <ConflictBlock title="Cuenta">
              <p className="font-medium text-ds-text-1">{primaryAccount.name}</p>
              <p className="text-ds-text-3">
                {[primaryAccount.rut, REASON_LABEL[primaryAccount.reason]]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {otherAccounts.length > 0 && (
                <p className="mt-1 text-[12px] text-status-warn-fg">
                  También hay {otherAccounts.length} cuenta(s) parecida(s); se usará
                  la más cercana ({primaryAccount.name}).
                </p>
              )}
            </ConflictBlock>
          )}

          {conflicts.contacts.length > 0 && (
            <ConflictBlock title="Contactos">
              <ul className="space-y-1">
                {conflicts.contacts.map((c) => (
                  <li key={c.id}>
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "—"}
                    <span className="text-ds-text-4">
                      {" "}
                      · {REASON_LABEL[c.reason] ?? c.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </ConflictBlock>
          )}

          {conflicts.installations.length > 0 && (
            <ConflictBlock title="Instalaciones">
              <ul className="space-y-1">
                {conflicts.installations.map((i) => (
                  <li key={i.id}>
                    {i.name}
                    {i.address ? (
                      <span className="text-ds-text-4"> · {i.address}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ConflictBlock>
          )}

          {conflicts.deal && (
            <ConflictBlock title="Negocio">
              <p className="font-medium text-ds-text-1">{conflicts.deal.title}</p>
              <p className="text-ds-text-3">
                {REASON_LABEL[conflicts.deal.reason] ?? conflicts.deal.reason}
              </p>
            </ConflictBlock>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-ds-border-subtle px-4 py-3 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            disabled={busy}
            onClick={() => onReuseOverwrite(primaryAccount?.id)}
            className="h-11 w-full sm:h-10"
          >
            Actualizar existentes
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCreateNew}
            className="h-11 w-full sm:h-10"
          >
            Crear nuevos de todos modos
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
            className="h-11 w-full sm:h-10"
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConflictBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-[13px]">
      <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
        {title}
      </p>
      <div className="text-ds-text-2">{children}</div>
    </div>
  );
}
