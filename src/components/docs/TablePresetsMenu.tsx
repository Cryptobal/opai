"use client";

import { type Editor } from "@tiptap/react";
import { TableIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { blankTable, eppTable, remunerationTable, workerDataTable } from "./table-presets";

export function TablePresetsMenu({ editor }: { editor: Editor }) {
  function insert(json: Record<string, unknown>) {
    editor.chain().focus().insertContent(json).run();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Insertar tabla"
          className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md text-ds-text-2 hover:bg-ds-surface-2"
        >
          <TableIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => insert(remunerationTable())}>
          Remuneración (filas condicionales)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => insert(workerDataTable())}>
          Datos del trabajador
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => insert(eppTable())}>Entrega EPP</DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          En blanco
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => insert(blankTable())} className="hidden">
          En blanco JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
