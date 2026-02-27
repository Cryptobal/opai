"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type { NoteContextType } from "@prisma/client";
import { NotesFloatingButton } from "./NotesFloatingButton";
import { NotesPanel } from "./NotesPanel";

/* ─── Types ─── */

export type NoteUser = { id: string; name: string; email?: string };
export type NoteGroup = {
  id: string;
  name: string;
  slug: string;
  color?: string;
  memberIds: string[];
  memberCount: number;
};
export type MentionSpecial = {
  id: string;
  key: string;
  label: string;
  aliases: string[];
  token: string;
};
export type MentionOption =
  | ({ kind: "special" } & MentionSpecial)
  | ({ kind: "group" } & NoteGroup)
  | ({ kind: "user" } & NoteUser);

export type NoteReactionItem = { id: string; emoji: string; userId: string };
export type NoteReactionSummary = { emoji: string; count: number; userIds: string[] };
export type NoteMentionItem = {
  id: string;
  mentionType: string;
  mentionedUserId?: string | null;
  mentionedRole?: string | null;
};

export type NoteEntityRefItem = {
  id: string;
  referencedEntityType: string;
  referencedEntityId: string;
  referencedEntityLabel: string;
  referencedEntityCode?: string | null;
};

export type NoteData = {
  id: string;
  tenantId: string;
  contextType: NoteContextType;
  contextId: string;
  authorId: string;
  content: string;
  contentHtml?: string | null;
  noteType: "GENERAL" | "ALERT" | "DECISION" | "TASK";
  visibility: "PUBLIC" | "PRIVATE" | "GROUP";
  visibleToUsers: string[];
  parentNoteId?: string | null;
  threadDepth: number;
  metadata?: any;
  attachments?: any;
  isEdited: boolean;
  isPinned: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author: NoteUser;
  replies: NoteData[];
  reactions: NoteReactionItem[];
  mentions: NoteMentionItem[];
  entityRefs?: NoteEntityRefItem[];
  replyCount: number;
  reactionSummary: NoteReactionSummary[];
};

type UnreadCounts = {
  total: number;
  byContext: Record<string, number>;
  byModule: Record<string, number>;
};

interface NotesContextValue {
  // Context identity
  contextType: NoteContextType;
  contextId: string;
  contextLabel: string;
  currentUserId: string;
  currentUserRole: string;

  // Panel state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  // Notes data
  notes: NoteData[];
  loading: boolean;
  fetchNotes: () => Promise<void>;
  totalNotes: number;

  // Local state mutations (avoid full refetch)
  updateNoteInState: (noteId: string, updater: (note: NoteData) => NoteData) => void;
  removeNoteFromState: (noteId: string) => void;
  addNoteToState: (note: NoteData) => void;

  // Unread
  unreadCount: number;
  hasUnreadMentions: boolean;
  refreshUnreadCounts: () => Promise<void>;
  markContextRead: () => Promise<void>;

  // Following
  isFollowing: boolean;
  toggleFollow: () => Promise<void>;

