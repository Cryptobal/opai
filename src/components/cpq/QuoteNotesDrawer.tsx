"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotesSection } from "@/components/crm/NotesSection";

interface QuoteNotesDrawerProps {
  quoteId: string;
  currentUserId: string;
}

/**
 * QuoteNotesDrawer — Drawer flotante de notas para cotización.
 *
 * Se abre desde el botón en la barra de navegación del wizard.
 * Slide-up desde abajo con backdrop semi-transparente.
 */
export function QuoteNotesDrawer({
  quoteId,
  currentUserId,
}: QuoteNotesDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [noteCount, setNoteCount] = useState(0);

  const fetchNoteCount = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/crm/notes?entityType=quote&entityId=${quoteId}&limit=1`
      );
      const data = await res.json();
      if (data?.success && typeof data?.meta?.total === "number") {
        setNoteCount(data.meta.total);
      }
    } catch {
      // silent
    }
  }, [quoteId]);

  useEffect(() => {
    fetchNoteCount();
  }, [fetchNoteCount]);

  // Refresh count when notes are created inside the drawer
  useEffect(() => {
    if (!isOpen) {
      fetchNoteCount();
    }
  }, [isOpen, fetchNoteCount]);

  // Lock body scroll when open (iOS-safe: position:fixed prevents scroll-through)
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  return (
    <>
      {/* Trigger button — rendered inline where placed */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Notas"
        title="Notas"
      >
        <MessageSquareText className="h-4 w-4" />
        {noteCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {noteCount > 99 ? "99+" : noteCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-background border-t border-border rounded-t-xl shadow-2xl transition-transform duration-300 ease-out",
          "max-h-[75dvh]",
          isOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notas</span>
            {noteCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                ({noteCount})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Cerrar notas"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {isOpen && (
            <NotesSection
              entityType="quote"
              entityId={quoteId}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </div>
    </>
  );
}
