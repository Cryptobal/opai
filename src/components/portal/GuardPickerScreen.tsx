"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, Search, User } from "lucide-react";
import { EmptyState, Spinner, Surface } from "@/components/opai-ds";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatRut, isValidRut } from "@/lib/guard-portal";

type Guard = {
  id: string;
  name: string;
  isTurnoExtra?: boolean;
};

interface Props {
  installationName: string;
  deviceToken: string;
  onGuardSelected: (guard: { id: string; name: string }) => void;
  onSkip?: () => void;
  guardsUrl?: string;
  setGuardUrl?: string;
  identifyUrl?: string;
}

export function GuardPickerScreen({
  installationName,
  deviceToken,
  onGuardSelected,
  onSkip,
  guardsUrl = "/api/devices/guards",
  setGuardUrl = "/api/devices/set-guard",
  identifyUrl = "/api/devices/identify-guard",
}: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [identifying, setIdentifying] = useState(false);

  const loadGuards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = debouncedQuery.trim();
      const url = q.length >= 2 ? `${guardsUrl}?q=${encodeURIComponent(q)}` : guardsUrl;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${deviceToken}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Error al cargar guardias");
      }
      const list = Array.isArray(json.data) ? json.data : [];
      setGuards(list);
    } catch (err) {
      setGuards([]);
      setError(err instanceof Error ? err.message : "Error al cargar guardias");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, deviceToken, guardsUrl]);

  useEffect(() => {
    void loadGuards();
  }, [loadGuards]);

  async function handleSelect(guard: Guard) {
    setSelecting(guard.id);
    setError(null);
    try {
      const res = await fetch(setGuardUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ guardId: guard.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error ?? "Error al seleccionar guardia");
      }
      onGuardSelected(guard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al seleccionar guardia");
      setSelecting(null);
    }
  }

  async function handleIdentify(e: FormEvent) {
    e.preventDefault();
    if (!isValidRut(rut) || pin.length < 4) {
      setError("Ingresa un RUT válido y tu PIN de 4 dígitos");
      return;
    }
    setIdentifying(true);
    setError(null);
    try {
      const res = await fetch(identifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ rut, pin }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "RUT o PIN incorrecto");
      }
      const data = json.data as { id: string; name: string };
      onGuardSelected({ id: data.id, name: data.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al identificar");
    } finally {
      setIdentifying(false);
    }
  }

  const searching = debouncedQuery.trim().length >= 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-ds-body font-medium text-ds-text-2">
          {installationName}
        </span>
      </div>

      <h1 className="font-display text-xl font-semibold text-ds-text-1">
        ¿Quién está de turno?
      </h1>
      <p className="mt-1 text-ds-body text-ds-text-3">
        Selecciona tu nombre o identifícate con RUT y PIN para continuar.
      </p>

      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca tu nombre"
          className="h-11 w-full rounded-full border border-ds-border-default bg-ds-surface-2 pl-10 pr-4 text-sm text-ds-text-1 placeholder:text-ds-text-4"
        />
      </label>

      {error && (
        <div className="mt-3 rounded-xl border border-status-danger-border bg-status-danger-soft px-4 py-3 text-ds-body text-status-danger-fg">
          {error}
        </div>
      )}

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Spinner size="lg" label="Cargando guardias" block />
          </div>
        ) : guards.length === 0 ? (
          <EmptyState
            icon={User}
            tone="warn"
            compact
            title={searching ? "Sin resultados" : "No hay guardias asignados"}
            description={
              searching
                ? "Prueba con otro nombre o identifícate con RUT y PIN."
                : "Esta instalación no tiene guardias en pauta. Busca tu nombre o ingresa con RUT y PIN."
            }
          />
        ) : (
          <ul className="ds-list-cascade flex flex-col gap-2 pb-2">
            {guards.map((guard) => (
              <li key={guard.id}>
                <button
                  type="button"
                  disabled={selecting !== null || identifying}
                  onClick={() => void handleSelect(guard)}
                  className="w-full text-left"
                >
                  <Surface
                    elevation={1}
                    padding="sm"
                    tappable
                    className="flex w-full items-center gap-3"
                  >
                    {selecting === guard.id ? (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <User className="h-5 w-5 shrink-0 text-ds-text-3" />
                    )}
                    <span className="min-w-0 flex-1 break-words text-sm font-medium text-ds-text-1">
                      {guard.name}
                    </span>
                    {guard.isTurnoExtra && (
                      <span className="shrink-0 rounded-full bg-status-warn-soft px-2 py-0.5 text-ds-caption font-medium text-status-warn-fg">
                        turno extra
                      </span>
                    )}
                  </Surface>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleIdentify}
        className="mt-4 border-t border-ds-border-subtle pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <p className="mb-3 text-ds-body font-medium text-ds-text-2">
          Identifícate con RUT y PIN
        </p>
        <label className="mb-1 block text-ds-caption font-medium text-ds-text-3">RUT</label>
        <input
          value={rut}
          onChange={(e) => setRut(formatRut(e.target.value))}
          placeholder="12.345.678-9"
          maxLength={12}
          inputMode="numeric"
          autoComplete="off"
          className="mb-3 h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-2 px-3.5 text-sm text-ds-text-1 placeholder:text-ds-text-4"
        />
        <label className="mb-1 block text-ds-caption font-medium text-ds-text-3">PIN</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          className="mb-3 h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-2 px-3.5 text-sm tracking-[0.3em] text-ds-text-1 placeholder:text-ds-text-4"
        />
        <button
          type="submit"
          disabled={identifying || selecting !== null || pin.length < 4}
          className="flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {identifying ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continuar"}
        </button>
        {onSkip && (
          <button
            type="button"
            disabled={identifying || selecting !== null}
            onClick={onSkip}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-ds-text-3"
          >
            Continuar sin seleccionar
          </button>
        )}
      </form>
    </div>
  );
}
