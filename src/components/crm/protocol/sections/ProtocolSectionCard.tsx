"use client";

import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProtocolItemRow } from "./ProtocolItemRow";
import {
  ProtocolAddItemAi,
  ProtocolAddItemManual,
} from "./ProtocolAddItemForm";
import type { ProtocolSection } from "./types";

type AddItemMode = "manual" | "ai" | null;

type Props = {
  section: ProtocolSection;
  expanded: boolean;
  onToggle: () => void;

  // Edit section header
  isEditingSection: boolean;
  editSectionTitle: string;
  editSectionIcon: string;
  setEditSectionTitle: (v: string) => void;
  setEditSectionIcon: (v: string) => void;
  onStartEditSection: () => void;
  onCancelEditSection: () => void;
  onSaveEditSection: () => void;

  // Section actions
  onTogglePortalVisible: () => void;
  onDeleteSection: () => void;

  // Item editing
  editingItemId: string | null;
  editItemTitle: string;
  editItemDesc: string;
  setEditItemTitle: (v: string) => void;
  setEditItemDesc: (v: string) => void;
  onStartEditItem: (itemId: string, title: string, desc: string) => void;
  onCancelEditItem: () => void;
  onSaveEditItem: (itemId: string) => void;
  onDeleteItem: (itemId: string, label: string) => void;

  // Add item
  addingItem: boolean;
  addItemMode: AddItemMode;
  onStartAddItem: (mode: "manual" | "ai") => void;
  onCancelAddItem: () => void;

  // Add item — manual props
  newItemTitle: string;
  newItemDesc: string;
  setNewItemTitle: (v: string) => void;
  setNewItemDesc: (v: string) => void;
  onSubmitItemManual: () => void;

  // Add item — IA props
  aiAvailable: boolean | null;
  aiItemDesc: string;
  setAiItemDesc: (v: string) => void;
  aiItemGenerating: boolean;
  aiItemResult: { title: string; description: string } | null;
  onAiItemGenerate: () => void;
  onAiItemRegenerate: () => void;
  onAiItemSave: () => void;
};

const ICON_RING =
  "from-primary/30 via-primary/10 to-transparent";

export function ProtocolSectionCard({
  section,
  expanded,
  onToggle,
  isEditingSection,
  editSectionTitle,
  editSectionIcon,
  setEditSectionTitle,
  setEditSectionIcon,
  onStartEditSection,
  onCancelEditSection,
  onSaveEditSection,
  onTogglePortalVisible,
  onDeleteSection,
  editingItemId,
  editItemTitle,
  editItemDesc,
  setEditItemTitle,
  setEditItemDesc,
  onStartEditItem,
  onCancelEditItem,
  onSaveEditItem,
  onDeleteItem,
  addingItem,
  addItemMode,
  onStartAddItem,
  onCancelAddItem,
  newItemTitle,
  newItemDesc,
  setNewItemTitle,
  setNewItemDesc,
  onSubmitItemManual,
  aiAvailable,
  aiItemDesc,
  setAiItemDesc,
  aiItemGenerating,
  aiItemResult,
  onAiItemGenerate,
  onAiItemRegenerate,
  onAiItemSave,
}: Props) {
  const isHidden = section.portalVisible === false;

  return (
    <Card
      className={`relative overflow-hidden border-border/60 bg-card/60 transition-colors ${
        expanded ? "border-primary/30 bg-card" : "hover:border-border"
      }`}
    >
      {/* Borde izquierdo decorativo */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b ${ICON_RING}`}
      />

      <CardHeader className="p-3">
        <div className="flex items-center gap-2">
          {/* Toggle + icono + título */}
          <button
            type="button"
            onClick={onToggle}
            className="flex flex-1 min-w-0 items-center gap-2.5 text-left"
            aria-expanded={expanded}
          >
            <span className="text-muted-foreground shrink-0 transition-transform">
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>

            {isEditingSection ? (
              <div
                className="flex flex-1 min-w-0 items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <Input
                  value={editSectionIcon}
                  onChange={(e) => setEditSectionIcon(e.target.value)}
                  className="h-8 w-12 px-1 text-center text-sm"
                  aria-label="Icono"
                />
                <Input
                  autoFocus
                  value={editSectionTitle}
                  onChange={(e) => setEditSectionTitle(e.target.value)}
                  className="h-8 flex-1 text-sm"
                  aria-label="Nombre"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveEditSection();
                    if (e.key === "Escape") onCancelEditSection();
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={onSaveEditSection}
                  aria-label="Guardar sección"
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={onCancelEditSection}
                  aria-label="Cancelar"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/40 text-base">
                  {section.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {section.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {section.items.length}{" "}
                    {section.items.length === 1 ? "ítem" : "ítems"}
                    {isHidden && (
                      <span className="ml-2 inline-flex items-center gap-1 text-status-warn-fg/80">
                        <EyeOff className="h-3 w-3" /> oculta en portal
                      </span>
                    )}
                  </p>
                </div>
              </>
            )}
          </button>

          {!isEditingSection && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Acciones de la sección"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onStartEditSection}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onTogglePortalVisible}>
                  {isHidden ? (
                    <>
                      <Eye className="h-3.5 w-3.5 mr-2 text-status-ok-fg" />
                      Mostrar en portal
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3.5 w-3.5 mr-2" />
                      Ocultar del portal
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-status-danger-fg focus:text-status-danger-fg"
                  onClick={onDeleteSection}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Eliminar sección
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-3 pt-0 space-y-1.5">
          {/* Items */}
          {section.items.length === 0 && !addingItem && (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">
                Esta sección no tiene ítems aún.
              </p>
            </div>
          )}

          {section.items.map((item) => {
            const isThisEditing = editingItemId === item.id;
            return (
              <ProtocolItemRow
                key={item.id}
                item={item}
                isEditing={isThisEditing}
                editTitle={editItemTitle}
                editDesc={editItemDesc}
                setEditTitle={setEditItemTitle}
                setEditDesc={setEditItemDesc}
                onStartEdit={() =>
                  onStartEditItem(item.id, item.title, item.description)
                }
                onCancelEdit={onCancelEditItem}
                onSave={() => onSaveEditItem(item.id)}
                onDelete={() => onDeleteItem(item.id, item.title)}
              />
            );
          })}

          {/* Add Item formularios */}
          {addingItem && addItemMode === "manual" && (
            <ProtocolAddItemManual
              newItemTitle={newItemTitle}
              setNewItemTitle={setNewItemTitle}
              newItemDesc={newItemDesc}
              setNewItemDesc={setNewItemDesc}
              onSubmit={onSubmitItemManual}
              onCancel={onCancelAddItem}
            />
          )}

          {addingItem && addItemMode === "ai" && (
            <ProtocolAddItemAi
              aiAvailable={aiAvailable}
              generating={aiItemGenerating}
              result={aiItemResult}
              desc={aiItemDesc}
              setDesc={setAiItemDesc}
              onGenerate={onAiItemGenerate}
              onRegenerate={onAiItemRegenerate}
              onSave={onAiItemSave}
              onCancel={onCancelAddItem}
            />
          )}

          {/* Triggers de "Agregar ítem" */}
          {!addingItem && (
            <div className="flex flex-wrap gap-1 pt-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onStartAddItem("manual")}
              >
                <Plus className="h-3 w-3 mr-1" />
                Agregar ítem
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-status-ok-fg hover:text-status-ok-fg"
                onClick={() => onStartAddItem("ai")}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Con IA
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
