"use client";

/**
 * ClauseBubbleMenu — Menú flotante sobre headings. Permite marcar/desmarcar
 * la cláusula, editar el slug y eliminar el bloque completo.
 */

import { useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  textToClauseId,
  isValidClauseId,
  isClauseIdUsed,
  deleteClauseBlock,
} from "./clause-utils-client";
import { toast } from "sonner";

interface Props {
  editor: Editor | null;
}

export function ClauseBubbleMenu({ editor }: Props) {
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");

  if (!editor) return null;

  const isInHeading = editor.isActive("heading");
  const currentClauseId: string | null = isInHeading
    ? ((editor.getAttributes("heading")?.clauseId as string | null) ?? null)
    : null;

  const getHeadingText = (): string => {
    if (!isInHeading) return "";
    const $from = editor.state.doc.resolve(editor.state.selection.from);
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (node.type.name === "heading") return node.textContent;
    }
    return "";
  };

  const handleMark = () => {
    const suggested = textToClauseId(getHeadingText()) || "clausula";
    let finalId = suggested;
    let counter = 2;
    while (isClauseIdUsed(editor, finalId)) {
      finalId = `${suggested}-${counter++}`;
      if (counter > 50) break;
    }
    editor.chain().focus().updateAttributes("heading", { clauseId: finalId }).run();
    toast.success(`Cláusula marcada: ${finalId}`);
  };

  const handleUnmark = () => {
    editor.chain().focus().updateAttributes("heading", { clauseId: null }).run();
    toast.info("Marca de cláusula removida");
  };

  const handleSaveSlug = () => {
    const normalized = textToClauseId(slugDraft);
    if (!isValidClauseId(normalized)) {
      toast.error("El slug debe usar solo letras, números y guiones");
      return;
    }
    if (isClauseIdUsed(editor, normalized, currentClauseId)) {
      toast.error(`El slug "${normalized}" ya está en uso por otra cláusula`);
      return;
    }
    editor.chain().focus().updateAttributes("heading", { clauseId: normalized }).run();
    setEditingSlug(false);
    toast.success(`Slug actualizado: ${normalized}`);
  };

  const handleDeleteClause = () => {
    if (!confirm("¿Eliminar esta cláusula y todo su contenido hasta el próximo título?")) return;
    deleteClauseBlock(editor);
    toast.success("Cláusula eliminada");
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e }) => e.isActive("heading")}
      options={{ placement: "top", offset: 8 }}
      className="flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      {!currentClauseId ? (
        <Button type="button" size="sm" variant="ghost" onClick={handleMark} className="h-7 gap-1 text-xs">
          <Bookmark className="h-3.5 w-3.5" />
          Marcar como cláusula
        </Button>
      ) : editingSlug ? (
        <div className="flex items-center gap-1">
          <Input
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveSlug();
              if (e.key === "Escape") setEditingSlug(false);
            }}
            className="h-7 w-40 text-xs"
            autoFocus
          />
          <Button type="button" size="sm" onClick={handleSaveSlug} className="h-7 text-xs">
            OK
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSlugDraft(currentClauseId);
              setEditingSlug(true);
            }}
            className="h-7 gap-1 text-xs text-teal-600"
          >
            <BookmarkCheck className="h-3.5 w-3.5" />
            {currentClauseId}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleUnmark} className="h-7 text-xs text-muted-foreground">
            Quitar marca
          </Button>
        </>
      )}

      <div className="mx-1 h-4 w-px bg-border" />

      <Button type="button" size="sm" variant="ghost" onClick={handleDeleteClause} className="h-7 gap-1 text-xs text-red-600">
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar
      </Button>
    </BubbleMenu>
  );
}
