"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyField({
  value,
  label,
  disabled = false,
}: {
  value: string;
  label?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex items-start gap-2">
        <code
          className={cn(
            "flex-1 whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/40 p-2 font-mono text-[12px] leading-relaxed",
            disabled && "opacity-60",
          )}
        >
          {value}
        </code>
        {!disabled && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={copy}
            className="shrink-0"
            aria-label="Copiar"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
