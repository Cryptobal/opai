"use client";

import { MoreVertical, Mailbox, Save, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * LeadOverflowMenu — menú «⋮» con acciones secundarias del lead.
 */
export interface LeadOverflowMenuProps {
  isEditable: boolean;
  canSendPresentation: boolean;
  savingLead: boolean;
  onSendPresentation: () => void;
  onSaveDraft: () => void;
  onDelete: () => void;
}

export function LeadOverflowMenu({
  isEditable,
  canSendPresentation,
  savingLead,
  onSendPresentation,
  onSaveDraft,
  onDelete,
}: LeadOverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Más acciones">
          <MoreVertical className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {isEditable && (
          <DropdownMenuItem onSelect={onSendPresentation} disabled={!canSendPresentation}>
            <Mailbox className="mr-2 h-4 w-4" aria-hidden />
            Enviar presentación
          </DropdownMenuItem>
        )}
        {isEditable && (
          <DropdownMenuItem onSelect={onSaveDraft} disabled={savingLead}>
            {savingLead ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
            Guardar en revisión
          </DropdownMenuItem>
        )}
        {isEditable && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
