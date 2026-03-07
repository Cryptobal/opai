"use client";

import { Bold, Italic, Code } from "lucide-react";

interface ChatFormatToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (before: string, after: string, placeholder: string) => void;
}

export function ChatFormatToolbar({ textareaRef, onInsert }: ChatFormatToolbarProps) {
  const buttons = [
    { icon: Bold, before: "**", after: "**", placeholder: "negrita", label: "Negrita" },
    { icon: Italic, before: "*", after: "*", placeholder: "itálica", label: "Itálica" },
    { icon: Code, before: "`", after: "`", placeholder: "código", label: "Código" },
  ];

  return (
    <div className="flex items-center gap-0.5 px-4 py-1 border-b border-zinc-800/50">
      {buttons.map(({ icon: Icon, before, after, placeholder, label }) => (
        <button
          key={label}
          type="button"
          onMouseDown={(e) => {
            // Prevent blur of textarea so selection is preserved
            e.preventDefault();
            onInsert(before, after, placeholder);
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
