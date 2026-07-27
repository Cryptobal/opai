"use client";

import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Bold, Image as ImageIcon, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { promptDialog } from "@/components/ui/confirm-service";

/**
 * Toolbar mínima del composer de correo (Bloque 1): B/I/U, listas, enlace e
 * imagen inline. A diferencia de la toolbar de documentos, NO expone "Insertar
 * Token" ni "Insertar firmas" (ajenos a email). La firma del usuario se aplica
 * automáticamente server-side desde CrmEmailSignature; no como botón.
 * Mobile-first: fila scrollable horizontal, touch targets ≥44px con ds-tap.
 */
export function EmailToolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const focus = () => editor.chain().focus(null, { scrollIntoView: false });

  async function setLink() {
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = await promptDialog({ description: "URL del enlace", defaultValue: previous });
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    focus().extendMarkRange("link").setLink({ href }).run();
  }

  function insertImages(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : null;
        if (src) editor.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    }
  }

  const Btn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ds-tap ${
        active ? "bg-ds-surface-2 text-ds-text-1" : "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-ds-border-subtle px-0 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Btn onClick={() => focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrita">
        <Bold className="h-4 w-4" />
      </Btn>
      <Btn onClick={() => focus().toggleItalic().run()} active={editor.isActive("italic")} title="Cursiva">
        <Italic className="h-4 w-4" />
      </Btn>
      <Btn onClick={() => focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Subrayado">
        <Underline className="h-4 w-4" />
      </Btn>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-ds-border-subtle" aria-hidden />
      <Btn onClick={() => focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista">
        <List className="h-4 w-4" />
      </Btn>
      <Btn
        onClick={() => focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Lista numerada"
      >
        <ListOrdered className="h-4 w-4" />
      </Btn>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-ds-border-subtle" aria-hidden />
      <Btn onClick={() => void setLink()} active={editor.isActive("link")} title="Enlace">
        <Link2 className="h-4 w-4" />
      </Btn>
      <Btn onClick={() => fileRef.current?.click()} title="Imagen">
        <ImageIcon className="h-4 w-4" />
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          insertImages(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
