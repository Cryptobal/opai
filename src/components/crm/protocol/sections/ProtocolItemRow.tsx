"use client";

import { Pencil, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProtocolItem } from "./types";

type Props = {
  item: ProtocolItem;
  isEditing: boolean;
  editTitle: string;
  editDesc: string;
  setEditTitle: (v: string) => void;
  setEditDesc: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
};

export function ProtocolItemRow({
  item,
  isEditing,
  editTitle,
  editDesc,
  setEditTitle,
  setEditDesc,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: Props) {
  if (isEditing) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-2.5 space-y-2">
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Título"
          className="h-8 text-sm"
          autoFocus
        />
        <Textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Descripción"
          rows={2}
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={onSave}>
            <Save className="h-3 w-3 mr-1" />
            Guardar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onCancelEdit}
          >
            <X className="h-3 w-3 mr-1" />
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30">
      <span
        aria-hidden
        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40 group-hover:bg-primary/70"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">
          {item.title}
        </p>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onStartEdit}
          aria-label="Editar ítem"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-status-danger-fg"
          onClick={onDelete}
          aria-label="Eliminar ítem"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
