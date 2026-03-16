"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPersonName } from "@/lib/personas";
import type { AsistenciaItem, GuardiaOption } from "@/types/ops-asistencia";

interface SheetBuscarGuardiaProps {
  open: boolean;
  onClose: () => void;
  item: AsistenciaItem | null;
  isDesktop: boolean;
  guardias: GuardiaOption[];
  filterGuardias: (query: string) => GuardiaOption[];
  onSelect: (guard: GuardiaOption) => void;
}

export function SheetBuscarGuardia({
  open,
  onClose,
  item,
  isDesktop,
  guardias,
  filterGuardias,
  onSelect,
}: SheetBuscarGuardiaProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => filterGuardias(search).filter((g) => g.id !== item?.plannedGuardiaId),
    [filterGuardias, search, item?.plannedGuardiaId]
  );

  const content = (
    <div className="space-y-3">
      <Input
        placeholder="Nombre, código, RUT…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-10"
        autoFocus
      />
      <ul className="max-h-[60vh] overflow-auto -mx-1">
        {filtered.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              className="w-full px-3 py-3 text-left text-sm hover:bg-muted active:bg-muted/80 rounded-md"
              onClick={() => {
                onSelect(g);
                setSearch("");
              }}
            >
              <span className="flex items-center gap-2">
                {formatPersonName(g.persona.firstName, g.persona.lastName)}
                {g.code && (
                  <span className="text-xs text-muted-foreground">({g.code})</span>
                )}
                {g.lifecycleStatus === "te" && (
                  <span className="inline-flex items-center rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                    TE
                  </span>
                )}
              </span>
              {g.persona.rut && (
                <span className="text-xs text-muted-foreground block mt-0.5">
                  {g.persona.rut}
                </span>
              )}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted-foreground">Sin resultados</li>
        )}
        {item?.plannedGuardiaId && (
          <li className="px-3 py-2 text-xs text-muted-foreground border-t border-border/60 mt-1">
            El guardia planificado no puede ser reemplazo.
          </li>
        )}
      </ul>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setSearch(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buscar guardia para reemplazo</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setSearch(""); } }}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Buscar guardia para reemplazo</SheetTitle>
        </SheetHeader>
        <div className="mt-4">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
