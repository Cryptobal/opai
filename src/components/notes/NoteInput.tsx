"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AtSign,
  Building2,
  Contact,
  FileText,
  Hash,
  Loader2,
  Lock,
  Globe,
  MapPin,
  Paperclip,
  Plus,
  Send,
  Shield,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useNotesContext,
  type MentionOption,
  type NoteUser,
} from "./NotesProvider";

/* ─── Permission helpers (client-side role checks) ─── */

function isAdminRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === "owner" || r === "admin";
}

function canCreateNoteType(role: string, noteType: NoteTypeValue): boolean {
  if (noteType === "GENERAL" || noteType === "TASK") return true;
  // ALERT and DECISION require admin/owner
  return isAdminRole(role);
}

function canMentionAll(role: string): boolean {
  return isAdminRole(role);
}

/* ─── Types ─── */

type NoteTypeValue = "GENERAL" | "ALERT" | "DECISION" | "TASK";
type VisibilityValue = "PUBLIC" | "PRIVATE" | "GROUP";

interface NoteInputProps {
  /** If set, this input creates a reply */
  parentNoteId?: string | null;
  replyToAuthor?: string | null;
  onCancelReply?: () => void;
  onSent?: () => void;
  compact?: boolean;
}

type SearchCategory = {
  key: string;
  label: string;
  items: Array<{ id: string; label: string; code?: string | null; subtitle?: string }>;
};

/* ─── Constants ─── */

const NOTE_TYPES: Array<{ value: NoteTypeValue; icon: string; label: string }> = [
  { value: "GENERAL", icon: "💬", label: "General" },
  { value: "ALERT", icon: "🚨", label: "Alerta" },
  { value: "DECISION", icon: "✅", label: "Decisión" },
  { value: "TASK", icon: "📋", label: "Tarea" },
];

const VISIBILITY_OPTIONS: Array<{ value: VisibilityValue; icon: typeof Globe; label: string }> = [
  { value: "PUBLIC", icon: Globe, label: "Pública" },
  { value: "PRIVATE", icon: Lock, label: "Privada" },
  { value: "GROUP", icon: Users, label: "Grupo" },
];

/* ─── Helpers ─── */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/* ─── Component ─── */

