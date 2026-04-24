"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Search,
  LayoutDashboard,
  MapPin,
  UserCheck,
  Users,
  Ticket,
  BarChart3,
  BookOpen,
  Eye,
  Building2,
  User,
  FileText,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  MapPin,
  UserCheck,
  Users,
  Ticket,
  BarChart3,
  BookOpen,
  Eye,
};

type ResultType = "section" | "instalacion" | "guardia" | "ticket" | "reporte";

interface ResultItem {
  type: ResultType;
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  hint?: string;
  status?: string;
}

interface SearchResponse {
  sections: ResultItem[];
  instalaciones: ResultItem[];
  guardias: ResultItem[];
  tickets: ResultItem[];
  reportes: ResultItem[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateSection: (section: string) => void;
  onSelectInstallation?: (id: string) => void;
}

export function PortalCommandPalette({
  open,
  onOpenChange,
  onNavigateSection,
  onSelectInstallation,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(
        `/api/portal/cliente/search?q=${encodeURIComponent(query)}&limit=12`,
      )
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setData(res.data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("[CommandPalette] search error:", err);
          setLoading(false);
        });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const groups = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Secciones", items: data.sections },
      { label: "Instalaciones", items: data.instalaciones },
      { label: "Guardias", items: data.guardias },
      { label: "Tickets", items: data.tickets },
      { label: "Reportes", items: data.reportes },
    ].filter((g) => g.items.length > 0);
  }, [data]);

  function handleSelect(item: ResultItem) {
    onOpenChange(false);
    if (item.type === "section") {
      onNavigateSection(item.id);
    } else if (item.type === "instalacion") {
      if (onSelectInstallation) onSelectInstallation(item.id);
      onNavigateSection("instalacion-detalle");
    } else if (item.type === "guardia") {
      router.push(`/portal/cliente/guardia/${item.id}`);
    } else if (item.type === "ticket") {
      onNavigateSection("tickets");
    } else if (item.type === "reporte") {
      onNavigateSection("reportes");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 pt-[10vh]"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
      >
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800">
            <Search className="h-4 w-4 text-zinc-500" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar secciones, guardias, instalaciones, tickets..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
              autoFocus
            />
            <kbd className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
              Esc
            </kbd>
          </div>
          <Command.List className="max-h-[50vh] overflow-y-auto p-1">
            {loading && (
              <div className="text-xs text-zinc-500 px-3 py-2">Buscando...</div>
            )}
            {!loading && groups.length === 0 && (
              <Command.Empty className="text-xs text-zinc-500 px-3 py-4 text-center">
                Sin resultados
              </Command.Empty>
            )}
            {groups.map((g) => (
              <Command.Group
                key={g.label}
                heading={g.label}
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {g.items.map((item) => {
                  const Icon =
                    item.type === "section"
                      ? (ICONS[item.icon ?? ""] ?? LayoutDashboard)
                      : item.type === "instalacion"
                        ? Building2
                        : item.type === "guardia"
                          ? User
                          : item.type === "ticket"
                            ? Ticket
                            : FileText;
                  return (
                    <Command.Item
                      key={`${item.type}_${item.id}`}
                      value={`${item.type}_${item.id}_${item.title}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center gap-3 px-2 py-2 rounded cursor-pointer text-sm data-[selected=true]:bg-zinc-800"
                    >
                      <Icon className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{item.title}</p>
                        {(item.subtitle || item.hint) && (
                          <p className="text-[11px] text-zinc-500 truncate">
                            {item.subtitle || item.hint}
                          </p>
                        )}
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
