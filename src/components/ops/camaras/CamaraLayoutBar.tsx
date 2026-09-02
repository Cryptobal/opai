"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LayoutDto } from "./types";
import { cn } from "@/lib/utils";

type Props = {
  layouts: LayoutDto[];
  activeId: string | null;
  onSelect: (layout: LayoutDto) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
};

export function CamaraLayoutBar({ layouts, activeId, onSelect, onCreate, onDelete }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {layouts.map((layout) => (
        <div key={layout.id} className="flex items-center">
          <button
            type="button"
            onClick={() => onSelect(layout)}
            className={cn(
              "h-11 rounded-ds-md border px-3 text-[13px]",
              activeId === layout.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-ds-border-default bg-ds-surface-2 text-ds-text-1",
            )}
          >
            {layout.name}
          </button>
          <button
            type="button"
            aria-label={`Eliminar ${layout.name}`}
            className="ml-1 inline-flex h-11 w-11 items-center justify-center text-ds-text-3"
            onClick={() => onDelete(layout.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const name = String(fd.get("name") ?? "").trim();
          if (name) {
            onCreate(name);
            e.currentTarget.reset();
          }
        }}
      >
        <Input name="name" placeholder="Nueva página" className="h-10 sm:h-9 w-36" />
        <Button type="submit" variant="outline" className="h-10 sm:h-9">
          <Plus className="h-4 w-4" />
          Guardar
        </Button>
      </form>
    </div>
  );
}