export function NoteInput({
  parentNoteId,
  replyToAuthor,
  onCancelReply,
  onSent,
  compact,
}: NoteInputProps) {
  const ctx = useNotesContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [noteType, setNoteType] = useState<NoteTypeValue>("GENERAL");
  const [visibility, setVisibility] = useState<VisibilityValue>("PUBLIC");
  const [visibleToUsers, setVisibleToUsers] = useState<string[]>([]);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showVisSelector, setShowVisSelector] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);

  // @mention
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);

  // #reference search
  const [showEntitySearch, setShowEntitySearch] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");
  const [entityResults, setEntityResults] = useState<SearchCategory[]>([]);
  const [entitySearching, setEntitySearching] = useState(false);
  const [selectedEntityIdx, setSelectedEntityIdx] = useState(0);

  // Entity ref labels map: "TYPE:uuid" → { label, code }
  const entityRefLabelsRef = useRef<Record<string, { label: string; code?: string | null }>>({});

  // File attachments
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; type: string; size: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Permission-filtered note types ──
  const availableNoteTypes = useMemo(
    () => NOTE_TYPES.filter((t) => canCreateNoteType(ctx.currentUserRole, t.value)),
    [ctx.currentUserRole],
  );

  // ── Mention options (filter @Todos for non-admins) ──
  const mentionOptions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const allowAll = canMentionAll(ctx.currentUserRole);
    const special = ctx.specialMentions
      .filter((s) => {
        if (!allowAll && s.key === "all") return false;
        return !q || s.label.toLowerCase().includes(q) || s.token.toLowerCase().includes(q);
      })
      .map((s) => ({ ...s, kind: "special" as const }));
    const gs = ctx.groups
      .filter((g) => !q || g.name.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q))
      .map((g) => ({ ...g, kind: "group" as const }));
    const us = ctx.users
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      .map((u) => ({ ...u, kind: "user" as const }));
    return { special, groups: gs, users: us, all: [...special, ...gs, ...us] as MentionOption[] };
  }, [mentionQuery, ctx.specialMentions, ctx.groups, ctx.users, ctx.currentUserRole]);

  // ── Auto-resize textarea ──
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxH = compact ? 72 : 96;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [compact]);

  useEffect(() => autoResize(), [content, autoResize]);

  // ── Text change handler ──
  const handleChange = (value: string) => {
    setContent(value);
    const el = textareaRef.current;
    if (!el) return;

    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor).replace(/\u00A0/g, " ");

    // Check for @mention trigger
    const atMatch = before.match(/(?:^|\s)[@＠]([\p{L}\p{N}._-]*)$/u);
    if (atMatch) {
      setMentionQuery((atMatch[1] || "").toLowerCase());
      setShowMentions(true);
      setShowEntitySearch(false);
      setSelectedMentionIdx(0);
      return;
    }

    // Check for #entity trigger (show dropdown immediately on # or /)
    const hashMatch = before.match(/(?:^|\s)[#/]([\p{L}\p{N}\s._-]*)$/u);
    if (hashMatch) {
      setEntityQuery((hashMatch[1] || "").trim());
      setShowEntitySearch(true);
      setShowMentions(false);
      setSelectedEntityIdx(0);
      return;
    }

    setShowMentions(false);
    setShowEntitySearch(false);
  };

  // ── Entity search fetch ──
  useEffect(() => {
    if (!showEntitySearch || entityQuery.length < 2) {
      setEntityResults([]);
      return;
    }
    const ac = new AbortController();
    setEntitySearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/universal?q=${encodeURIComponent(entityQuery)}&limit=4`, {
          signal: ac.signal,
        });
        const data = await res.json();
        if (data.success) {
          const d = data.data;
          const cats: SearchCategory[] = [];
          if (d.quotations?.length) cats.push({ key: "QUOTATION", label: "Cotizaciones", items: d.quotations });
          if (d.installations?.length) cats.push({ key: "INSTALLATION", label: "Instalaciones", items: d.installations });
          if (d.accounts?.length) cats.push({ key: "ACCOUNT", label: "Cuentas", items: d.accounts });
          if (d.contacts?.length) cats.push({ key: "CONTACT", label: "Contactos", items: d.contacts });
          if (d.deals?.length) cats.push({ key: "DEAL", label: "Negocios", items: d.deals });
          if (d.guards?.length) cats.push({ key: "GUARD", label: "Guardias", items: d.guards });
          if (d.documents?.length) cats.push({ key: "DOCUMENT", label: "Documentos", items: d.documents });
          setEntityResults(cats);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      } finally {
        setEntitySearching(false);
      }
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [entityQuery, showEntitySearch]);

  // ── Insert @mention ──
  const insertMention = useCallback((option: MentionOption) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const atMatch = before.match(/(?:^|\s)[@＠]([\p{L}\p{N}._-]*)$/u);
    if (!atMatch) return;
    const segment = atMatch[0];
    const atIndex = cursor - segment.length + (segment.startsWith(" ") ? 1 : 0);
    const label = option.kind === "special" ? option.token : option.name;
    const after = content.slice(cursor);
    setContent(`${content.slice(0, Math.max(0, atIndex))}@${label} ${after}`);
    setShowMentions(false);
    setTimeout(() => {
      const pos = Math.max(0, atIndex) + label.length + 2;
      el.setSelectionRange(pos, pos);
      el.focus();
    }, 0);
  }, [content]);

  // ── Insert #entity reference ──
  const insertEntityRef = useCallback((catKey: string, item: { id: string; label: string; code?: string | null }) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const hashMatch = before.match(/(?:^|\s)[#/]([\p{L}\p{N}\s._-]*)$/u);
    if (!hashMatch) return;
    const segment = hashMatch[0];
    const hashIndex = cursor - segment.length + (segment.startsWith(" ") ? 1 : 0);
    const ref = `#${catKey}:${item.id}`;
    const after = content.slice(cursor);
    setContent(`${content.slice(0, Math.max(0, hashIndex))}${ref} ${after}`);
    // Store label for this entity ref
    entityRefLabelsRef.current[`${catKey}:${item.id}`] = { label: item.label, code: item.code };
    setShowEntitySearch(false);
    setTimeout(() => {
      const pos = Math.max(0, hashIndex) + ref.length + 1;
      el.setSelectionRange(pos, pos);
      el.focus();
    }, 0);
  }, [content]);

  // ── Keyboard navigation ──
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionOptions.all.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedMentionIdx((i) => Math.min(i + 1, mentionOptions.all.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedMentionIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionOptions.all[selectedMentionIdx]); }
      else if (e.key === "Escape") { setShowMentions(false); }
      return;
    }
    if (showEntitySearch) {
      const allItems = entityResults.flatMap((c) => c.items.map((it) => ({ ...it, catKey: c.key })));
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedEntityIdx((i) => Math.min(i + 1, allItems.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedEntityIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const sel = allItems[selectedEntityIdx];
        if (sel) insertEntityRef(sel.catKey, sel);
      }
      else if (e.key === "Escape") { setShowEntitySearch(false); }
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
    if (e.key === "Escape" && parentNoteId && onCancelReply) {
      onCancelReply();
    }
  };

  // ── File upload ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} excede 10 MB`);
        continue;
      }
      setAttachments((prev) => [
        ...prev,
        { name: file.name, url: URL.createObjectURL(file), type: file.type, size: file.size },
      ]);
    }
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Send ──
  const handleSend = async () => {
    if (!content.trim() && attachments.length === 0) return;
    setSending(true);
    try {
      const body: Record<string, any> = {
        content: content.trim(),
        noteType,
        visibility,
        visibleToUsers: visibility === "PUBLIC" ? [] : visibleToUsers,
      };
      // Task metadata
      if (noteType === "TASK") {
        body.metadata = { completed: false, completedAt: null, completedBy: null };
      }
      if (parentNoteId) {
        body.parentNoteId = parentNoteId;
      } else {
        body.contextType = ctx.contextType;
        body.contextId = ctx.contextId;
      }
      if (attachments.length > 0) {
        body.attachments = attachments.map((a) => ({
          fileName: a.name,
          fileUrl: a.url,
          fileType: a.type,
          fileSize: a.size,
        }));
      }
      // Include entity ref labels for backend storage
      if (Object.keys(entityRefLabelsRef.current).length > 0) {
        body.entityRefLabels = entityRefLabelsRef.current;
      }

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al crear nota");

      setContent("");
      setAttachments([]);
      setNoteType("GENERAL");
      setVisibility("PUBLIC");
      setVisibleToUsers([]);
      entityRefLabelsRef.current = {};
      toast.success(parentNoteId ? "Respuesta enviada" : "Nota agregada");
      await ctx.fetchNotes();
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar");
    } finally {
      setSending(false);
    }
  };

  // ── User search for picker ──
  const [userPickerQuery, setUserPickerQuery] = useState("");
  const filteredPickerUsers = useMemo(() => {
    const q = userPickerQuery.trim().toLowerCase();
    return ctx.users
      .filter((u) => u.id !== ctx.currentUserId)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [ctx.users, ctx.currentUserId, userPickerQuery]);

  // ── Visible-to-users toggle ──
  const toggleVisibleUser = (userId: string) => {
    if (visibility === "PRIVATE") {
      // PRIVATE: single user — replace selection
      setVisibleToUsers([userId]);
    } else {
      // GROUP: multi-user toggle
      setVisibleToUsers((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
      );
    }
  };

  // ── Resolve selected user names ──
  const selectedUserNames = useMemo(() => {
    return visibleToUsers
      .map((uid) => ctx.users.find((u) => u.id === uid)?.name)
      .filter(Boolean) as string[];
  }, [visibleToUsers, ctx.users]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTypeSelector(false);
        setShowVisSelector(false);
        setShowUserPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentType = NOTE_TYPES.find((t) => t.value === noteType)!;
  const currentVis = VISIBILITY_OPTIONS.find((v) => v.value === visibility)!;
  const VisIcon = currentVis.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Reply indicator */}
      {parentNoteId && replyToAuthor && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/40 rounded-t-lg border border-b-0 border-border/60">
          <span>Respondiendo a <strong className="text-foreground">{replyToAuthor}</strong></span>
          <button type="button" onClick={onCancelReply} className="ml-auto hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Textarea */}
      <div className={cn(
        "relative rounded-lg border border-border/60 bg-background focus-within:ring-1 focus-within:ring-ring transition-colors",
        parentNoteId && replyToAuthor && "rounded-t-none border-t-0",
      )}>
        {/* @mention dropdown */}
        {showMentions && mentionOptions.all.length > 0 && (
          <MentionDropdown
            options={mentionOptions}
            selectedIdx={selectedMentionIdx}
            onSelect={insertMention}
          />
        )}

        {/* #entity search dropdown */}
        {showEntitySearch && (
          <EntitySearchDropdown
            categories={entityResults}
            searching={entitySearching}
            query={entityQuery}
            selectedIdx={selectedEntityIdx}
            onSelect={insertEntityRef}
          />
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={parentNoteId ? "Escribe una respuesta..." : "Escribe una nota... usa @ o # para vincular"}
          className={cn(
            "w-full resize-none bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none",
            compact ? "min-h-[40px]" : "min-h-[56px]",
          )}
          rows={1}
        />

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                <Paperclip className="h-2.5 w-2.5" />
                {a.name.length > 20 ? `${a.name.slice(0, 18)}...` : a.name}
                <button type="button" onClick={() => removeAttachment(i)} className="hover:text-foreground">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border/30">
          {/* Note type selector */}
          {!parentNoteId && availableNoteTypes.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowTypeSelector(!showTypeSelector); setShowVisSelector(false); setShowUserPicker(false); }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Tipo de nota"
              >
                <span>{currentType.icon}</span>
              </button>
              {showTypeSelector && (
                <div className="absolute bottom-full mb-1 left-0 z-50 rounded-md border border-border bg-popover shadow-lg py-1 min-w-[130px]">
                  {availableNoteTypes.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                        noteType === t.value && "bg-accent/50",
                      )}
                      onClick={() => { setNoteType(t.value); setShowTypeSelector(false); }}
                    >
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Visibility selector */}
          {!parentNoteId && (
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowVisSelector(!showVisSelector); setShowTypeSelector(false); setShowUserPicker(false); }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Visibilidad"
              >
                <VisIcon className="h-3 w-3" />
              </button>
              {showVisSelector && (
                <div className="absolute bottom-full mb-1 left-0 z-50 rounded-md border border-border bg-popover shadow-lg py-1 min-w-[120px]">
                  {VISIBILITY_OPTIONS.map((v) => {
                    const Icon = v.icon;
                    return (
                      <button
                        key={v.value}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                          visibility === v.value && "bg-accent/50",
                        )}
                        onClick={() => {
                          setVisibility(v.value);
                          setShowVisSelector(false);
                          if (v.value === "PUBLIC") {
                            setShowUserPicker(false);
                            setVisibleToUsers([]);
                          } else {
                            // Reset selection when switching between PRIVATE (single) and GROUP (multi)
                            if (v.value === "PRIVATE" && visibleToUsers.length > 1) {
                              setVisibleToUsers(visibleToUsers.slice(0, 1));
                            }
                            setShowUserPicker(true);
                          }
                        }}
                      >
                        <Icon className="h-3 w-3" />
                        <span>{v.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center rounded px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Adjuntar archivo"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

          {/* Entity search trigger (+ button) */}
          <button
            type="button"
            onClick={() => {
              const el = textareaRef.current;
              if (el) {
                const cursor = el.selectionStart ?? content.length;
                const before = content.slice(0, cursor);
                const needsSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
                setContent(before + (needsSpace ? " #" : "#") + content.slice(cursor));
                setTimeout(() => {
                  const pos = cursor + (needsSpace ? 2 : 1);
                  el.setSelectionRange(pos, pos);
                  el.focus();
                }, 0);
              }
            }}
            className="inline-flex items-center rounded px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Vincular una entidad"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <div className="flex-1" />

          {/* Kbd hint */}
          <span className="hidden sm:inline text-[9px] text-muted-foreground/60 mr-1">
            Ctrl+Enter
          </span>

          {/* Send button */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={handleSend}
            disabled={sending || (!content.trim() && attachments.length === 0)}
            aria-label="Enviar"
            title="Enviar"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Visibility label */}
      {visibility !== "PUBLIC" && !parentNoteId && selectedUserNames.length > 0 && (
        <div className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" />
          <span>
            {visibility === "PRIVATE"
              ? `Mensaje privado para: ${selectedUserNames[0]}`
              : `Visible para: ${selectedUserNames.join(", ")}`}
          </span>
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => { setVisibility("PUBLIC"); setVisibleToUsers([]); setShowUserPicker(false); }}
            title="Cambiar a pública"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* User picker for PRIVATE/GROUP */}
      {showUserPicker && visibility !== "PUBLIC" && !parentNoteId && (
        <div className="mt-1.5 rounded-md border border-border bg-popover p-2 max-h-48 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {visibility === "PRIVATE" ? "Seleccionar destinatario" : "Seleccionar participantes"}
            </p>
            <button
              type="button"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setShowUserPicker(false)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {/* Search input */}
          <input
            type="text"
            value={userPickerQuery}
            onChange={(e) => setUserPickerQuery(e.target.value)}
            placeholder="Buscar usuario..."
            className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mb-1.5"
          />
          <div className="space-y-0.5 overflow-y-auto">
            {filteredPickerUsers.map((u) => (
              <label
                key={u.id}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer transition-colors",
                  visibleToUsers.includes(u.id)
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-accent",
                )}
              >
                <input
                  type={visibility === "PRIVATE" ? "radio" : "checkbox"}
                  name="visibleUser"
                  checked={visibleToUsers.includes(u.id)}
                  onChange={() => toggleVisibleUser(u.id)}
                  className="rounded border-border"
                />
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[8px] font-medium text-primary shrink-0">
                  {getInitials(u.name)}
                </div>
                <span className="truncate">{u.name}</span>
                {u.email && <span className="text-muted-foreground text-[10px] truncate">{u.email}</span>}
              </label>
            ))}
            {filteredPickerUsers.length === 0 && (
              <p className="text-[10px] text-muted-foreground py-2 text-center">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function MentionDropdown({
  options,
  selectedIdx,
  onSelect,
}: {
  options: { special: MentionOption[]; groups: MentionOption[]; users: MentionOption[]; all: MentionOption[] };
  selectedIdx: number;
  onSelect: (opt: MentionOption) => void;
}) {
  let cursor = 0;
  const renderItem = (option: MentionOption) => {
    const idx = cursor++;
    const isSelected = idx === selectedIdx;
    return (
      <button
        key={`${option.kind}-${option.kind === "user" ? option.id : option.kind === "group" ? option.id : (option as any).key}`}
        type="button"
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
        )}
        onMouseDown={(e) => { e.preventDefault(); onSelect(option); }}
      >
        {option.kind === "special" && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <AtSign className="h-3 w-3" />
          </span>
        )}
        {option.kind === "group" && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500 shrink-0">
            <Users className="h-3 w-3" />
          </span>
        )}
        {option.kind === "user" && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[9px] font-medium text-primary shrink-0">
            {getInitials(option.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{option.kind === "special" ? `@${option.label}` : option.name}</p>
          {option.kind === "user" && option.email && (
            <p className="truncate text-[10px] text-muted-foreground">{option.email}</p>
          )}
          {option.kind === "group" && (
            <p className="truncate text-[10px] text-muted-foreground">{option.memberCount} miembros</p>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="absolute z-[100] bottom-full mb-1 left-0 w-72 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
      {options.special.length > 0 && (
        <div>
          <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Especial</p>
          {options.special.map(renderItem)}
        </div>
      )}
      {options.groups.length > 0 && (
        <div>
          <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Grupos</p>
          {options.groups.map(renderItem)}
        </div>
      )}
      {options.users.length > 0 && (
        <div>
          <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Usuarios</p>
          {options.users.map(renderItem)}
        </div>
      )}
    </div>
  );
}

const ENTITY_CATEGORY_META: Record<string, { emoji: string; icon: typeof Building2; color: string }> = {
  QUOTATION: { emoji: "📋", icon: FileText, color: "text-blue-500" },
  INSTALLATION: { emoji: "🏢", icon: MapPin, color: "text-emerald-500" },
  ACCOUNT: { emoji: "👥", icon: Building2, color: "text-violet-500" },
  CONTACT: { emoji: "👤", icon: Contact, color: "text-sky-500" },
  DEAL: { emoji: "💼", icon: TrendingUp, color: "text-amber-500" },
  GUARD: { emoji: "🛡️", icon: Shield, color: "text-orange-500" },
  DOCUMENT: { emoji: "📄", icon: FileText, color: "text-rose-500" },
};

function EntitySearchDropdown({
  categories,
  searching,
  query,
  selectedIdx,
  onSelect,
}: {
  categories: SearchCategory[];
  searching: boolean;
  query: string;
  selectedIdx: number;
  onSelect: (catKey: string, item: { id: string; label: string; code?: string | null }) => void;
}) {
  let cursor = 0;
  const hasResults = categories.length > 0;
  return (
    <div className="absolute z-[100] bottom-full mb-1 left-0 w-80 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-popover border-b border-border/60 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          {query.length < 2
            ? "Escribe para buscar entidades..."
            : searching
              ? "Buscando..."
              : `Resultados para "${query}"`}
        </p>
      </div>

      {searching && (
        <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
        </div>
      )}

      {!searching && !hasResults && query.length >= 2 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          Sin resultados para &ldquo;{query}&rdquo;
        </div>
      )}

      {!searching && !hasResults && query.length < 2 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          Escribe al menos 2 caracteres
        </div>
      )}

      {categories.map((cat) => {
        const meta = ENTITY_CATEGORY_META[cat.key];
        const CatIcon = meta?.icon ?? Hash;
        return (
          <div key={cat.key}>
            <p className="flex items-center gap-1.5 px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {meta?.emoji && <span>{meta.emoji}</span>}
              {cat.label}
            </p>
            {cat.items.map((item) => {
              const idx = cursor++;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors",
                    idx === selectedIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(cat.key, item); }}
                >
                  <CatIcon className={cn("h-3.5 w-3.5 shrink-0", meta?.color ?? "text-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.label}</p>
                    {item.subtitle && <p className="truncate text-[10px] text-muted-foreground">{item.subtitle}</p>}
                  </div>
                  {item.code && (
                    <span className="shrink-0 text-[10px] text-muted-foreground font-mono">{item.code}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
