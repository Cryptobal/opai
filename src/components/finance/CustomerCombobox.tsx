"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  X,
  MapPin,
  Mail,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export interface CustomerOption {
  id: string;
  name: string;
  displayName: string;
  rut: string;
  email: string | null;
  address: string | null;
  commune: string | null;
  city: string | null;
  /**
   * Giro / actividad económica formal del cliente (ej. "Servicios de
   * seguridad y vigilancia"). El SII lo exige en <Receptor> de facturas
   * 33/34. Si el CRM lo tiene cargado, se autocompleta al receptor del
   * DTE; si está vacío, el usuario puede tipear o queda con default.
   */
  giro: string | null;
  /**
   * Sector / actividad comercial interna del CRM (ej. "Retail", "Salud",
   * "Construcción"). NO va al SII directamente — sirve como fallback para
   * autocompletar el campo "Giro / Actividad" del receptor cuando el
   * cliente todavía no tiene `giro` cargado en la ficha CRM.
   */
  industry: string | null;
}

interface Props {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  /** Si el usuario ingresó datos manualmente (sin elegir cliente CRM) */
  manualRut?: string;
  manualName?: string;
  manualEmail?: string;
  onManualChange?: (field: "rut" | "name" | "email", value: string) => void;
}

export function CustomerCombobox({
  value,
  onChange,
  manualRut = "",
  manualName = "",
  manualEmail = "",
  onManualChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Si el usuario alterna explícitamente entre manual y búsqueda, dejamos
  // de auto-abrir la vista manual aunque haya datos manuales precargados.
  const userToggledRef = useRef(false);

  // Auto-mostrar la vista de ingreso manual cuando se hidratan datos del
  // receptor sin un cliente CRM asociado (típico al abrir un borrador con
  // RUT ingresado manualmente). Sin esto, el componente quedaba en la
  // vista vacía "Buscar cliente del CRM…" ocultando la data del borrador.
  useEffect(() => {
    if (userToggledRef.current) return;
    if (value) return;
    if (manualRut || manualName || manualEmail) {
      setShowManual(true);
    }
  }, [value, manualRut, manualName, manualEmail]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/finance/billing/customer-search?q=${encodeURIComponent(q)}&limit=20`,
      );
      const body = await res.json();
      if (body.success) setResults(body.data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, search]);

  if (value) {
    return (
      <Card className="bg-status-ok-soft border-status-ok-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-status-ok-soft text-status-ok-fg flex items-center justify-center shrink-0 font-bold text-sm">
              {value.name
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0] ?? "")
                .join("")
                .toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-ds-text-1 truncate">
                {value.name}
              </div>
              <div className="text-[12px] text-ds-text-3 font-mono">
                {value.rut || "Sin RUT"}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[12px] text-ds-text-2">
                {value.email && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Mail className="h-3 w-3 text-ds-text-3 shrink-0" />
                    <span className="truncate">{value.email}</span>
                  </div>
                )}
                {(value.address || value.commune) && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 text-ds-text-3 shrink-0" />
                    <span className="truncate">
                      {[value.address, value.commune].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Cambiar cliente: en plantillas recurrentes a veces hay que
                reemplazar el receptor sin "quitar primero". Limpia el
                value (vuelve al combobox de búsqueda) y abre el dropdown
                en un solo click. Marcamos `userToggledRef` para que el
                effect que auto-muestra la vista manual (cuando hay
                manualRut/Name/Email residuales) NO intercepte y mande
                al input manual. */}
            <button
              type="button"
              onClick={() => {
                userToggledRef.current = true;
                setShowManual(false);
                onChange(null);
                setOpen(true);
              }}
              className="text-ds-text-3 hover:text-ds-text-1 p-1.5 rounded-md hover:bg-ds-surface-2 inline-flex items-center gap-1 text-[11px]"
              aria-label="Cambiar cliente"
              title="Cambiar cliente"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cambiar</span>
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-ds-text-3 hover:text-ds-text-1 p-1 rounded-md hover:bg-ds-surface-2"
              aria-label="Quitar cliente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (showManual) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-ds-text-3">Ingreso manual</span>
          <button
            type="button"
            onClick={() => {
              userToggledRef.current = true;
              setShowManual(false);
            }}
            className="text-status-ok-fg hover:opacity-80 font-medium"
          >
            Buscar en CRM
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-[12px] text-ds-text-3 mb-1 block">RUT *</label>
            <input
              value={manualRut}
              onChange={(e) => onManualChange?.("rut", e.target.value)}
              placeholder="12.345.678-9"
              className="w-full bg-ds-surface-2 border border-ds-border-default hover:border-ds-border-strong focus:border-status-ok-border outline-none rounded-lg h-10 sm:h-9 px-3 text-sm text-ds-text-1"
            />
          </div>
          <div>
            <label className="text-[12px] text-ds-text-3 mb-1 block">
              Razón Social *
            </label>
            <input
              value={manualName}
              onChange={(e) => onManualChange?.("name", e.target.value)}
              className="w-full bg-ds-surface-2 border border-ds-border-default hover:border-ds-border-strong focus:border-status-ok-border outline-none rounded-lg h-10 sm:h-9 px-3 text-sm text-ds-text-1"
            />
          </div>
          <div>
            <label className="text-[12px] text-ds-text-3 mb-1 block">Email</label>
            <input
              type="email"
              value={manualEmail}
              onChange={(e) => onManualChange?.("email", e.target.value)}
              className="w-full bg-ds-surface-2 border border-ds-border-default hover:border-ds-border-strong focus:border-status-ok-border outline-none rounded-lg h-10 sm:h-9 px-3 text-sm text-ds-text-1"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => search(""), 0);
        }}
        className="w-full bg-ds-surface-2 border-2 border-dashed border-ds-border-subtle hover:border-status-ok-border rounded-lg px-4 py-4 text-left transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ds-surface-3 group-hover:bg-status-ok-soft flex items-center justify-center transition-colors">
            <Search className="h-4 w-4 text-ds-text-3 group-hover:text-status-ok-fg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ds-text-1 flex items-center gap-2 flex-wrap">
              Buscar cliente del CRM…
              <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.08em] bg-status-ok-soft text-status-ok-fg border border-status-ok-border px-1.5 py-0.5 rounded-full font-medium">
                <Sparkles className="h-2.5 w-2.5" />
                Autocompletar
              </span>
            </div>
            <div className="text-[12px] text-ds-text-3 mt-0.5">
              Escribe nombre o RUT — completa razón social, email y dirección
              desde el CRM.
            </div>
          </div>
        </div>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          />
          <div className="absolute top-0 left-0 right-0 z-40 bg-ds-surface-1 border border-ds-border-default rounded-lg shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-ds-border-subtle flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-ds-text-3" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o RUT…"
                className="flex-1 bg-transparent outline-none text-sm text-ds-text-1 placeholder:text-ds-text-4"
              />
              {loading && (
                <Loader2 className="h-3.5 w-3.5 text-ds-text-3 animate-spin" />
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
                className="text-ds-text-3 hover:text-ds-text-1"
                aria-label="Cerrar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-72 overflow-auto">
              {!loading && results.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-ds-text-3">
                  {query ? "Sin resultados" : "Cargando clientes…"}
                  <button
                    type="button"
                    onClick={() => {
                      userToggledRef.current = true;
                      setOpen(false);
                      setShowManual(true);
                      setQuery("");
                    }}
                    className="block mx-auto mt-2 text-status-ok-fg hover:opacity-80 font-medium"
                  >
                    + Ingresar cliente manualmente
                  </button>
                </div>
              ) : (
                results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-ds-surface-2 border-b border-ds-border-subtle last:border-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-ds-text-1 truncate">
                          {c.name}
                        </div>
                        <div className="text-[12px] text-ds-text-3 font-mono">
                          {c.rut || "Sin RUT"}
                        </div>
                      </div>
                      <div className="text-[12px] text-ds-text-3 truncate hidden sm:block max-w-[180px]">
                        {[c.commune, c.city].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-ds-border-subtle p-2 flex items-center justify-between text-[12px]">
              <span className="text-ds-text-3 px-2">
                {results.length > 0 &&
                  `${results.length} cliente${results.length !== 1 ? "s" : ""}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  userToggledRef.current = true;
                  setOpen(false);
                  setShowManual(true);
                  setQuery("");
                }}
                className="text-status-ok-fg hover:opacity-80 font-medium px-2"
              >
                Ingresar manual
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
