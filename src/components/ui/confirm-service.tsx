"use client";

/**
 * confirm-service — reemplazo imperativo de `window.confirm()` / `window.prompt()`
 * con diálogos del design system (glass en mobile, plano OPAI en desktop).
 *
 * Uso (en cualquier client component, sin montar nada local):
 *   import { confirmDialog, promptDialog } from "@/components/ui/confirm-service";
 *
 *   if (!(await confirmDialog({ description: "¿Eliminar este puesto?" }))) return;
 *   const motivo = await promptDialog({ description: "Motivo del rechazo:" });
 *   if (motivo === null) return; // canceló
 *
 * El host (<ConfirmHost/>) se monta una sola vez en el root layout, junto al
 * <Toaster/>, así cubre app + portales + plataforma + flujos públicos.
 *
 * Para avisos simples (antes `alert()`), usar `toast()` de sonner.
 */

import * as React from "react";
import { useSyncExternalStore } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ConfirmCheckOption {
  key: string;
  label: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  hint?: string;
}

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  /** Casillas opcionales (p. ej. «Eliminar también la instalación»). */
  checks?: ConfirmCheckOption[];
}

export type ConfirmDialogResult = {
  confirmed: boolean;
  checks: Record<string, boolean>;
};

export interface PromptOptions {
  title?: string;
  description?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Textarea en vez de input de una línea. */
  multiline?: boolean;
  /** Validación opcional: retornar string = mensaje de error; null/undefined = ok. */
  validate?: (value: string) => string | null | undefined;
}

type ConfirmRequest = {
  opts: ConfirmOptions;
  resolve: (result: ConfirmDialogResult) => void;
};
type PromptRequest = { opts: PromptOptions; resolve: (value: string | null) => void };

type State = { confirm: ConfirmRequest | null; prompt: PromptRequest | null };

let state: State = { confirm: null, prompt: null };
const SERVER_SNAPSHOT: State = { confirm: null, prompt: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setState(next: State) {
  state = next;
  emit();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getSnapshot = () => state;
const getServerSnapshot = () => SERVER_SNAPSHOT;

function emptyChecks(opts: ConfirmOptions): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  for (const c of opts.checks ?? []) {
    checks[c.key] = Boolean(c.defaultChecked) && !c.disabled;
  }
  return checks;
}

/**
 * Confirmación con casillas opcionales. Preferir esta API cuando el diálogo
 * necesita devolver estado de checks (p. ej. borrar instalación).
 */
export function confirmDialogDetailed(
  opts: ConfirmOptions,
): Promise<ConfirmDialogResult> {
  return new Promise<ConfirmDialogResult>((resolve) => {
    if (state.confirm) {
      state.confirm.resolve({ confirmed: false, checks: emptyChecks(state.confirm.opts) });
    }
    setState({ ...state, confirm: { opts, resolve } });
  });
}

/**
 * Muestra un diálogo de confirmación del DS. Resuelve `true` si el usuario
 * confirma, `false` si cancela o cierra. Reemplaza a `window.confirm()`.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return confirmDialogDetailed(opts).then((r) => r.confirmed);
}

/**
 * Muestra un diálogo de input del DS. Resuelve con el string ingresado, o
 * `null` si el usuario cancela. Reemplaza a `window.prompt()`.
 */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (state.prompt) state.prompt.resolve(null);
    setState({ ...state, prompt: { opts, resolve } });
  });
}

function PromptModal({ req }: { req: PromptRequest }) {
  const { opts, resolve } = req;
  const [value, setValue] = React.useState(opts.defaultValue ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const finish = (result: string | null) => {
    resolve(result);
    setState({ ...state, prompt: null });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = opts.validate?.(value);
    if (err) {
      setError(err);
      return;
    }
    finish(value);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) finish(null); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{opts.title ?? "Ingresar valor"}</DialogTitle>
            {opts.description ? (
              <DialogDescription>{opts.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {opts.multiline ? (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              placeholder={opts.placeholder}
              rows={4}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring opai-glass-control-m"
            />
          ) : (
            <Input
              autoFocus
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              placeholder={opts.placeholder}
            />
          )}
          {error ? (
            <p className="text-sm text-status-danger-fg">{error}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              {opts.cancelLabel ?? "Cancelar"}
            </Button>
            <Button type="submit">{opts.confirmLabel ?? "Aceptar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmWithChecks({ req }: { req: ConfirmRequest }) {
  const { opts, resolve } = req;
  const [checks, setChecks] = React.useState<Record<string, boolean>>(() =>
    emptyChecks(opts),
  );

  const finish = (confirmed: boolean) => {
    resolve({ confirmed, checks });
    setState({ ...state, confirm: null });
  };

  const checkList = opts.checks ?? [];
  const description = (
    <div className="space-y-3">
      {opts.description ? (
        typeof opts.description === "string" ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {opts.description}
          </p>
        ) : (
          opts.description
        )
      ) : null}
      {checkList.length > 0 ? (
        <div className="space-y-2 rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3">
          {checkList.map((c) => (
            <label
              key={c.key}
              className={`flex items-start gap-3 text-sm ${
                c.disabled ? "opacity-60" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={Boolean(checks[c.key])}
                disabled={c.disabled}
                onChange={(e) =>
                  setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))
                }
              />
              <span className="min-w-0">
                <span className="text-foreground">{c.label}</span>
                {c.hint ? (
                  <span className="mt-0.5 block text-[12px] text-ds-text-3">
                    {c.hint}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => {
        if (!o) finish(false);
      }}
      title={opts.title ?? "Confirmar acción"}
      description={description}
      confirmLabel={opts.confirmLabel ?? "Aceptar"}
      cancelLabel={opts.cancelLabel ?? "Cancelar"}
      variant={opts.variant ?? "default"}
      onConfirm={() => finish(true)}
    />
  );
}

/**
 * Host global de confirm/prompt imperativos. Montar UNA sola vez (root layout).
 */
export function ConfirmHost() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <>
      {snap.confirm ? <ConfirmWithChecks req={snap.confirm} /> : null}
      {snap.prompt ? <PromptModal req={snap.prompt} /> : null}
    </>
  );
}
