"use client";

import { useEffect, useState } from "react";
import { Users, Phone, Loader2, Search } from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Guard {
  id: string;
  firstName: string;
  lastName: string;
  rut: string | null;
  phone: string | null;
  puestoName: string;
  isExtraShift: boolean;
  status: string;
}

interface InstallationGroup {
  installationId: string;
  installationName: string;
  guards: Guard[];
}

interface Props {
  installations: SupervisorInstallation[];
}

export function SupervisorMiEquipo({ installations }: Props) {
  const [groups, setGroups] = useState<InstallationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedInstallationId, setSelectedInstallationId] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const url = selectedInstallationId
          ? `/api/portal/supervisor/mi-equipo?installationId=${selectedInstallationId}`
          : "/api/portal/supervisor/mi-equipo";
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setGroups(json.data ?? []);
        }
      } catch {
        // noop
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedInstallationId]);

  const totalGuards = groups.reduce((sum, g) => sum + g.guards.length, 0);

  const filteredGroups = groups
    .map((group) => ({
      ...group,
      guards: group.guards.filter((g) => {
        const q = query.toLowerCase();
        return (
          g.firstName.toLowerCase().includes(q) ||
          g.lastName.toLowerCase().includes(q) ||
          (g.rut ?? "").toLowerCase().includes(q)
        );
      }),
    }))
    .filter((group) => group.guards.length > 0);

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mi Equipo</h2>
        <span className="text-xs text-zinc-500 bg-zinc-900 px-2.5 py-1 rounded-full">
          {totalGuards} guardias
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar guardia..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Installation filter */}
      {installations.length > 1 && (
        <select
          value={selectedInstallationId}
          onChange={(e) => setSelectedInstallationId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas las instalaciones</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title="Sin guardias"
          description={query ? "Sin resultados para tu búsqueda." : "No hay guardias asignados."}
          compact
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredGroups.map((group) => (
            <InstallationGroupCard key={group.installationId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstallationGroupCard({ group }: { group: InstallationGroup }) {
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">{group.installationName}</span>
        <span className="text-xs text-zinc-500">{group.guards.length} guardias</span>
      </div>
      <div className="divide-y divide-zinc-800/50">
        {group.guards.map((g) => (
          <GuardRow key={`${g.id}-${g.isExtraShift}`} guard={g} />
        ))}
      </div>
    </div>
  );
}

function GuardRow({ guard }: { guard: Guard }) {
  const initials = `${guard.firstName[0] ?? ""}${guard.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200 truncate">
          {guard.firstName} {guard.lastName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-zinc-500 truncate">{guard.puestoName}</span>
          {guard.rut && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-[10px] text-zinc-600">{guard.rut}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {guard.isExtraShift && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
            TE
          </span>
        )}
        {guard.phone && (
          <a
            href={`tel:${guard.phone}`}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
