"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GridColKey =
  | "servicio" | "puesto" | "cargo" | "rol" | "horario"
  | "dias" | "guardias" | "ptos" | "costo" | "acciones";

// Anchos por defecto de cada columna. Todas son redimensionables de forma
// independiente (modelo Google Sheets); el doble clic en el separador devuelve
// la columna a su ancho por defecto (autoajuste).
const DEFAULTS: Record<GridColKey, number> = {
  servicio: 200, puesto: 148, cargo: 112, rol: 90, horario: 190,
  dias: 210, guardias: 88, ptos: 88, costo: 128, acciones: 56,
};

const MIN: Record<GridColKey, number> = {
  servicio: 150, puesto: 96, cargo: 84, rol: 70, horario: 130,
  dias: 60, guardias: 72, ptos: 70, costo: 110, acciones: 48,
};

// v6: horario en una fila (icono + horas), días en una fila, guard/ptos iguales.
const STORAGE_KEY = "cpq-grid-col-widths-v6";

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

  // Autoajuste de una sola columna (doble clic en el separador): vuelve a su
  // ancho por defecto, equivalente al "fit to content" de Google Sheets para
  // una grilla con controles de ancho conocido.
  const autoFitCol = useCallback(
    (key: GridColKey) => setWidth(key, DEFAULTS[key]),
    [setWidth]
  );

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
        col.style.width = `${px}px`;
        // Ancho de la tabla = suma de columnas. Lo recalculamos en vivo para que
        // solo cambie ESTA columna (las demás quedan fijas) y la tabla crezca o
        // encoja como en Google Sheets (con scroll horizontal si se desborda).
        const table = col.closest("table");
        if (table) {
          let total = 0;
          table
            .querySelectorAll<HTMLTableColElement>("col[data-colkey]")
            .forEach((c) => {
              total += parseFloat(c.style.width) || 0;
            });
          if (total > 0) table.style.width = `${total}px`;
        }
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

  return { widths, setWidth, reset, onResizeStart, autoFitCol };
}
