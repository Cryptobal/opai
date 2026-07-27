"use client";

import { Copy, Check, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function MessageActionBar({
  messageId,
  content,
  feedback,
  canPersistFeedback,
  onRegenerate,
  onFeedback,
}: {
  messageId: string;
  content: string;
  feedback?: "up" | "down" | null;
  canPersistFeedback: boolean;
  onRegenerate?: () => void;
  onFeedback?: (next: "up" | "down" | null) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const setFeedback = async (next: "up" | "down") => {
    const value = feedback === next ? null : next;
    onFeedback?.(value);
    if (!canPersistFeedback || messageId.startsWith("tmp-") || messageId.startsWith("ephemeral-")) {
      return;
    }
    try {
      const res = await fetch(`/api/ai/help-chat/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: value }),
      });
      if (!res.ok) throw new Error("fail");
    } catch {
      toast.error("No se pudo guardar el feedback");
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-0.5 opacity-80">
      <ActionBtn
        label={copied ? "Copiado" : "Copiar"}
        onClick={() => void copy()}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-status-ok-fg" /> : <Copy className="h-3.5 w-3.5" />}
      </ActionBtn>
      {onRegenerate ? (
        <ActionBtn label="Regenerar" onClick={onRegenerate}>
          <RefreshCw className="h-3.5 w-3.5" />
        </ActionBtn>
      ) : null}
      <ActionBtn
        label="Útil"
        onClick={() => void setFeedback("up")}
        active={feedback === "up"}
      >
        <ThumbsUp className={cn("h-3.5 w-3.5", feedback === "up" && "text-status-ok-fg")} />
      </ActionBtn>
      <ActionBtn
        label="No útil"
        onClick={() => void setFeedback("down")}
        active={feedback === "down"}
      >
        <ThumbsDown className={cn("h-3.5 w-3.5", feedback === "down" && "text-status-danger-fg")} />
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-md text-white/55 hover:bg-white/10 hover:text-white transition",
        active && "bg-white/10 text-white",
      )}
    >
      {children}
    </button>
  );
}
