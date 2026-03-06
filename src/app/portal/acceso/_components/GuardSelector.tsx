"use client";

import { useEffect, useState } from "react";
import { Building2, User, Loader2, UserPlus } from "lucide-react";

interface Guard {
  id: string;
  name: string;
}

interface GuardSelectorProps {
  installationName: string;
  deviceToken: string;
  onGuardSelected: (guard: { id: string; name: string }) => void;
  onSkip: () => void;
}

export function GuardSelector({
  installationName,
  deviceToken,
  onGuardSelected,
  onSkip,
}: GuardSelectorProps) {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGuards() {
      try {
        const res = await fetch("/api/access-control/device/guards", {
          headers: { Authorization: `Bearer ${deviceToken}` },
        });
        if (!res.ok) throw new Error("Error al cargar guardias");
        const data = await res.json();
        setGuards(data.guards ?? data.data ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error al cargar guardias"
        );
      } finally {
        setLoading(false);
      }
    }
    fetchGuards();
  }, [deviceToken]);

  async function handleSelect(guard: Guard) {
    setSelecting(guard.id);
    setError(null);

    try {
      const res = await fetch("/api/access-control/device/set-guard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ guardId: guard.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Error al seleccionar guardia");
      }

      onGuardSelected(guard);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al seleccionar guardia"
      );
      setSelecting(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0A0F1C] px-6 py-10">
      {/* Installation name */}
      <div className="flex items-center gap-2 mb-8">
        <Building2 className="h-5 w-5 text-cyan-500 shrink-0" />
        <span className="text-sm font-medium text-gray-300 truncate">
          {installationName}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-white mb-6">
        ¿Quién está de turno?
      </h1>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Guard list */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            <p className="text-sm text-gray-400">Cargando guardias...</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {guards.map((guard) => (
            <button
              key={guard.id}
              type="button"
              disabled={selecting !== null}
              onClick={() => handleSelect(guard)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-700 bg-[#111827] px-4 py-4 text-left transition-colors hover:border-cyan-500/50 hover:bg-gray-800/80 active:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {selecting === guard.id ? (
                <Loader2 className="h-5 w-5 animate-spin text-cyan-500 shrink-0" />
              ) : (
                <User className="h-5 w-5 text-gray-400 shrink-0" />
              )}
              <span className="text-sm font-medium text-white">
                {guard.name}
              </span>
            </button>
          ))}

          {/* Skip / Other guard option */}
          <button
            type="button"
            disabled={selecting !== null}
            onClick={onSkip}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-700/50 bg-gray-900/50 px-4 py-4 text-left transition-colors hover:border-gray-600 hover:bg-gray-800/50 active:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <UserPlus className="h-5 w-5 text-gray-500 shrink-0" />
            <span className="text-sm text-gray-400">Otro guardia...</span>
          </button>
        </div>
      )}
    </div>
  );
}
