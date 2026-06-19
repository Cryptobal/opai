/**
 * Selector de catálogo (puesto / cargo / rol) con creación y edición inline.
 *
 * - Puesto y Cargo: se pueden crear y renombrar desde el mismo dropdown
 *   (son texto). Persisten vía /api/cpq/{puestos|cargos} y refrescan el cache
 *   global de catálogos para que aparezcan en todos los selects.
 * - Rol (turno): NO se crea inline porque requiere patrón de trabajo/descanso;
 *   el botón "Crear/editar" lleva a la configuración de Roles / Turnos.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronsUpDown, Plus, Pencil, Check, X, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCpqCatalogs, refreshCpqCatalogs } from "@/lib/cpq/use-cpq-catalogs";

type Kind = "puesto" | "cargo" | "rol";

const API: Record<Kind, string> = {
  puesto: "/api/cpq/puestos",
  cargo: "/api/cpq/cargos",
  rol: "/api/cpq/roles",
};
const LABEL: Record<Kind, string> = { puesto: "Puesto", cargo: "Cargo", rol: "Rol" };

interface CatalogRecord {
  id: string;
  name: string;
  active?: boolean;
  colorHex?: string | null;
  description?: string | null;
}

interface Props {
  kind: Kind;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
}

export function CatalogPicker({ kind, value, onChange, disabled, triggerClassName }: Props) {
  const router = useRouter();
  const catalogs = useCpqCatalogs();
  const list = (kind === "puesto"
    ? catalogs.puestos
    : kind === "cargo"
      ? catalogs.cargos
      : catalogs.roles) as unknown as CatalogRecord[];

  const selected = list.find((o) => o.id === value);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const editable = kind !== "rol";

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch(API[kind], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "Error");
      await refreshCpqCatalogs();
      onChange(d.data.id);
      setCreating(false);
      setNewName("");
      setOpen(false);
      toast.success(`${LABEL[kind]} creado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (rec: CatalogRecord) => {
    const name = editName.trim();
    if (!name || name === rec.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name, active: rec.active ?? true };
      if (kind === "cargo") body.description = rec.description ?? null;
      if (rec.colorHex !== undefined) body.colorHex = rec.colorHex;
      const res = await fetch(`${API[kind]}/${rec.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "Error");
      await refreshCpqCatalogs();
      setEditingId(null);
      toast.success(`${LABEL[kind]} actualizado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCreating(false); setEditingId(null); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-1 rounded-md border border-border bg-card px-2 text-[13px] text-foreground disabled:opacity-60",
            triggerClassName
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.name ?? "—"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-1" align="start" sideOffset={4} collisionPadding={8}>
        <div className="max-h-[240px] overflow-y-auto">
          {list.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Sin opciones</p>
          )}
          {list.map((o) => (
            <div key={o.id} className="group flex items-center gap-1 rounded px-1">
              {editingId === o.id ? (
                <>
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(o);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 text-[13px]"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={busy} onClick={() => saveEdit(o)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { onChange(o.id); setOpen(false); }}
                    className={cn(
                      "flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/50",
                      o.id === value ? "font-semibold text-foreground" : "text-foreground"
                    )}
                  >
                    {o.id === value && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    <span className="flex-1 truncate">{o.name}</span>
                  </button>
                  {editable && !disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => { setEditingId(o.id); setEditName(o.name); }}
                      title="Renombrar"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {(kind === "rol" || !disabled) && (
          <div className="-mx-1 -mb-1 mt-1 flex items-center rounded-b-md border-t border-border bg-muted/40 px-1.5 py-1">
            {kind === "rol" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-status-info-fg"
                title="Crear / editar roles y turnos"
                aria-label="Crear / editar roles y turnos"
                onClick={() => { setOpen(false); router.push("/opai/configuracion/cpq?tab=roles"); }}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            ) : creating ? (
              <div className="flex w-full items-center gap-1">
                <Input
                  autoFocus
                  value={newName}
                  placeholder={`Nuevo ${LABEL[kind].toLowerCase()}…`}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  className="h-8 flex-1 text-[13px]"
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={busy || !newName.trim()} onClick={create}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setCreating(false); setNewName(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-status-info-fg"
                title={`Crear nuevo ${LABEL[kind].toLowerCase()}`}
                aria-label={`Crear nuevo ${LABEL[kind].toLowerCase()}`}
                onClick={() => setCreating(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
