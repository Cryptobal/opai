"use client";

/**
 * CostCenterEditor — popover para asignar/editar el centro de costo
 * (cliente CRM + instalación) de un DTE existente. Se usa inline en la
 * lista de DTEs Recibidos y Emitidos.
 *
 * Comportamiento:
 *   - Click en el badge muestra el popover con búsqueda de cliente y
 *     dropdown de instalaciones (filtradas por cliente).
 *   - Al guardar, llama PATCH /api/finance/billing/dte/[id]/cost-center
 *     y dispara onChange con los nuevos valores para refrescar la lista
 *     sin recargar la página completa.
 *   - "Quitar asignación" desasigna ambos campos.
 */

import { useState, useEffect } from "react";
import { Search, Building, MapPin, X, Loader2, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface AccountSearchResult {
  id: string;
  name: string;
  displayName: string;
  rut: string;
}

interface InstallationOption {
  id: string;
  name: string;
  commune: string | null;
}

interface Props {
  dteId: string;
  /** Nombre actual del cliente asignado (mostrar). */
  currentAccountName?: string | null;
  currentAccountId?: string | null;
  currentInstallationName?: string | null;
  currentInstallationId?: string | null;
  /** Callback al guardar exitosamente. */
  onChange: (next: {
    crmAccountId: string | null;
    installationId: string | null;
    accountName?: string | null;
    installationName?: string | null;
  }) => void;
  /** Si false, solo lectura (sin abrir popover). */
  canEdit?: boolean;
  /**
   * RUT del receptor del DTE. Si se pasa, la búsqueda de clientes solo
   * devuelve cuentas con ese RUT. Útil en DTEs EMITIDOS donde el centro
   * de costo debe ser el mismo cliente al que se facturó. Si no se pasa,
   * el editor permite buscar cualquier cliente (uso típico: DTE recibido).
   */
  restrictToRut?: string | null;
}

export function CostCenterEditor({
  dteId,
  currentAccountName,
  currentAccountId,
  currentInstallationName,
  currentInstallationId,
  onChange,
  canEdit = true,
  restrictToRut,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AccountSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    currentAccountId ?? null,
  );
  const [selectedAccountName, setSelectedAccountName] = useState<string | null>(
    currentAccountName ?? null,
  );
  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(
    currentInstallationId ?? null,
  );
  const [selectedInstallationName, setSelectedInstallationName] = useState<string | null>(
    currentInstallationName ?? null,
  );
  const [saving, setSaving] = useState(false);

  // Reset cuando cambian props externos (ej: refresh de lista).
  useEffect(() => {
    setSelectedAccountId(currentAccountId ?? null);
    setSelectedAccountName(currentAccountName ?? null);
    setSelectedInstallationId(currentInstallationId ?? null);
    setSelectedInstallationName(currentInstallationName ?? null);
  }, [currentAccountId, currentAccountName, currentInstallationId, currentInstallationName]);

  // Búsqueda de clientes con debounce. Si restrictToRut está, agregamos
  // el filtro al backend para que solo devuelva cuentas con ese RUT exacto.
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        params.set("q", query);
        params.set("limit", "15");
        if (restrictToRut) params.set("rut", restrictToRut);
        const res = await fetch(
          `/api/finance/billing/customer-search?${params.toString()}`,
          { signal: ctrl.signal },
        );
        const json = await res.json();
        if (json?.success && Array.isArray(json.data)) setAccounts(json.data);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open, restrictToRut]);

  // Auto-seleccionar la única cuenta cuando hay restricción de RUT y aún
  // no hay nada seleccionado (evita un click de UX cuando solo hay 1 match).
  useEffect(() => {
    if (!open || !restrictToRut || selectedAccountId) return;
    if (accounts.length === 1) {
      const a = accounts[0];
      setSelectedAccountId(a.id);
      setSelectedAccountName(a.name);
    }
  }, [open, restrictToRut, accounts, selectedAccountId]);

  // Cargar instalaciones cuando cambia el cliente seleccionado.
  useEffect(() => {
    if (!selectedAccountId) {
      setInstallations([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(
      `/api/finance/billing/customer-installations?accountId=${selectedAccountId}`,
      { signal: ctrl.signal },
    )
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j.data)) setInstallations(j.data);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [selectedAccountId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/billing/dte/${dteId}/cost-center`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crmAccountId: selectedAccountId,
          installationId: selectedInstallationId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      onChange({
        crmAccountId: selectedAccountId,
        installationId: selectedInstallationId,
        accountName: selectedAccountName,
        installationName: selectedInstallationName,
      });
      toast.success("Centro de costo actualizado");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/billing/dte/${dteId}/cost-center`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmAccountId: null, installationId: null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      onChange({ crmAccountId: null, installationId: null, accountName: null, installationName: null });
      setSelectedAccountId(null);
      setSelectedAccountName(null);
      setSelectedInstallationId(null);
      setSelectedInstallationName(null);
      toast.success("Centro de costo desasignado");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Visualización del badge actual (con o sin asignación).
  // Usa el estado interno (selectedAccountName/selectedInstallationName) en vez
  // de los props para que la UI refleje el cambio inmediatamente después de
  // guardar, sin esperar a que el padre refresque su estado.
  const display = selectedAccountName ? (
    <div className="flex items-center gap-1.5 min-w-0">
      <Building className="h-3.5 w-3.5 shrink-0 text-status-info-fg" />
      <span className="truncate text-[13px] font-medium text-ds-text-1">
        {selectedAccountName}
      </span>
      {selectedInstallationName && (
        <>
          <span className="text-ds-text-3 shrink-0">·</span>
          <MapPin className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
          <span className="truncate text-[13px] text-ds-text-2">
            {selectedInstallationName}
          </span>
        </>
      )}
    </div>
  ) : (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ds-text-3">
      <Plus className="h-3 w-3" />
      Vincular cliente / instalación
    </span>
  );

  if (!canEdit) {
    // Read-only: si no hay asignación, mostrar "Sin asignar" en estado neutral
    // (sin CTA porque el usuario no puede editar).
    if (!selectedAccountName) {
      return (
        <div className="px-2 py-1.5 text-[12px] text-ds-text-3">Sin asignar</div>
      );
    }
    return <div className="px-2 py-1.5">{display}</div>;
  }

  // Editable: el botón cambia visualmente según haya asignación o no.
  // Sin asignación: borde dasheado + hover suave → señaliza CTA.
  // Con asignación: chip lleno con hover sutil → señaliza editable.
  const triggerClass = selectedAccountName
    ? "flex items-center gap-1 text-left rounded-md px-2.5 py-1.5 hover:bg-muted/50 transition-colors max-w-full w-full border border-transparent"
    : "flex items-center gap-1 text-left rounded-md px-2.5 py-1.5 hover:bg-status-info-soft/40 hover:text-status-info-fg transition-colors max-w-full w-full border border-dashed border-ds-border-default";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          onClick={(e) => e.stopPropagation()}
          aria-label={
            currentAccountName ? "Editar cliente / instalación" : "Vincular cliente / instalación"
          }
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Cliente / Instalación</p>
            {(selectedAccountId || selectedInstallationId) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={saving}
                className="h-7 text-xs text-destructive"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Quitar
              </Button>
            )}
          </div>

          {restrictToRut && (
            <p className="text-[12px] text-muted-foreground">
              Solo se muestra el cliente con RUT <span className="font-mono">{restrictToRut}</span>.
              Para facturas de venta el centro de costo debe ser el mismo cliente al que se facturó —
              lo único que cambia por DTE es la instalación.
            </p>
          )}

          {/* Selección de cliente */}
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente</Label>
            {selectedAccountName ? (
              <Card className="p-2 bg-status-ok-soft border-status-ok-border flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">
                  {selectedAccountName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    setSelectedAccountId(null);
                    setSelectedAccountName(null);
                    setSelectedInstallationId(null);
                    setSelectedInstallationName(null);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </Card>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Buscar cliente por nombre o RUT…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                {searching ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2 text-center">
                    {query
                      ? "Sin resultados"
                      : "Empezá a escribir para buscar…"}
                  </p>
                ) : (
                  <ul className="max-h-[180px] overflow-y-auto space-y-0.5 border border-border rounded-md p-1">
                    {accounts.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAccountId(a.id);
                            setSelectedAccountName(a.name);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 text-sm"
                        >
                          <div className="font-medium truncate">{a.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {a.rut}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Selección de instalación (solo si hay cliente) */}
          {selectedAccountId && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Instalación
                {installations.length === 0 && (
                  <span className="text-muted-foreground ml-1.5 font-normal">
                    (sin instalaciones)
                  </span>
                )}
              </Label>
              {installations.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  El cliente no tiene instalaciones registradas.
                </p>
              ) : (
                <ul className="max-h-[140px] overflow-y-auto space-y-0.5 border border-border rounded-md p-1">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInstallationId(null);
                        setSelectedInstallationName(null);
                      }}
                      className={
                        "w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 text-sm flex items-center gap-1.5 " +
                        (selectedInstallationId === null
                          ? "bg-muted/40 font-medium"
                          : "")
                      }
                    >
                      {selectedInstallationId === null && <Check className="h-3 w-3" />}
                      Sin instalación específica
                    </button>
                  </li>
                  {installations.map((inst) => (
                    <li key={inst.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInstallationId(inst.id);
                          setSelectedInstallationName(inst.name);
                        }}
                        className={
                          "w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 text-sm flex items-center gap-1.5 " +
                          (selectedInstallationId === inst.id
                            ? "bg-muted/40 font-medium"
                            : "")
                        }
                      >
                        {selectedInstallationId === inst.id && <Check className="h-3 w-3" />}
                        <span className="truncate flex-1">
                          {inst.name}
                          {inst.commune && (
                            <span className="text-muted-foreground"> · {inst.commune}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Guardar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
