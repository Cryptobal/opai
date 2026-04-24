"use client";

import { Search } from "lucide-react";

export type EquipoFiltro =
  | "todos"
  | "os10_vigente"
  | "os10_por_vencer"
  | "os10_vencido"
  | "docs_vencidos";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  filtro: EquipoFiltro;
  onFiltro: (f: EquipoFiltro) => void;
}

const OPTIONS: { value: EquipoFiltro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "os10_vigente", label: "OS-10 vigente" },
  { value: "os10_por_vencer", label: "OS-10 por vencer" },
  { value: "os10_vencido", label: "OS-10 vencido" },
  { value: "docs_vencidos", label: "Con docs vencidos" },
];

export function EquipoFiltros({ query, onQuery, filtro, onFiltro }: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-4">
      <div className="relative flex-1">
        <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar guardia..."
          className="w-full rounded-lg bg-zinc-800/50 border border-zinc-700 pl-9 pr-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-400"
        />
      </div>
      <select
        value={filtro}
        onChange={(e) => onFiltro(e.target.value as EquipoFiltro)}
        className="rounded-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
