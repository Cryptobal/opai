"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import { ContractToken } from "./ContractTokenExtension";
import { PageBreak } from "./PageBreakExtension";
import { Columns, Column, ColumnsCommands } from "./ColumnsExtension";
import { TokenSuggestionExtension } from "./TokenSuggestionExtension";
import { HeadingClause } from "./HeadingClauseExtension";
import { EditorToolbar } from "./EditorToolbar";
import { ClauseBubbleMenu } from "./editor/ClauseBubbleMenu";
import { findDuplicateClauseIds } from "./editor/clause-utils-client";
import { DocPreviewDialog, type PageType } from "./DocPreviewDialog";
import { SIGNER_TOKEN_COLORS } from "@/lib/docs/signature-token-colors";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./editor/editor-styles.css";

const PAGE_WIDTHS: Record<PageType, string> = {
  // "auto" lets the editor fill the container so text doesn't squeeze into
  // an A4-sized column on wide monitors. The preview dialog still renders
  // at real paper size.
  auto: "100%",
  a4: "210mm",
  carta: "216mm",
  oficio: "216mm",
};

interface ContractEditorProps {
  content?: any;
  onChange?: (content: any) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  filterModules?: string[];
  showPagePreview?: boolean;
  /** Composer de correo (P06): permite pegar/soltar imágenes como data URL
   *  (al enviar se convierten en adjuntos inline CID). */
  enableImages?: boolean;
  /** Altura compacta para composers embebidos (correo) en vez de página completa. */
  compact?: boolean;
  /** Correo (Bloque 1): desactiva tokens `#`/{{…}} ajenos a email. Docs los usa. */
  enableTokens?: boolean;
  /** Correo (Bloque 1): toolbar propia (sin "Insertar Token"/"firmas"). Si se
   *  provee, reemplaza a la toolbar de documentos manteniendo docs intacto. */
  renderToolbar?: (editor: Editor) => ReactNode;
}

/** Lee archivos de imagen del clipboard/drop y los inserta como data URL. */
function insertImageFiles(view: any, files: File[]): boolean {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return false;
  for (const file of images) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) return;
      const { schema, state } = view;
      const node = schema.nodes.image?.create({ src });
      if (node) view.dispatch(state.tr.replaceSelectionWith(node));
    };
    reader.readAsDataURL(file);
  }
  return true;
}

