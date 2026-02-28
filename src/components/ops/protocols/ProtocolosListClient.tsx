"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────

interface Installation {
  id: string;
  name: string;
  commune: string | null;
  isActive: boolean;
  _count: { protocolSections: number };
}

// ─── Component ───────────────────────────────────────────────

export function ProtocolosListClient() {
  const router = useRouter();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchInstallations = useCallback(async () => {
    try {
      setLoading(true);
      // Use the CRM installations API to get a list with protocol counts
      const res = await fetch("/api/crm/installations?includeProtocolCount=true&isActive=true");
      const json = await res.json();
      if (json.success) {
        setInstallations(json.data ?? []);
      }
    } catch {
      // Fallback: try basic installations list
      try {
        const res = await fetch("/api/crm/installations?isActive=true");
        const json = await res.json();
        if (json.success) {
          setInstallations(
            (json.data ?? []).map((i: Record<string, unknown>) => ({
              ...i,
              _count: { protocolSections: 0 },
            })),
          );
        }
      } catch {
        toast.error("Error al cargar instalaciones");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstallations();
  }, [fetchInstallations]);

  const filtered = installations.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.commune ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar instalación..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((inst) => (
          <button
            key={inst.id}
            onClick={() => router.push(`/crm/installations/${inst.id}?tab=protocolo`)}
            className="w-full border rounded-lg p-3 hover:bg-muted/30 transition-colors text-left flex items-center gap-3"
          >
            <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{inst.name}</div>
              {inst.commune && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {inst.commune}
                </div>
              )}
            </div>
            {inst._count?.protocolSections > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {inst._count.protocolSections} secciones
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Sin protocolo
              </Badge>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No se encontraron instalaciones.
          </div>
        )}
      </div>
    </div>
  );
}
