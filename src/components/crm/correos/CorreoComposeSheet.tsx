"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Minus, PenLine, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";
import {
  hideKeyboardAccessoryBar,
  subscribeHideKeyboardAccessoryBar,
} from "@/lib/capacitor/hideKeyboardAccessoryBar";
import { EmailComposer, type EmailComposerHandle } from "./EmailComposer";
import {
  ComposerAiAssistToggle,
  ComposerAiPromptPill,
  type DraftRefineMode,
} from "./ComposerAiAssist";
import { plainTextToTiptapDoc } from "./email-inline-images";
import { docPlainText } from "./composer-draft";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";

type Props = {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  /** Abre el sheet de estilo de respuesta IA (mismo que reply). */
  onOpenAiStyle?: () => void;
  /** Abre preferencias en la pestaña Firma. */
  onOpenSignature?: () => void;
  /** Casilla preferida al redactar (alcance activo o default). */
  preferredAccountId?: string | null;
  shortcuts?: CorreoShortcuts;
};

type WindowState = "normal" | "minimized" | "expanded";

/**
 * Composición nueva desde la bandeja: fullscreen opaco en móvil (sin Liquid
 * Glass — el vidrio dejaba leer la bandeja detrás) y ventana tipo Gmail en
 * desktop (minimizar / expandir / cerrar).
 *
 * Incluye asistente IA (misma UX que reply) y fila CRM cuenta/negocio vía
 * EmailComposer.
 *
 * Scroll estilo Gmail: la barra de título queda fija y el resto (Para, Asunto,
 * cuerpo, adjuntos, Enviar) se desplaza junto. Cerrar con cambios pregunta
 * Guardar / Descartar; minimizar deja el borrador a mano como barra inferior.
 */