export function ContractEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Escribe tu documento aquí... Usa # para buscar tokens o el botón Insertar Token",
  className = "",
  filterModules,
  showPagePreview = true,
  enableImages = false,
  compact = false,
  enableTokens = true,
  renderToolbar,
}: ContractEditorProps) {
  // Default to "auto" (full container width) — readable on wide monitors.
  // Users can switch to A4/Carta/Oficio if they want page-width editing.
  const [pageType, setPageType] = useState<PageType>("auto");
  const [previewOpen, setPreviewOpen] = useState(false);
  const isInternalUpdate = useRef(false);
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
      StarterKit.configure({
        heading: false,
        underline: false,
      }),
      HeadingClause.configure({ levels: [1, 2, 3, 4] }),
      Placeholder.configure({
        placeholder,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      Color,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      ContractToken,
      PageBreak,
      Column,
      Columns,
      ColumnsCommands,
      ...(enableTokens
        ? [TokenSuggestionExtension.configure({ filterModules: filterModules ?? undefined })]
        : []),
      ...(enableImages
        ? [Image.configure({ allowBase64: true, inline: false })]
        : []),
    ],
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [],
        },
      ],
    },
    editable,
    editorProps: {
      attributes: {
        class: compact
          ? "prose prose-invert prose-sm max-w-none focus:outline-none min-h-[160px] px-3 py-2"
          : "prose prose-invert prose-sm sm:prose-base max-w-none focus:outline-none min-h-[500px] px-8 py-6",
      },
      ...(enableImages
        ? {
            handlePaste: (view: any, event: ClipboardEvent) =>
              insertImageFiles(view, Array.from(event.clipboardData?.files ?? [])),
            handleDrop: (view: any, event: DragEvent) =>
              insertImageFiles(view, Array.from(event.dataTransfer?.files ?? [])),
          }
        : {}),
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange?.(editor.getJSON());
    },
  },
  [editable, placeholder, filterModules, enableImages, compact, enableTokens]
  );

  // Warning de clauseIds duplicados (solo console — banner UI queda para iteración futura)
  useEffect(() => {
    if (!editor) return;
    const checkDupes = () => {
      const dupes = findDuplicateClauseIds(editor.getJSON());
      if (dupes.size > 0) {
        console.warn("[ContractEditor] Duplicated clauseIds:", Array.from(dupes));
      }
    };
    editor.on("update", checkDupes);
    return () => {
      editor.off("update", checkDupes);
    };
  }, [editor]);

  // Sincronizar contenido externo. Cuando se trata del primer sync (editor recién
  // creado vacío), ignoramos el check de `isFocused` para garantizar que el
  // contenido real se inyecte aunque el editor ya haya recibido foco.
  useEffect(() => {
    if (!editor || !content) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const currentJSON = JSON.stringify(editor.getJSON());
    const newJSON = JSON.stringify(content);
    if (currentJSON === newJSON) return;
    // Si el editor está vacío (tamaño mínimo) o nunca se cargó contenido real,
    // siempre sincronizamos. En otros casos, respetamos el foco del usuario.
    const editorIsEmpty = editor.state.doc.content.size <= 2;
    if (editor.isFocused && !editorIsEmpty) return;
    editor.commands.setContent(content);
  }, [content, editor]);

  const insertToken = useCallback(
    (token: { module: string; tokenKey: string; label: string }) => {
      if (!editor) return;
      const signerMatch = /^signature\.signer_(\d+)$/.exec(token.tokenKey);
      const signerOrder = signerMatch ? parseInt(signerMatch[1], 10) : null;
      editor
        .chain()
        .focus()
        .insertToken({
          module: token.module,
          tokenKey: token.tokenKey,
          label: token.label,
          ...(signerOrder != null && { signerOrder }),
        })
        .insertContent(" ")
        .run();
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <div className={`border border-border rounded-lg bg-card flex flex-col max-h-[calc(100vh-160px)] min-h-[400px] overflow-hidden ${className}`}>
      {editable && (
        <div className="shrink-0 border-b border-border bg-card z-10">
          {renderToolbar ? (
            renderToolbar(editor)
          ) : (
            <EditorToolbar
              editor={editor}
              onInsertToken={insertToken}
              filterModules={filterModules}
              pageType={pageType}
              onPageTypeChange={setPageType}
              onPreview={() => {
                setPreviewOpen(true);
              }}
              showPreview={showPagePreview}
            />
          )}
        </div>
      )}

      {editable && <ClauseBubbleMenu editor={editor} />}

      {/* Contenido scrolleable — la toolbar queda fija arriba */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div
          className="relative"
          style={
            showPagePreview
              ? { maxWidth: PAGE_WIDTHS[pageType], margin: "0 auto" }
              : undefined
          }
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {showPagePreview && (
        <DocPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          content={editor.getJSON()}
          pageType={pageType}
        />
      )}

      {/* Token Styles — alineados al tema oscuro */}
      <style jsx global>{`
        .ProseMirror {
          background: transparent;
        }
        .contract-token {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          padding: 1px 8px;
          border-radius: 4px;
          background: hsl(var(--primary) / 0.15);
          color: hsl(var(--primary));
          font-size: 0.85em;
          font-weight: 500;
          border: 1px solid hsl(var(--primary) / 0.4);
          cursor: default;
          user-select: none;
          vertical-align: baseline;
          line-height: 1.6;
        }
        .contract-token::before {
          content: "⟨";
          opacity: 0.5;
          font-size: 0.8em;
        }
        .contract-token::after {
          content: "⟩";
          opacity: 0.5;
          font-size: 0.8em;
        }
        ${SIGNER_TOKEN_COLORS.map(
          (c, i) =>
            `.contract-token[data-signer-order="${i + 1}"] {
              background: ${c.bg};
              border-color: ${c.border};
              color: ${c.text};
            }
            .ProseMirror .contract-token[data-signer-order="${i + 1}"].ProseMirror-selectednode {
              outline-color: ${c.border};
            }`
        ).join("\n")}
        .ProseMirror .contract-token.ProseMirror-selectednode {
          outline: 2px solid hsl(var(--primary));
          outline-offset: 1px;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: hsl(var(--muted-foreground));
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        .ProseMirror td,
        .ProseMirror th {
          border: 1px solid hsl(var(--border));
          padding: 8px 12px;
          position: relative;
          vertical-align: top;
        }
        .ProseMirror th {
          background: hsl(var(--muted));
          font-weight: 600;
        }
        .ProseMirror hr[data-type="pagebreak"] {
          border: none;
          border-top: 2px dashed hsl(var(--muted-foreground) / 0.5);
          margin: 1.5em 0;
          padding: 0;
          height: 0;
        }
        .ProseMirror hr[data-type="pagebreak"]::after {
          content: "Salto de página";
          display: block;
          text-align: center;
          font-size: 0.75rem;
          color: hsl(var(--muted-foreground) / 0.7);
          margin-top: 0.5em;
        }
        .ProseMirror .columns-block {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          width: 100%;
          margin: 1em 0;
        }
        .ProseMirror .columns-column {
          overflow: hidden;
          padding: 8px;
          margin: -8px;
          border-radius: 6px;
          min-height: 60px;
        }
        .ProseMirror .columns-column:first-child::before {
          content: "Firma Rep. Legal";
          display: block;
          font-size: 10px;
          color: hsl(var(--muted-foreground) / 0.7);
          margin-bottom: 4px;
        }
        .ProseMirror .columns-column:last-child::before {
          content: "Firma Guardia";
          display: block;
          font-size: 10px;
          color: hsl(var(--muted-foreground) / 0.7);
          margin-bottom: 4px;
        }
        .ProseMirror-focused .columns-column {
          border: 1px dashed hsl(var(--border));
        }
      `}</style>
    </div>
  );
}
