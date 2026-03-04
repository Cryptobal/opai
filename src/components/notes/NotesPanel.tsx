"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Filter,
  Loader2,
  MessageSquareText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotesContext, type NoteData } from "./NotesProvider";
import { NoteThread } from "./NoteThread";
import { NoteInput } from "./NoteInput";

/* ─── Filter tabs ─── */

type FilterTab = "all" | "alerts" | "decisions" | "tasks";
type VisFilterTab = "all" | "public" | "private";

const FILTER_TABS: Array<{ value: FilterTab; label: string; icon?: string }> = [
  { value: "all", label: "Todas" },
  { value: "alerts", label: "Alertas", icon: "🚨" },
  { value: "decisions", label: "Decisiones", icon: "✅" },
  { value: "tasks", label: "Tareas", icon: "📋" },
];

const VIS_FILTER_TABS: Array<{ value: VisFilterTab; label: string; icon?: string }> = [
  { value: "all", label: "Todas" },
  { value: "public", label: "Públicas" },
  { value: "private", label: "Privadas", icon: "🔒" },
];

/* ─── Component ─── */

export function NotesPanel() {
  const ctx = useNotesContext();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [visFilter, setVisFilter] = useState<VisFilterTab>("all");
  const [highlightedNoteId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // ── Mobile drag-to-close ──
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start drag from the header area (first 60px)
    const touch = e.touches[0];
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeY = touch.clientY - rect.top;
    if (relativeY > 60) return; // Only drag from header
    dragStartY.current = touch.clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) { // Only allow dragging down
      dragCurrentY.current = delta;
      setDragOffset(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragCurrentY.current > 120) {
      ctx.closePanel();
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
    setDragOffset(0);
  }, [ctx]);

  // ── Close on Escape ──
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ctx.isPanelOpen, ctx]);

  // ── Lock body scroll on mobile when open (iOS-safe) ──
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
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
  }, [ctx.isPanelOpen]);

  // ── Close on click outside (desktop) ──
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        backdropRef.current &&
        e.target === backdropRef.current
      ) {
        ctx.closePanel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctx.isPanelOpen, ctx]);

  // ── Filter notes ──
  const filteredNotes = ctx.notes.filter((n: NoteData) => {
    // Type filter
    if (activeFilter === "alerts" && n.noteType !== "ALERT") return false;
    if (activeFilter === "decisions" && n.noteType !== "DECISION") return false;
    if (activeFilter === "tasks" && n.noteType !== "TASK") return false;
    // Visibility filter
    if (visFilter === "public" && n.visibility !== "PUBLIC") return false;
    if (visFilter === "private" && n.visibility === "PUBLIC") return false;
    return true;
  });

  // Check if any private notes exist to show the filter
  const hasPrivateNotes = ctx.notes.some((n: NoteData) => n.visibility !== "PUBLIC");

  if (!ctx.isPanelOpen) return null;

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        ref={backdropRef}
        className={cn(
          "fixed inset-0 z-[60] transition-opacity duration-300",
          "bg-black/40 backdrop-blur-[2px]",
          // On desktop, backdrop is only on the right side area
          "sm:bg-black/20 sm:backdrop-blur-none",
        )}
        aria-hidden="true"
      />

      {/* ── Panel ── */}
      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "fixed z-[61] flex flex-col bg-background border-border transition-transform duration-300 ease-out",
          // Mobile: bottom sheet
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t shadow-2xl",
          // Desktop: right slide-in
          "sm:bottom-0 sm:right-6 sm:left-auto sm:top-auto sm:w-[600px] sm:max-h-[75vh] sm:rounded-t-2xl sm:rounded-b-none sm:border sm:border-b-0 sm:shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)]",
          // Animation
          ctx.isPanelOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        role="dialog"
        aria-label="Panel de notas"
      >
        {/* ── Mobile drag handle ── */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0">
          <MessageSquareText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate">Notas</h2>
            <p className="text-[10px] text-muted-foreground truncate">{ctx.contextLabel}</p>
          </div>

          {/* Follow toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => void ctx.toggleFollow()}
            title={ctx.isFollowing ? "Dejar de seguir" : "Seguir para notificaciones"}
          >
            {ctx.isFollowing ? (
              <Bell className="h-3.5 w-3.5 text-primary" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={ctx.closePanel}
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/30 shrink-0 overflow-x-auto">
          <Filter className="h-3 w-3 text-muted-foreground shrink-0 mr-1" />
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveFilter(tab.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap",
                activeFilter === tab.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.icon && <span className="text-[10px]">{tab.icon}</span>}
              {tab.label}
              {tab.value === "all" && ctx.totalNotes > 0 && (
                <span className="text-[9px] opacity-60">({ctx.totalNotes})</span>
              )}
            </button>
          ))}
          {/* Visibility filter (only show when private notes exist) */}
          {hasPrivateNotes && (
            <>
              <div className="h-3 w-px bg-border/50 mx-1" />
              {VIS_FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setVisFilter(tab.value)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap",
                    visFilter === tab.value
                      ? "bg-amber-500/10 text-amber-500"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {tab.icon && <span className="text-[10px]">{tab.icon}</span>}
                  {tab.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* ── Notes list ── */}
        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0 space-y-1">
          {ctx.loading ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Cargando notas...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <MessageSquareText className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">
                {activeFilter === "all" ? "Sin notas aún" : "Sin notas de este tipo"}
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Escribe la primera nota abajo
              </p>
            </div>
          ) : (
            filteredNotes.map((note, idx) => (
              <div
                key={note.id}
                className={cn(
                  "py-2",
                  idx < filteredNotes.length - 1 && "border-b border-border/30",
                )}
              >
                <NoteThread note={note} highlightedNoteId={highlightedNoteId} />
              </div>
            ))
          )}
        </div>

        {/* ── Input area ── */}
        <div className="shrink-0 border-t border-border/60 px-3 py-2 pb-safe">
          <NoteInput />
        </div>
      </div>
    </>
  );
}
