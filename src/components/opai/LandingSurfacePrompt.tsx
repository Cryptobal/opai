"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Surface } from "@/lib/surface";

/**
 * Pregunta una sola vez la superficie de arranque cuando el usuario
 * aún no tiene `landingSurface` en AdminPreference.
 */
export function LandingSurfacePrompt() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/preferences/landing", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { landingSurface?: string | null };
        if (!cancelled && data.landingSurface == null) {
          setOpen(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (landingSurface: Surface) => {
    if (saving || pending) return;
    setSaving(true);
    try {
      await fetch("/api/me/preferences/landing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landingSurface }),
      });
      if (landingSurface === "productividad") {
        await fetch("/api/me/surface", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surface: "productividad" }),
        });
        setOpen(false);
        startTransition(() => {
          router.push("/productividad");
          router.refresh();
        });
      } else {
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      // Solo se cierra al elegir: evita perder el prompt sin preferencia guardada.
      onOpenChange={() => {}}
    >
      <DialogContent
        className="max-w-md gap-0 p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="font-display text-lg">
            ¿Dónde quieres empezar?
          </DialogTitle>
          <DialogDescription className="text-[13px] text-ds-text-3">
            Puedes cambiar cuando quieras con el selector ERP / Productividad
            (barra superior en desktop, isla inferior en móvil). No está en
            Configuración: es una preferencia de sesión y de arranque.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 px-4 pb-5">
          <ChoiceButton
            icon={Sparkles}
            title="Productividad"
            description="Correos, tareas, agenda y tickets"
            disabled={saving || pending}
            onClick={() => void choose("productividad")}
          />
          <ChoiceButton
            icon={Building2}
            title="ERP completo"
            description="Hub, comercial, operaciones y más"
            disabled={saving || pending}
            onClick={() => void choose("erp")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceButton({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3.5 py-3 text-left",
        "transition-colors hover:border-primary/40 hover:bg-primary/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:opacity-60",
      )}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ds-text-1">{title}</span>
        <span className="block text-[12px] text-ds-text-3">{description}</span>
      </span>
    </button>
  );
}
