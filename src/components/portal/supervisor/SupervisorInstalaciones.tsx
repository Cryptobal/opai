"use client";

import { useEffect, useState } from "react";
import { MapPin, ChevronRight, Loader2, Search, Copy } from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Props {
  tenantInstallations: SupervisorInstallation[];
  onSelect: (installation: SupervisorInstallation) => void;
}

export function SupervisorInstalaciones({ tenantInstallations, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [allInstallations, setAllInstallations] = useState<SupervisorInstallation[]>(tenantInstallations);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/ops/supervision/installations");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.data)) {
            const apiMap = new Map<string, Record<string, unknown>>(
              json.data.map((i: { id: string }) => [i.id, i])
            );
            const merged = tenantInstallations.map((t) => {
              const api = apiMap.get(t.id);
              if (!api) return t;
              return {
                ...t,
                address: (api.address as string | null) ?? t.address,
                lat: (api.lat as number | null) ?? t.lat,
                lng: (api.lng as number | null) ?? t.lng,
                geoRadiusM: (api.geoRadiusM as number) ?? t.geoRadiusM,
              };
            });
            setAllInstallations(merged);
          }
        }
      } catch {
        // use tenantInstallations as-is
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantInstallations]);

  const filtered = allInstallations.filter((inst) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      inst.name.toLowerCase().includes(q) ||
      (inst.accountName ?? "").toLowerCase().includes(q) ||
      (inst.address ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <h2 className="text-lg font-semibold">Mis Instalaciones</h2>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar instalación..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MapPin size={24} />}
          title="Sin instalaciones"
          description={query ? "Intenta con otro término de búsqueda" : "No tienes instalaciones asignadas"}
          compact
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((inst) => (
            <InstallationCard key={inst.id} installation={inst} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstallationCard({
  installation,
  onSelect,
}: {
  installation: SupervisorInstallation;
  onSelect: (i: SupervisorInstallation) => void;
}) {
  return (
    <button
      onClick={() => onSelect(installation)}
      className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-left w-full"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
        <MapPin size={16} className="text-blue-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{installation.name}</p>
        <p className="text-xs text-zinc-500 truncate">{installation.accountName}</p>
        {installation.address && (
          <p className="text-xs text-zinc-600 truncate mt-0.5">{installation.address}</p>
        )}
        {installation.pairingCode && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(installation.pairingCode!);
            }}
            className="flex items-center gap-1 mt-1 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
            title="Copiar código de pareo"
          >
            <Copy size={10} />
            <span className="font-mono">{installation.pairingCode}</span>
          </span>
        )}
      </div>
      <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
    </button>
  );
}