  // Users & groups (for mentions)
  users: NoteUser[];
  groups: NoteGroup[];
  specialMentions: MentionSpecial[];
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotesContext() {
  const ctx = useContext(NotesContext);
  if (!ctx) {
    throw new Error("useNotesContext must be used inside <NotesProvider>");
  }
  return ctx;
}

/* ─── Provider ─── */

interface NotesProviderProps {
  contextType: NoteContextType;
  contextId: string;
  contextLabel: string;
  currentUserId: string;
  currentUserRole: string;
  children: ReactNode;
}

export function NotesProvider({
  contextType,
  contextId,
  contextLabel,
  currentUserId,
  currentUserRole,
  children,
}: NotesProviderProps) {
  const searchParams = useSearchParams();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const didAutoOpen = useRef(false);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [totalNotes, setTotalNotes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnreadMentions, setHasUnreadMentions] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [users, setUsers] = useState<NoteUser[]>([]);
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [specialMentions, setSpecialMentions] = useState<MentionSpecial[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch notes ──
  const fetchNotes = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/notes?contextType=${contextType}&contextId=${contextId}&limit=50`,
        { signal: ac.signal, cache: "no-store" },
      );
      const data = await res.json();
      if (data.success) {
        setNotes(data.data);
        setTotalNotes(data.meta?.total ?? data.data.length);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [contextType, contextId]);

  // ── Local state mutations (avoid full refetch on every action) ──
  const updateNoteInState = useCallback(
    (noteId: string, updater: (note: NoteData) => NoteData) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === noteId) return updater(n);
          if (n.replies?.length) {
            const updated = n.replies.map((r) => (r.id === noteId ? updater(r) : r));
            if (updated !== n.replies) return { ...n, replies: updated };
          }
          return n;
        }),
      );
    },
    [],
  );

  const removeNoteFromState = useCallback((noteId: string) => {
    setNotes((prev) => {
      // Check if it's a root note
      if (prev.some((n) => n.id === noteId)) {
        setTotalNotes((t) => t - 1);
        return prev.filter((n) => n.id !== noteId);
      }
      // Otherwise remove from replies
      return prev.map((n) => {
        if (!n.replies?.some((r) => r.id === noteId)) return n;
        return {
          ...n,
          replies: n.replies.filter((r) => r.id !== noteId),
          replyCount: n.replyCount - 1,
        };
      });
    });
  }, []);

  const addNoteToState = useCallback((note: NoteData) => {
    if (note.parentNoteId) {
      // Reply — add to parent's replies
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === note.parentNoteId) {
            return { ...n, replies: [...(n.replies ?? []), note], replyCount: n.replyCount + 1 };
          }
          return n;
        }),
      );
    } else {
      // Root note — insert after pinned notes
      setNotes((prev) => {
        const firstUnpinned = prev.findIndex((n) => !n.isPinned);
        if (firstUnpinned === -1) return [...prev, note];
        return [...prev.slice(0, firstUnpinned), note, ...prev.slice(firstUnpinned)];
      });
      setTotalNotes((t) => t + 1);
    }
  }, []);

  // ── Fetch unread counts ──
  const refreshUnreadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/notes/unread-counts", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        const counts: UnreadCounts = data.data;
        const key = `${contextType.toLowerCase()}_${contextId}`;
        setUnreadCount(counts.byContext[key] ?? 0);
      }
    } catch {
      // silent
    }
  }, [contextType, contextId]);

  // ── Check unread mentions ──
  useEffect(() => {
    const checkMentions = async () => {
      try {
        const res = await fetch("/api/notes/mentions?read=false&limit=1", { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          setHasUnreadMentions((data.meta?.total ?? 0) > 0);
        }
      } catch {
        // silent
      }
    };
    checkMentions();
  }, []);

  // ── Mark context as read ──
  const markContextRead = useCallback(async () => {
    try {
      await fetch("/api/notes/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextType, contextId }),
      });
      setUnreadCount(0);
    } catch {
      // silent
    }
  }, [contextType, contextId]);

  // ── Check follow status ──
  useEffect(() => {
    const checkFollow = async () => {
      try {
        const res = await fetch("/api/notes/following", { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          const following = data.data.some(
            (f: any) => f.contextType === contextType && f.contextId === contextId,
          );
          setIsFollowing(following);
        }
      } catch {
        // silent
      }
    };
    checkFollow();
  }, [contextType, contextId]);

  // ── Toggle follow ──
  const toggleFollow = useCallback(async () => {
    try {
      if (isFollowing) {
        await fetch("/api/notes/unfollow", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextType, contextId }),
        });
        setIsFollowing(false);
      } else {
        await fetch("/api/notes/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextType, contextId }),
        });
        setIsFollowing(true);
      }
    } catch {
      // silent
    }
  }, [contextType, contextId, isFollowing]);

  // ── Fetch mention targets (users/groups) ──
  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setUsers(d.data?.users ?? []);
          setGroups(d.data?.groups ?? []);
          setSpecialMentions(d.data?.special ?? []);
        }
      })
      .catch(() => {});
  }, []);

  // ── Auto-fetch on mount & panel open ──
  useEffect(() => {
    refreshUnreadCounts();
  }, [refreshUnreadCounts]);

  useEffect(() => {
    if (isPanelOpen) {
      void fetchNotes();
      void markContextRead();
    }
  }, [isPanelOpen, fetchNotes, markContextRead]);

  // ── Polling: refresh unread counts every 30s ──
  useEffect(() => {
    const iv = setInterval(() => void refreshUnreadCounts(), 30_000);
    return () => clearInterval(iv);
  }, [refreshUnreadCounts]);

  // ── Auto-open when ?openNotes=true ──
  useEffect(() => {
    if (!didAutoOpen.current && searchParams.get("openNotes") === "true") {
      didAutoOpen.current = true;
      setIsPanelOpen(true);
    }
  }, [searchParams]);

  // ── Cleanup abort on unmount ──
  useEffect(() => () => abortRef.current?.abort(), []);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);

  const value = useMemo<NotesContextValue>(
    () => ({
      contextType,
      contextId,
      contextLabel,
      currentUserId,
      currentUserRole,
      isPanelOpen,
      openPanel,
      closePanel,
      togglePanel,
      notes,
      loading,
      fetchNotes,
      totalNotes,
      updateNoteInState,
      removeNoteFromState,
      addNoteToState,
      unreadCount,
      hasUnreadMentions,
      refreshUnreadCounts,
      markContextRead,
      isFollowing,
      toggleFollow,
      users,
      groups,
      specialMentions,
    }),
    [
      contextType, contextId, contextLabel, currentUserId, currentUserRole,
      isPanelOpen, openPanel, closePanel, togglePanel,
      notes, loading, fetchNotes, totalNotes, updateNoteInState, removeNoteFromState, addNoteToState,
      unreadCount, hasUnreadMentions, refreshUnreadCounts, markContextRead,
      isFollowing, toggleFollow,
      users, groups, specialMentions,
    ],
  );

  return (
    <NotesContext.Provider value={value}>
      {children}
      <NotesFloatingButton />
      <NotesPanel />
    </NotesContext.Provider>
  );
}
