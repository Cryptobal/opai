"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type TableSortDir = "asc" | "desc";

export function SortableColumnHeader<T extends string>({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: T;
  sortField: T;
  sortDir: TableSortDir;
  onSort: (field: T) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = sortField === field;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSort(field);
      }}
      className={cn(
        "inline-flex items-center gap-1 hover:text-ds-text-1 transition-colors",
        align === "right" && "flex-row-reverse ml-auto",
        align === "center" && "mx-auto",
      )}
    >
      <span>{label}</span>
      {isActive ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function toggleTableSort<T extends string>(
  field: T,
  currentField: T,
  currentDir: TableSortDir,
  defaultDirForField: (field: T) => TableSortDir,
): { field: T; dir: TableSortDir } {
  if (currentField === field) {
    return { field, dir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { field, dir: defaultDirForField(field) };
}
