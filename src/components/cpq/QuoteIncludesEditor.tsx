"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Check,
  X,
  Eye,
  EyeOff,
  ListChecks,
  Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ──

export interface IncludesItem {
  id: string;
  text: string;
  sortOrder: number;
  showInPdf: boolean;
  source: string;
  suggestionId?: string | null;
}

export interface IncludesSuggestion {
  id: string;
  text: string;
  category?: string | null;
  isDefault: boolean;
  sortOrder: number;
}

interface QuoteIncludesEditorProps {
  quoteId: string;
  isLocked?: boolean;
}

// ── Sortable Item ──

function SortableItem({
  item,
  isEditing,
  editingValue,
  onEditStart,
  onEditChange,
  onEditConfirm,
  onEditCancel,
  onDelete,
  onTogglePdf,
  isLocked,
}: {
  item: IncludesItem;
  isEditing: boolean;
  editingValue: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditConfirm: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onTogglePdf: () => void;
  isLocked: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isLocked || isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded px-1 -mx-1 min-h-[28px]",
        isDragging && "opacity-50 bg-muted/30 z-50",
      )}
    >
      {!isLocked && (
        <button
          type="button"
          className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
          aria-label="Arrastrar para reordenar"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}

      {isEditing ? (
        <>
          <input
            ref={inputRef}
            value={editingValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditConfirm();
              if (e.key === "Escape") onEditCancel();
            }}
            className="flex-1 text-xs bg-muted/30 border border-status-info-border outline-none text-foreground py-1 px-2 rounded"
            placeholder="Escribe un ítem..."
          />
          <button
            type="button"
            className="shrink-0 p-0.5 rounded hover:bg-status-info-soft transition-colors"
            onClick={onEditConfirm}
            title="Guardar"
          >
            <Check className="h-3.5 w-3.5 text-status-info-fg" />
          </button>
          <button
            type="button"
            className="shrink-0 p-0.5 rounded hover:bg-status-danger-soft transition-colors"
            onClick={onEditCancel}
            title="Cancelar"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-status-danger-fg" />
          </button>
        </>
      ) : (
        <>
          <span
            className={cn(
              "text-status-info-fg text-xs shrink-0",
              !item.showInPdf && "text-muted-foreground/40",
            )}
          >
            ●
          </span>
          <span
            className={cn(
              "flex-1 text-xs py-1 transition-colors",
              isLocked
                ? "text-foreground"
                : "text-foreground cursor-pointer hover:text-status-info-fg",
              !item.showInPdf && "text-muted-foreground/60 line-through",
            )}
            onClick={() => {
              if (!isLocked) onEditStart();
            }}
            role={isLocked ? undefined : "button"}
            tabIndex={isLocked ? undefined : 0}
            onKeyDown={(e) => {
              if (!isLocked && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onEditStart();
              }
            }}
            aria-label={isLocked ? undefined : `Editar: ${item.text}`}
          >
            {item.text || "(vacío)"}
          </span>

          {!isLocked && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
              <button
                type="button"
                className="shrink-0 p-0.5 rounded hover:bg-muted/40 transition-colors"
                onClick={onTogglePdf}
                title={item.showInPdf ? "Ocultar del PDF" : "Mostrar en PDF"}
                aria-label={item.showInPdf ? "Ocultar del PDF" : "Mostrar en PDF"}
              >
                {item.showInPdf ? (
                  <Eye className="h-3 w-3 text-muted-foreground/60" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground/40" />
                )}
              </button>
              <button
                type="button"
                className="shrink-0 p-0.5 rounded hover:bg-status-danger-soft transition-colors"
                onClick={onDelete}
                title="Eliminar"
                aria-label={`Eliminar: ${item.text}`}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground/60 hover:text-status-danger-fg" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Component ──

export function QuoteIncludesEditor({ quoteId, isLocked = false }: QuoteIncludesEditorProps) {
  const [items, setItems] = useState<IncludesItem[]>([]);
  const [suggestions, setSuggestions] = useState<IncludesSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [customText, setCustomText] = useState("");
  const [undoItem, setUndoItem] = useState<{ item: IncludesItem; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [editingSuggestionValue, setEditingSuggestionValue] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fetch items and suggestions
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [itemsRes, suggestionsRes] = await Promise.all([
          fetch(`/api/cpq/quotes/${quoteId}/includes`),
          fetch("/api/cpq/includes/suggestions"),
        ]);

        if (cancelled) return;

        const itemsData = await itemsRes.json();
        const suggestionsData = await suggestionsRes.json();

        if (suggestionsData.success) setSuggestions(suggestionsData.data);

        // If quote has no includes yet, auto-add defaults
        const loadedItems: IncludesItem[] = itemsData.success ? itemsData.data : [];
        if (loadedItems.length === 0 && suggestionsData.success) {
          const defaults = (suggestionsData.data as IncludesSuggestion[]).filter((s) => s.isDefault);
          if (defaults.length > 0) {
            const created: IncludesItem[] = [];
            for (const s of defaults) {
              try {
                const res = await fetch(`/api/cpq/quotes/${quoteId}/includes`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ suggestionId: s.id, text: s.text }),
                });
                if (cancelled) return;
                const data = await res.json();
                if (data.success) created.push(data.data);
              } catch { /* skip */ }
            }
            setItems(created);
          } else {
            setItems(loadedItems);
          }
        } else {
          setItems(loadedItems);
        }
      } catch (err) {
        console.error("Error loading includes data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [quoteId]);

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoItem) clearTimeout(undoItem.timer);
    };
  }, [undoItem]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // ── API helpers ──

  const apiPost = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/cpq/quotes/${quoteId}/includes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [quoteId]);

  const apiPut = useCallback(async (itemId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/cpq/quotes/${quoteId}/includes/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [quoteId]);

  const apiDelete = useCallback(async (itemId: string) => {
    const res = await fetch(`/api/cpq/quotes/${quoteId}/includes/${itemId}`, {
      method: "DELETE",
    });
    return res.json();
  }, [quoteId]);

  const apiReorder = useCallback(async (orderedItems: { id: string; sortOrder: number }[]) => {
    const res = await fetch(`/api/cpq/quotes/${quoteId}/includes/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: orderedItems }),
    });
    return res.json();
  }, [quoteId]);

  // ── Handlers ──

  const handleAddSuggestion = async (suggestion: IncludesSuggestion) => {
    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const newItem: IncludesItem = {
      id: tempId,
      text: suggestion.text,
      sortOrder: items.length,
      showInPdf: true,
      source: "suggestion",
      suggestionId: suggestion.id,
    };
    setItems((prev) => [...prev, newItem]);

    try {
      const data = await apiPost({
        text: suggestion.text,
        source: "suggestion",
        suggestionId: suggestion.id,
        showInPdf: true,
      });
      if (data.success) {
        setItems((prev) => prev.map((i) => (i.id === tempId ? data.data : i)));
      } else {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
      }
    } catch {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
    }
  };

  const handleAddCustom = async () => {
    const trimmed = customText.trim();
    if (!trimmed) return;

    const tempId = `temp-${Date.now()}`;
    const newItem: IncludesItem = {
      id: tempId,
      text: trimmed,
      sortOrder: items.length,
      showInPdf: true,
      source: "custom",
    };
    setItems((prev) => [...prev, newItem]);
    setCustomText("");

    try {
      const data = await apiPost({
        text: trimmed,
        source: "custom",
        showInPdf: true,
      });
      if (data.success) {
        setItems((prev) => prev.map((i) => (i.id === tempId ? data.data : i)));
      } else {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
      }
    } catch {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
    }
  };

  const handleEditStart = (item: IncludesItem) => {
    setEditingId(item.id);
    setEditingValue(item.text);
  };

  const handleEditConfirm = async () => {
    if (!editingId) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      handleEditCancel();
      return;
    }

    const prevItem = items.find((i) => i.id === editingId);
    if (prevItem && prevItem.text === trimmed) {
      setEditingId(null);
      setEditingValue("");
      return;
    }

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === editingId ? { ...i, text: trimmed } : i))
    );
    setEditingId(null);
    setEditingValue("");

    // Debounced save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const itemId = editingId;
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiPut(itemId, { text: trimmed });
        if (data.success) {
          setItems((prev) => prev.map((i) => (i.id === itemId ? data.data : i)));
        }
      } catch {
        if (prevItem) {
          setItems((prev) => prev.map((i) => (i.id === itemId ? prevItem : i)));
        }
      }
    }, 300);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const handleDelete = async (item: IncludesItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    // Clear previous undo timer
    if (undoItem) {
      clearTimeout(undoItem.timer);
      // Execute the previous pending delete
      apiDelete(undoItem.item.id).catch(() => {});
    }

    // Set undo state with 5s timer
    const timer = setTimeout(async () => {
      try {
        await apiDelete(item.id);
      } catch {
        // If delete fails, add item back
        setItems((prev) => [...prev, item].sort((a, b) => a.sortOrder - b.sortOrder));
      }
      setUndoItem(null);
    }, 5000);

    setUndoItem({ item, timer });

    toast("Ítem eliminado", {
      action: {
        label: "Deshacer",
        onClick: () => {
          clearTimeout(timer);
          setItems((prev) => [...prev, item].sort((a, b) => a.sortOrder - b.sortOrder));
          setUndoItem(null);
        },
      },
      duration: 5000,
    });
  };

  const handleTogglePdf = async (item: IncludesItem) => {
    const newVal = !item.showInPdf;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, showInPdf: newVal } : i))
    );

    try {
      const data = await apiPut(item.id, { showInPdf: newVal });
      if (data.success) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? data.data : i)));
      }
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, showInPdf: !newVal } : i))
      );
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      sortOrder: idx,
    }));

    setItems(reordered);

    try {
      const data = await apiReorder(
        reordered.map((i) => ({ id: i.id, sortOrder: i.sortOrder }))
      );
      if (data.success) setItems(data.data);
    } catch {
      // Revert on error
      setItems(items);
    }
  };

  const handleAddAllDefaults = async () => {
    const defaultsToAdd = availableSuggestions.filter((s) => s.isDefault);
    for (const s of defaultsToAdd) {
      await handleAddSuggestion(s);
    }
  };

  // ── Suggestion edit/delete handlers ──

  const handleEditSuggestion = async (suggestion: IncludesSuggestion) => {
    setEditingSuggestionId(suggestion.id);
    setEditingSuggestionValue(suggestion.text);
  };

  const handleEditSuggestionConfirm = async () => {
    if (!editingSuggestionId) return;
    const trimmed = editingSuggestionValue.trim();
    if (!trimmed) {
      setEditingSuggestionId(null);
      setEditingSuggestionValue("");
      return;
    }

    const prev = suggestions.find((s) => s.id === editingSuggestionId);
    if (prev && prev.text === trimmed) {
      setEditingSuggestionId(null);
      setEditingSuggestionValue("");
      return;
    }

    // Optimistic
    setSuggestions((prev) =>
      prev.map((s) => (s.id === editingSuggestionId ? { ...s, text: trimmed } : s))
    );
    setEditingSuggestionId(null);
    setEditingSuggestionValue("");

    try {
      const res = await fetch(`/api/cpq/includes/suggestions/${editingSuggestionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!data.success && prev) {
        setSuggestions((s) => s.map((x) => (x.id === prev.id ? prev : x)));
      }
    } catch {
      if (prev) {
        setSuggestions((s) => s.map((x) => (x.id === prev.id ? prev : x)));
      }
    }
  };

  const handleDeleteSuggestion = async (suggestion: IncludesSuggestion) => {
    // Optimistic
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));

    try {
      const res = await fetch(`/api/cpq/includes/suggestions/${suggestion.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        setSuggestions((prev) => [...prev, suggestion].sort((a, b) => a.sortOrder - b.sortOrder));
        toast.error("Error al eliminar sugerencia");
      }
    } catch {
      setSuggestions((prev) => [...prev, suggestion].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  };

  // ── Computed ──

  const usedSuggestionIds = new Set(
    items.filter((i) => i.suggestionId).map((i) => i.suggestionId)
  );
  const usedTexts = new Set(items.map((i) => i.text.toLowerCase()));

  const availableSuggestions = suggestions.filter(
    (s) => !usedSuggestionIds.has(s.id) && !usedTexts.has(s.text.toLowerCase())
  );

  const hasDefaultsToAdd = availableSuggestions.some((s) => s.isDefault);

  if (loading) {
    return (
      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-status-info-fg" />
          <span className="text-xs font-semibold">Incluye</span>
        </div>
        <div className="flex items-center gap-2 py-2">
          <div className="h-3 w-3 border-2 border-status-info-border border-t-status-info rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">Cargando...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-status-info-fg" />
          <span className="text-xs font-semibold">Incluye</span>
          <span className="text-xs text-muted-foreground">(aparece en PDF)</span>
        </div>
      </div>

      {/* Selected Items List */}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No hay ítems incluidos. Agrega desde las sugerencias o crea uno personalizado.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {items.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  isEditing={editingId === item.id}
                  editingValue={editingValue}
                  onEditStart={() => handleEditStart(item)}
                  onEditChange={setEditingValue}
                  onEditConfirm={handleEditConfirm}
                  onEditCancel={handleEditCancel}
                  onDelete={() => handleDelete(item)}
                  onTogglePdf={() => handleTogglePdf(item)}
                  isLocked={isLocked}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Custom item input */}
      {!isLocked && (
        <div className="flex items-center gap-1.5">
          <Plus className="h-3 w-3 text-status-info-fg/60 shrink-0" />
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCustom();
            }}
            className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40 py-1"
            placeholder="Agregar ítem personalizado..."
          />
          {customText.trim() && (
            <button
              type="button"
              className="shrink-0 p-1 rounded hover:bg-status-info-soft transition-colors"
              onClick={handleAddCustom}
              title="Guardar ítem"
            >
              <Check className="h-3.5 w-3.5 text-status-info-fg" />
            </button>
          )}
        </div>
      )}

      {/* Suggestions Panel */}
      {!isLocked && availableSuggestions.length > 0 && (
        <div className="border-t border-border/30 pt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Sugerencias
            </span>
            {hasDefaultsToAdd && (
              <button
                type="button"
                className="text-xs text-status-info-fg hover:text-status-info-fg transition-colors"
                onClick={handleAddAllDefaults}
              >
                + Agregar predeterminados
              </button>
            )}
          </div>
          {availableSuggestions.map((suggestion) => (
            <div key={suggestion.id} className="group/sug flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted/20 transition-colors">
              {editingSuggestionId === suggestion.id ? (
                <>
                  <input
                    autoFocus
                    value={editingSuggestionValue}
                    onChange={(e) => setEditingSuggestionValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditSuggestionConfirm();
                      if (e.key === "Escape") { setEditingSuggestionId(null); setEditingSuggestionValue(""); }
                    }}
                    className="flex-1 text-xs bg-muted/30 border border-status-info-border outline-none text-foreground py-0.5 px-2 rounded"
                  />
                  <button type="button" className="shrink-0 p-0.5 rounded hover:bg-status-info-soft" onClick={handleEditSuggestionConfirm} title="Guardar">
                    <Check className="h-3 w-3 text-status-info-fg" />
                  </button>
                  <button type="button" className="shrink-0 p-0.5 rounded hover:bg-status-danger-soft" onClick={() => { setEditingSuggestionId(null); setEditingSuggestionValue(""); }} title="Cancelar">
                    <X className="h-3 w-3 text-muted-foreground hover:text-status-danger-fg" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 flex-1 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => handleAddSuggestion(suggestion)}
                  >
                    <Plus className="h-3 w-3 text-status-info-fg shrink-0" />
                    <span>{suggestion.text}</span>
                  </button>
                  {suggestion.isDefault && (
                    <span className="text-[9px] text-status-info-fg/50 shrink-0">default</span>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/sug:opacity-100 transition-all shrink-0">
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted/40 transition-colors"
                      onClick={() => handleEditSuggestion(suggestion)}
                      title="Editar sugerencia"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground/60" />
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-status-danger-soft transition-colors"
                      onClick={() => handleDeleteSuggestion(suggestion)}
                      title="Eliminar sugerencia"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground/60 hover:text-status-danger-fg" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
