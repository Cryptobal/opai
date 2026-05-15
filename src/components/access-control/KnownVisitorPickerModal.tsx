"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Search, Loader2, Check, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRut } from "@/lib/access-control/utils";
import type { ListType } from "@/lib/access-control/types";

interface KnownVisitor {
  rut: string;
  fullName: string;
  company: string | null;
  lastVisitAt: string | null;
  visitCount: number;
}

interface Props {
  installationId: string;
  listType: ListType;
  onClose: () => void;
  onImported: () => void;
}

export function KnownVisitorPickerModal({
  installationId,
  listType,
  onClose,
  onImported,
}: Props) {
  const [search, setSearch] = useState("");
  const [visitors, setVisitors] = useState<KnownVisitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const fetchVisitors = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = `/api/access-control/known-visitors/${installationId}?search=${encodeURIComponent(q)}&limit=100`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setVisitors(json.data ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchVisitors("");
  }, [fetchVisitors]);

  useEffect(() => {
    const t = setTimeout(() => fetchVisitors(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchVisitors]);

  const toggle = (rut: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rut)) next.delete(rut);
      else next.add(rut);
      return next;
    });

  const toggleAll = () => {
    if (selected.size === visitors.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visitors.map((v) => v.rut)));
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos una persona");
      return;
    }
    setImporting(true);
    try {
      const rows = visitors
        .filter((v) => selected.has(v.rut))
        .map((v) => ({
          rut: v.rut,
          fullName: v.fullName,
          company: v.company || undefined,
        }));

      const res = await fetch(`/api/access-control/lists/${installationId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, listType }),
      });
      const json = await res.json();
      if (json.success) {
        const { imported, errors } = json.data;
        toast.success(
          `${imported} persona(s) agregada(s)${errors.length > 0 ? ` · ${errors.length} error(es)` : ""}`,
        );
        onImported();
        onClose();
      } else {
        toast.error(json.error || "Error al importar");
      }
    } catch {
      toast.error("Error al importar");
    } finally {
      setImporting(false);
    }
  };

  const listLabel = listType === "whitelist" ? "lista blanca" : "lista negra";
  const allSelected = visitors.length > 0 && selected.size === visitors.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-status-ok-fg" />
            <span className="text-sm font-medium text-zinc-200">
              Agregar a {listLabel}
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-zinc-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, empresa o RUT..."
              className="pl-9 bg-zinc-800 border-zinc-600 h-9"
              autoFocus
            />
          </div>
          {visitors.length > 0 && (
            <button
              onClick={toggleAll}
              className="mt-2 text-xs text-status-info-fg hover:underline"
            >
              {allSelected ? "Deseleccionar todos" : `Seleccionar todos (${visitors.length})`}
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : visitors.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {search ? "Sin resultados para esa búsqueda" : "No hay visitantes registrados todavía"}
            </p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {visitors.map((v) => {
                const isSelected = selected.has(v.rut);
                return (
                  <button
                    key={v.rut}
                    type="button"
                    onClick={() => toggle(v.rut)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isSelected ? "bg-status-ok-soft" : "hover:bg-zinc-800"
                    }`}
                  >
                    <div
                      className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center ${
                        isSelected
                          ? "border-status-ok-fg bg-status-ok-fg"
                          : "border-zinc-600 bg-zinc-700"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-200 truncate">{v.fullName}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {formatRut(v.rut)}
                        {v.company && ` · ${v.company}`}
                        {` · ${v.visitCount} visita${v.visitCount !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-zinc-700">
          <span className="text-xs text-zinc-500">
            {selected.size > 0
              ? `${selected.size} seleccionada${selected.size !== 1 ? "s" : ""}`
              : "Ninguna seleccionada"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing || selected.size === 0}
            >
              {importing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Agregar {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
