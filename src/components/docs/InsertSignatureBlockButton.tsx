"use client";

/**
 * InsertSignatureBlockButton — UX shortcut for the contract editor.
 *
 * Pops up a small selector (1-4 firmantes) and inserts a structured
 * signature block at the end of the document: <hr/> + heading "Firmas" +
 * one paragraph per signer with the matching `signature.signer_N` token.
 *
 * The output is structurally identical to what a user could build manually
 * via the TokenPicker; this only saves them clicks and prevents the common
 * mistake of typing "Firma del firmante 1" as plain text.
 */

import { useState } from "react";
import { type Editor } from "@tiptap/react";
import { PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

type Props = {
  editor: Editor;
};

const buildSignatureBlock = (count: number): unknown[] => {
  const blocks: unknown[] = [
    { type: "horizontalRule" },
    {
      type: "heading",
      attrs: { level: 3, textAlign: "left" },
      content: [{ type: "text", text: "Firmas" }],
    },
  ];
  for (let i = 1; i <= count; i++) {
    blocks.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `Firmante ${i}:`,
          marks: [{ type: "bold" }],
        },
        { type: "hardBreak" },
        {
          type: "contractToken",
          attrs: {
            module: "signature",
            tokenKey: `signature.signer_${i}`,
            label: `Firma del firmante ${i}`,
            signerOrder: i,
          },
        },
        { type: "hardBreak" },
        { type: "text", text: "Fecha: " },
        {
          type: "contractToken",
          attrs: {
            module: "signature",
            tokenKey: "signature.signedDate",
            label: "Fecha de firma",
            signerOrder: null,
          },
        },
      ],
    });
    blocks.push({ type: "paragraph", content: [] });
  }
  return blocks;
};

export function InsertSignatureBlockButton({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<1 | 2 | 3 | 4>(2);

  const handleInsert = () => {
    editor
      .chain()
      .focus("end", { scrollIntoView: false })
      .insertContent(buildSignatureBlock(count) as never)
      .run();
    setOpen(false);
    toast.success(
      `Bloque de ${count} firma${count === 1 ? "" : "s"} insertado al final`,
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs font-medium border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
          onMouseDown={(e) => e.preventDefault()}
        >
          <PenTool className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Insertar firmas</span>
          <span className="sm:hidden">Firmas</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-72 min-w-[18rem] max-w-[18rem] p-3 space-y-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Insertar bloque de firmas
          </p>
          <p className="text-xs text-muted-foreground">
            Se agrega al final del documento, con un token{" "}
            <code className="font-mono">signature.signer_N</code> por firmante.
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            ¿Cuántas personas firmarán?
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n as 1 | 2 | 3 | 4)}
                className={`h-9 rounded-md border text-sm font-medium transition-colors ${
                  count === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={handleInsert}
        >
          <PenTool className="h-3.5 w-3.5" />
          Insertar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
