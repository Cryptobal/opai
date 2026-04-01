"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, MapPin, RefreshCw } from "lucide-react";

interface Installation {
  id: string;
  name: string;
  address: string;
}

interface InstallationSelectorProps {
  guardId: string;
  onSelect: (installation: Installation) => void;
}

export function InstallationSelector({ guardId, onSelect }: InstallationSelectorProps) {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchInstallations() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/guardia/installations?guardId=${encodeURIComponent(guardId)}`
      );

      if (!res.ok) {
        throw new Error("No se pudieron cargar las instalaciones.");
      }

      const data = await res.json();
      const list: Installation[] = Array.isArray(data)
        ? data
        : Array.isArray(data.installations)
          ? data.installations
          : [];

      setInstallations(list);

      // Auto-select if only one installation
      if (list.length === 1) {
        onSelect(list[0]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar instalaciones."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInstallations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardId]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#0A0F1C] px-5 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10">
          <Building2 className="h-6 w-6 text-cyan-400" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-white">
          Selecciona tu instalacion
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Elige la instalacion donde te encuentras trabajando hoy.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            <p className="text-sm text-gray-400">Cargando instalaciones...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchInstallations}
            className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-300 transition-colors active:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && installations.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-6 py-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">
              No tienes instalaciones asignadas.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Contacta a tu supervisor para que te asigne una instalacion.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchInstallations}
            className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-300 transition-colors active:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      )}

      {/* Installation cards */}
      {!loading && !error && installations.length > 0 && (
        <div className="space-y-3">
          {installations.map((inst) => (
            <button
              key={inst.id}
              type="button"
              onClick={() => onSelect(inst)}
              className="flex w-full items-start gap-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-left transition-colors active:border-cyan-500/40 active:bg-cyan-500/5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
                <Building2 className="h-5 w-5 text-cyan-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">{inst.name}</p>
                {inst.address && (
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-400">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{inst.address}</span>
                  </p>
                )}
              </div>
              <span className="mt-0.5 text-gray-500">&#8250;</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
