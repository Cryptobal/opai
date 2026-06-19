"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GridColKey =
  | "servicio" | "puesto" | "cargo" | "rol" | "horario"
  | "dias" | "guardias" | "ptos" | "costo" | "acciones";

// "servicio" es la columna flexible (no se renderiza su ancho fijo); su valor
// aquí solo es referencial. El resto son anchos fijos redimensionables.
const DEFAULTS: Record<GridColKey, number> = {
  servicio: 200, puesto: 148, cargo: 112, rol: 90, horario: 148,
  dias: 192, guardias: 84, ptos: 80, costo: 128, acciones: 56,
};

const MIN: Record<GridColKey, number> = {
  servicio: 150, puesto: 96, cargo: 84, rol: 70, horario: 130,
  dias: 60, guardias: 72, ptos: 70, costo: 110, acciones: 48,
};

// v3: reset de anchos guardados al pasar a tabla w-full con "Servicio" como
// columna flexible (la de acciones queda pegada a la derecha).
const STORAGE_KEY = "cpq-grid-col-widths-v3";

export function useGridColWidths() {
  const [widths, setWidths] = useState<Record<GridColKey, number>>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Record<GridColKey, number>>;
        setWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* noop */
    }
  }, []);

  const persist = useCallback((next: Record<GridColKey, number>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }, []);

  const setWidth = useCallback(
    (key: GridColKey, px: number) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: Math.max(MIN[key], Math.round(px)) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const reset = useCallback(() => {
    setWidths(DEFAULTS);
    persist(DEFAULTS);
  }, [persist]);

  // Estado vivo de arrastre (no re-renderiza por cada px hasta soltar).
  const dragRef = useRef<{ key: GridColKey; startX: number; startW: number } | null>(null);

  const onResizeStart = useCallback(
    (key: GridColKey, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { key, startX: e.clientX, startW: widths[key] };

      const move = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const px = Math.max(MIN[d.key], d.startW + (ev.clientX - d.startX));
        // Aplica directo al <col> para fluidez; el commit a estado va en up.
        const col = document.querySelector<HTMLTableColElement>(
          `col[data-colkey="${d.key}"]`
        );
        if (!col) return;
        // La tabla es w-full + table-fixed con "Servicio" como columna flexible
        // (sin ancho). Al fijar el ancho de esta columna, "Servicio" absorbe la
        // diferencia y la columna de acciones se mantiene pegada a la derecha.
        col.style.width = `${px}px`;
      };
      const up = (ev: MouseEvent) => {
        const d = dragRef.current;
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.style.userSelect = "";
        if (d) {
          const px = Math.max(MIN[d.key], d.startW + (ev.clientX - d.startX));
          setWidth(d.key, px);
        }
        dragRef.current = null;
      };

      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    },
    [widths, setWidth]
  );

  return { widths, setWidth, reset, onResizeStart };
}
