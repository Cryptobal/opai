"use client";

import { type Editor } from "@tiptap/react";
import { useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Undo,
  Redo,
  TableIcon,
  Columns2,
  Code,
  Highlighter,
  Braces,
  FileOutput,
  Eye,
  Link2,
  Unlink2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TokenPicker } from "./TokenPicker";
import type { PageType } from "./DocPreviewDialog";

interface EditorToolbarProps {
  editor: Editor;
  onInsertToken: (token: {
    module: string;
    tokenKey: string;
    label: string;
  }) => void;
  filterModules?: string[];
  pageType?: PageType;
  onPageTypeChange?: (pageType: PageType) => void;
  onPreview?: () => void;
  showPreview?: boolean;
}

export function EditorToolbar({
  editor,
  onInsertToken,
  filterModules,
  pageType = "a4",
  onPageTypeChange,
  onPreview,
  showPreview = true,
}: EditorToolbarProps) {
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);

  // focus sin scroll (evita scroll al ejecutar comandos)
  const focusNoScroll = () => editor.chain().focus(null, { scrollIntoView: false });

  // Ejecutar en mousedown (no click) para preservar la selección del editor.
  // Al hacer click, el botón roba el foco antes de que se ejecute el comando.
  const ToolbarButton = ({
    onClick,
    active,
    disabled,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title?: string;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick();
        setTimeout(() => editor.commands.focus(null, { scrollIntoView: false }), 0);
      }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded hover:bg-accent transition-colors ${
        active ? "bg-accent text-primary" : "text-muted-foreground"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );

  const Separator = () => (
    <div className="w-px h-6 bg-border mx-0.5" />
  );

  const setLink = () => {
    const previousUrl = (editor.getAttributes("link").href as string | undefined) ?? "";
    const userInput = window.prompt(
      "Ingresa la URL del hipervínculo (acepta tokens: {{modulo.campo}})",
      previousUrl || "{{deal.proposalLink}}"
    );
    if (userInput === null) return;

    const trimmed = userInput.trim();
    if (!trimmed) {
      focusNoScroll().extendMarkRange("link").unsetLink().run();
      return;
    }

    const hasToken = /\{\{[^}]+\}\}/.test(trimmed);
    const tokenOnly = trimmed.replace(/^https?:\/\/(?=\{\{[^}]+\}\}$)/i, "");
    const normalizedUrl = hasToken || /^(https?:\/\/|mailto:|tel:)/i.test(trimmed)
      ? tokenOnly
      : `https://${trimmed}`;

    focusNoScroll()
      .extendMarkRange("link")
      .setLink({ href: normalizedUrl })
      .run();
  };

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-muted/30">
      {/* Tipo de página + Vista previa */}
      {onPageTypeChange && (
        <Select value={pageType} onValueChange={(v) => onPageTypeChange(v as PageType)}>
          <SelectTrigger className="h-7 w-[100px] text-xs border-border/80">
            <SelectValue placeholder="Página" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a4">A4</SelectItem>
            <SelectItem value="carta">Carta</SelectItem>
            <SelectItem value="oficio">Oficio</SelectItem>
          </SelectContent>
        </Select>
      )}
      {showPreview && onPreview && (
        <button
          type="button"
          onClick={onPreview}
          onMouseDown={(e) => e.preventDefault()}
          title="Vista previa"
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
        >
          <Eye className="h-4 w-4" />
        </button>
      )}
      <Separator />
      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => focusNoScroll().undo().run()}
        disabled={!editor.can().undo()}
        title="Deshacer"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().redo().run()}
        disabled={!editor.can().redo()}
        title="Rehacer"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Headings */}
      <ToolbarButton
        onClick={() => focusNoScroll().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Título 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Título 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Título 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => focusNoScroll().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Negrita"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Cursiva"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Subrayado"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Tachado"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleHighlight().run()}
        active={editor.isActive("highlight")}
        title="Resaltar"
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={setLink}
        active={editor.isActive("link")}
        title="Agregar/editar enlace"
      >
        <Link2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().extendMarkRange("link").unsetLink().run()}
        disabled={!editor.isActive("link")}
        title="Quitar enlace"
      >
        <Unlink2 className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => focusNoScroll().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Alinear izquierda"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Centrar"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Alinear derecha"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
        title="Justificar"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Lists */}
      <ToolbarButton
        onClick={() => focusNoScroll().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Lista"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Lista numerada"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Blocks */}
      <ToolbarButton
        onClick={() => focusNoScroll().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Cita"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().setHorizontalRule().run()}
        title="Línea horizontal"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          focusNoScroll()
            .insertContent([{ type: "pageBreak" }, { type: "paragraph", content: [] }])
            .run()
        }
        title="Salto de página"
      >
        <FileOutput className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          focusNoScroll()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        title="Insertar tabla"
      >
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => {
          editor.commands.focus(null, { scrollIntoView: false });
          editor.commands.setColumns();
        }}
        active={editor.isActive("columns")}
        title="2 columnas (izq: firma rep legal, der: firma guardia)"
      >
        <Columns2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => focusNoScroll().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Bloque de código"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Token Picker */}
      <DropdownMenu open={tokenPickerOpen} onOpenChange={setTokenPickerOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs font-medium border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
          >
            <Braces className="h-3.5 w-3.5" />
            Insertar Token
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-0 w-auto bg-card border-border shadow-xl" sideOffset={4}>
          <TokenPicker
            filterModules={filterModules}
            onSelect={(token) => {
              onInsertToken(token);
              setTokenPickerOpen(false);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
