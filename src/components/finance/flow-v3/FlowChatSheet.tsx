"use client";

import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/opai-ds";

const CHIPS = [
  "¿Cuál es el saldo mínimo de las próximas 12 semanas?",
  "¿Qué semana queda en rojo?",
  "¿Cuánto tengo por cobrar?",
  "Resume ingresos de esta semana",
];

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export function FlowChatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    try {
      const res = await fetch("/api/finance/flow-v3/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Error");
      setMsgs((m) => [...m, { role: "assistant", text: String(j.data.answer) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ds-border-default" aria-hidden />
        <SheetHeader className="px-5 pt-4 pb-2 text-left">
          <SheetTitle className="text-base">Chat del flujo</SheetTitle>
          <SheetDescription className="text-[12px] text-ds-text-4">
            Solo consulta la matriz de tu empresa. No ejecuta acciones.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => void send(c)}
              className="rounded-full border border-ds-border-default bg-ds-surface-2 px-3 py-1.5 text-[12px] text-ds-text-2 min-h-10"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2">
          {msgs.length === 0 && (
            <p className="text-[13px] text-ds-text-4">
              Pregunta por saldos, semanas en rojo o por cobrar.
            </p>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-[13px] ${
                m.role === "user"
                  ? "ml-8 bg-primary/15 text-ds-text-1"
                  : "mr-8 bg-ds-surface-2 text-ds-text-2"
              }`}
            >
              {m.text}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[12px] text-ds-text-4">
              <Spinner className="h-4 w-4" /> Pensando…
            </div>
          )}
          {error && (
            <p className="text-[13px] text-status-danger-fg">{error}</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-ds-border-subtle p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send(input);
            }}
            placeholder="Pregunta sobre tu caja…"
            className="h-11 min-w-0 flex-1 rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 outline-none"
          />
          <Button
            className="h-11 min-w-11"
            disabled={busy || !input.trim()}
            onClick={() => void send(input)}
          >
            Enviar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
