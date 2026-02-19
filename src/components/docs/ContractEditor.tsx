"use client";

import { useEditor, EditorContent } from "@tiptap/react";
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
import { ContractToken } from "./ContractTokenExtension";
import { PageBreak } from "./PageBreakExtension";
import { Columns, Column, ColumnsCommands } from "./ColumnsExtension";
import { TokenSuggestionExtension } from "./TokenSuggestionExtension";
import { EditorToolbar } from "./EditorToolbar";
import { DocPreviewDialog, type PageType } from "./DocPreviewDialog";
import { SIGNER_TOKEN_COLORS } from "@/lib/docs/signature-token-colors";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_WIDTHS: Record<PageType, string> = {
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
}

export function ContractEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Escribe tu documento aquí... Usa # para buscar tokens o el botón Insertar Token",
  className = "",
  filterModules,
  showPagePreview = true,
}: ContractEditorProps) {
  const [pageType, setPageType] = useState<PageType>("a4");
  const [previewOpen, setPreviewOpen] = useState(false);
  const isInternalUpdate = useRef(false);
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
        underline: false,
      }),
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
      TokenSuggestionExtension.configure({ filterModules: filterModules ?? undefined }),
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
        class:
          "prose prose-invert prose-sm sm:prose-base max-w-none focus:outline-none min-h-[500px] px-8 py-6",
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange?.(editor.getJSON());
    },
  },
  [editable, placeholder, filterModules]
  );

  // Sincronizar contenido externo solo cuando no está editando (evita pérdida de foco)
  useEffect(() => {
    if (!editor || !content || editor.isFocused) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const currentJSON = JSON.stringify(editor.getJSON());
    const newJSON = JSON.stringify(content);
    if (currentJSON !== newJSON) {
      editor.commands.setContent(content);
    }
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
        </div>
      )}

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