export function CorreoComposeSheet({
  open,
  onClose,
  onSent,
  onOpenAiStyle,
  onOpenSignature,
  preferredAccountId = null,
  shortcuts,
}: Props) {
  const [dirty, setDirty] = useState(false);
  const [win, setWin] = useState<WindowState>("normal");
  const [mounted, setMounted] = useState(false);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const composerRef = useRef<EmailComposerHandle>(null);

  const bodyRef = useRef<object | null>(null);
  const subjectRef = useRef("");
  const toRef = useRef<string[]>([]);
  const aiSeededRef = useRef(false);
  const [ai, setAi] = useState(false);
  const [seed, setSeed] = useState<object | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [instructions, setInstructions] = useState("");
  const instructionsRef = useRef("");
  const [generating, setGenerating] = useState(false);
  const [hasAiDraft, setHasAiDraft] = useState(false);
  // Compose sheet: md (768) — distinto del reply composer (lg/1024).
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const vv = useVisualViewportFrame();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || win === "minimized" || isDesktop) return;
    void hideKeyboardAccessoryBar();
    return subscribeHideKeyboardAccessoryBar();
  }, [open, win, isDesktop]);

  useEffect(() => {
    if (open) {
      setWin("normal");
      setClosePromptOpen(false);
    } else {
      setDirty(false);
      setClosePromptOpen(false);
      setAi(false);
      instructionsRef.current = "";
      setInstructions("");
      setGenerating(false);
      setHasAiDraft(false);
      setSeed(null);
      setEpoch(0);
      bodyRef.current = null;
      subjectRef.current = "";
      toRef.current = [];
      aiSeededRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!ai) {
      aiSeededRef.current = false;
      instructionsRef.current = "";
      setInstructions("");
      return;
    }
    if (aiSeededRef.current) return;
    aiSeededRef.current = true;
    if (docPlainText(bodyRef.current).trim()) {
      setHasAiDraft(true);
    }
  }, [ai]);

  function setAiInstructions(value: string) {
    instructionsRef.current = value;
    setInstructions(value);
  }

  function injectDraft(text: string) {
    const doc = plainTextToTiptapDoc(text);
    bodyRef.current = doc;
    setSeed(doc);
    setEpoch((e) => e + 1);
    setHasAiDraft(true);
    instructionsRef.current = "";
    setInstructions("");
  }

  async function runAi(opts?: { refine?: DraftRefineMode }) {
    // Ref: Enter justo después de tipear puede correr antes del re-render.
    const prompt = instructionsRef.current.trim();
    const currentDraft = docPlainText(bodyRef.current).trim();
    const refine = opts?.refine;
    if (refine == null && hasAiDraft && !prompt) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/crm/correos/suggest-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: prompt || undefined,
          currentDraft:
            refine || (hasAiDraft && currentDraft) ? currentDraft || undefined : undefined,
          refine: refine || undefined,
          subject: subjectRef.current || undefined,
          to: toRef.current,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        draft?: unknown;
        error?: string;
        title?: string;
      };
      if (!res.ok || !d.draft) {
        toast.error(d.title || "No se pudo generar el borrador", {
          description: d.error || "Reintentá en unos segundos.",
        });
        return;
      }
      injectDraft(String(d.draft));
    } catch {
      toast.error("No se pudo generar el borrador", {
        description: "Sin conexión o error inesperado. Reintentá.",
      });
    } finally {
      setGenerating(false);
    }
  }

  if (!open || !mounted) return null;

  const finishClose = () => {
    setDirty(false);
    setClosePromptOpen(false);
    setWin("normal");
    onClose();
  };

  const requestClose = () => {
    if (!dirty) {
      finishClose();
      return;
    }
    setClosePromptOpen(true);
  };

  const saveAndClose = async () => {
    setCloseBusy(true);
    try {
      await composerRef.current?.flushDraft();
      finishClose();
    } finally {
      setCloseBusy(false);
    }
  };

  const discardAndClose = async () => {
    setCloseBusy(true);
    try {
      await composerRef.current?.discardDraft();
      finishClose();
    } finally {
      setCloseBusy(false);
    }
  };

  const mobileFs = win !== "minimized" && !isDesktop;
  const mobileFsStyle = mobileFs
    ? ({
        top: vv.top,
        height: vv.height || "100dvh",
        bottom: "auto",
      } as const)
    : undefined;
  // El notch solo deja de aplicar en la medida en que el visual viewport se
  // desplaza hacia abajo (vv.top). Con teclado iOS suele mantener top = 0, así
  // que restar el safe-area a ciegas metía la topbar (Enviar) bajo la status
  // bar justo al escribir. `max(..., 0px)` evita el padding negativo.
  const sheetHeaderPadTop = mobileFs
    ? `calc(max(env(safe-area-inset-top, 0px) - ${vv.top}px, 0px) + 0.5rem)`
    : undefined;

  const panel = (
    <div
      role="dialog"
      aria-modal={win !== "minimized"}
      aria-label="Mensaje nuevo"
      className={cn(
        // Opaco siempre: overlays de redacción no usan Liquid Glass.
        "flex flex-col overflow-hidden border border-ds-border-default bg-background text-ds-text-1 shadow-2xl",
        // Móvil: fullscreen (o barra inferior si está minimizado).
        "fixed z-[60]",
        win === "minimized"
          ? [
              // Barra dock tipo Gmail: sobre la bottom nav / safe-area.
              "inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] h-12 rounded-2xl",
              "md:inset-auto md:bottom-0 md:right-4 md:h-12 md:w-[min(420px,calc(100vw-2rem))] md:rounded-t-xl md:rounded-b-none md:border-b-0",
            ]
          : [
              // Móvil: anclado al visualViewport (no inset-0) para que la
              // topbar no desaparezca bajo el teclado iOS.
              "inset-x-0 rounded-none md:inset-auto",
              // Desktop: dock abajo-derecha (Gmail).
              "md:bottom-0 md:right-4 md:top-auto md:h-auto",
            ],
        win === "normal" &&
          "md:h-[min(640px,calc(100dvh-5rem))] md:w-[min(720px,calc(100vw-2rem))] md:rounded-t-2xl",
        win === "expanded" &&
          "md:bottom-4 md:right-4 md:top-16 md:h-auto md:w-[min(960px,calc(100vw-2rem))] md:rounded-2xl",
      )}
      style={mobileFs ? mobileFsStyle : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b border-ds-border-subtle px-3",
          "bg-ds-surface-2",
          win === "minimized"
            ? "h-12 rounded-[inherit] border-b-0 pt-0"
            : // Móvil fullscreen: pt safe-area suma altura (sin h-* fijo).
              "min-h-12 pb-2 md:h-11 md:min-h-0 md:pb-0 md:pt-0",
        )}
        style={sheetHeaderPadTop ? { paddingTop: sheetHeaderPadTop } : undefined}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left ds-tap"
          onClick={() => {
            if (win === "minimized") setWin("normal");
          }}
          aria-label={win === "minimized" ? "Restaurar mensaje nuevo" : undefined}
        >
          <PenLine className="h-4 w-4 shrink-0 text-ds-text-3" />
          <p className="truncate text-sm font-medium text-ds-text-1">Mensaje nuevo</p>
          {win === "minimized" && dirty && (
            <span className="shrink-0 text-[12px] text-ds-text-4">Borrador</span>
          )}
        </button>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label={win === "minimized" ? "Restaurar" : "Minimizar"}
            title={win === "minimized" ? "Restaurar" : "Minimizar"}
            onClick={() => setWin((w) => (w === "minimized" ? "normal" : "minimized"))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 md:h-9 md:w-9"
          >
            {win === "minimized" ? (
              <Maximize2 className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            aria-label={win === "expanded" ? "Restaurar tamaño" : "Expandir"}
            title={win === "expanded" ? "Restaurar tamaño" : "Expandir"}
            onClick={() =>
              setWin((w) => (w === "expanded" ? "normal" : "expanded"))
            }
            className="hidden h-10 w-10 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 md:inline-flex md:h-9 md:w-9"
          >
            {win === "expanded" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={requestClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 md:h-9 md:w-9"
          >
            <X className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>
      </div>

      {/* Mantener montado al minimizar para no perder el borrador en memoria. */}
      <div
        className={cn(
          // Página completa scrollea (Gmail): Para/Asunto/cuerpo/Enviar juntos.
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 [-webkit-overflow-scrolling:touch]",
          win === "minimized" && "hidden",
        )}
      >
        <EmailComposer
          ref={composerRef}
          mode="new"
          layout="sheet"
          preferredAccountId={preferredAccountId}
          initialContent={seed}
          contentEpoch={epoch}
          onBodyChange={(doc) => {
            bodyRef.current = doc;
          }}
          onSubjectChange={(s) => {
            subjectRef.current = s;
          }}
          onToChange={(next) => {
            toRef.current = next;
          }}
          onOpenSignature={onOpenSignature}
          aboveFooter={
            ai ? (
              <ComposerAiPromptPill
                mode="compose"
                value={instructions}
                onChange={setAiInstructions}
                onGenerate={() => void runAi()}
                onRefine={(preset) => void runAi({ refine: preset })}
                onClose={() => setAi(false)}
                generating={generating}
                hasDraft={hasAiDraft}
                onOpenStyle={onOpenAiStyle}
              />
            ) : null
          }
          footerExtras={
            <ComposerAiAssistToggle
              mode="compose"
              open={ai}
              onToggle={() => setAi((v) => !v)}
              disabled={generating}
            />
          }
          onSent={onSent}
          onClose={() => {
            setDirty(false);
            onClose();
          }}
          onDirtyChange={setDirty}
          shortcuts={shortcuts}
        />
      </div>
    </div>
  );

  return createPortal(
    <>
      {/* Móvil: backdrop opaco de cierre. Desktop: solo al expandir. */}
      {win !== "minimized" && (
        <div
          className={cn(
            "fixed inset-0 z-[59] bg-black/50",
            win === "normal" && "md:pointer-events-none md:bg-transparent",
            win === "expanded" && "md:bg-black/40",
          )}
          onClick={win === "expanded" ? () => setWin("normal") : requestClose}
          aria-hidden
        />
      )}
      {panel}

      <Dialog open={closePromptOpen} onOpenChange={(o) => !closeBusy && setClosePromptOpen(o)}>
        <DialogContent
          // Por encima del compose sheet (z-[60]) y su backdrop (z-[59]).
          className="z-[70] sm:max-w-md"
          overlayClassName="z-[69]"
        >
          <DialogHeader>
            <DialogTitle>¿Guardar borrador?</DialogTitle>
            <DialogDescription>
              Tenés cambios sin enviar. Podés guardarlos en Borradores, descartarlos
              o seguir escribiendo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              disabled={closeBusy}
              onClick={() => void saveAndClose()}
              className="w-full"
            >
              Guardar borrador
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={closeBusy}
              onClick={() => setClosePromptOpen(false)}
              className="w-full"
            >
              Seguir escribiendo
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={closeBusy}
              onClick={() => void discardAndClose()}
              className="w-full"
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>,
    document.body,
  );
}
