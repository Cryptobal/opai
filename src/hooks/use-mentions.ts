"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  NoteUser,
  NoteGroup,
  MentionSpecial,
  MentionOption,
  MentionPayload,
  MentionTarget,
} from "@/types/notes";

/* ─── Helpers ─── */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasMention(content: string, rawValue: string): boolean {
  const value = rawValue.trim();
  if (!value) return false;
  const escaped = escapeRegex(value);
  const pattern = new RegExp(
    `(?:^|\\s)[@＠]${escaped}(?=\\s|$|[.,;:!?])`,
    "iu"
  );
  return pattern.test(content.replace(/\u00A0/g, " "));
}

/* ─── Hook ─── */

interface UseMentionsOptions {
  currentUserId: string;
}

interface GroupedMentionOptions {
  special: (MentionSpecial & { kind: "special" })[];
  groups: (NoteGroup & { kind: "group" })[];
  users: (NoteUser & { kind: "user" })[];
  all: MentionOption[];
}

export interface UseMentionsReturn {
  users: NoteUser[];
  groups: NoteGroup[];
  showMentions: boolean;
  mentionQuery: string;
  mentionTarget: MentionTarget;
  selectedMentionIdx: number;
  groupedOptions: GroupedMentionOptions;
  setSelectedMentionIdx: (idx: number) => void;
  handleTextChange: (
    value: string,
    target: MentionTarget,
    ref: React.RefObject<HTMLTextAreaElement | null>
  ) => void;
  insertMention: (
    option: MentionOption,
    currentValue: string,
    ref: React.RefObject<HTMLTextAreaElement | null>,
    setValue: (v: string) => void
  ) => void;
  handleKeyDown: (
    e: React.KeyboardEvent,
    currentValue: string,
    ref: React.RefObject<HTMLTextAreaElement | null>,
    setValue: (v: string) => void
  ) => boolean;
  closeMentions: () => void;
  buildMentionPayload: (content: string) => MentionPayload;
}

export function useMentions({
  currentUserId,
}: UseMentionsOptions): UseMentionsReturn {
  const [users, setUsers] = useState<NoteUser[]>([]);
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [specialMentions, setSpecialMentions] = useState<MentionSpecial[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionTarget, setMentionTarget] = useState<MentionTarget>("new");
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setUsers(d.data?.users || []);
          setGroups(d.data?.groups || []);
          setSpecialMentions(d.data?.special || []);
        }
      })
      .catch(() => {});
  }, []);

  const groupedOptions = useMemo((): GroupedMentionOptions => {
    const query = mentionQuery.trim().toLowerCase();
    const special = specialMentions
      .filter((item) => {
        if (!query) return true;
        return (
          item.label.toLowerCase().includes(query) ||
          item.token.toLowerCase().includes(query) ||
          item.aliases.some((alias) => alias.toLowerCase().includes(query))
        );
      })
      .map((item) => ({ ...item, kind: "special" as const }));
    const groupsFiltered = groups
      .filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          item.slug.toLowerCase().includes(query)
        );
      })
      .map((item) => ({ ...item, kind: "group" as const }));
    const usersFiltered = users
      .filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          item.email?.toLowerCase().includes(query)
        );
      })
      .map((item) => ({ ...item, kind: "user" as const }));
    return {
      special,
      groups: groupsFiltered,
      users: usersFiltered,
      all: [...special, ...groupsFiltered, ...usersFiltered] as MentionOption[],
    };
  }, [groups, mentionQuery, specialMentions, users]);

  const handleTextChange = useCallback(
    (
      value: string,
      target: MentionTarget,
      ref: React.RefObject<HTMLTextAreaElement | null>
    ) => {
      const el = ref.current;
      if (!el) return;
      const cursorPos = el.selectionStart ?? value.length;
      const textBeforeCursor = value.slice(0, cursorPos).replace(/\u00A0/g, " ");
      const atMatch = textBeforeCursor.match(
        /(?:^|\s)[@＠]([\p{L}\p{N}._-]*)$/u
      );
      if (atMatch) {
        setMentionQuery((atMatch[1] || "").toLowerCase());
        setShowMentions(true);
        setMentionTarget(target);
        setSelectedMentionIdx(0);
      } else {
        setShowMentions(false);
      }
    },
    []
  );

  const insertMention = useCallback(
    (
      option: MentionOption,
      currentValue: string,
      ref: React.RefObject<HTMLTextAreaElement | null>,
      setValue: (v: string) => void
    ) => {
      const el = ref.current;
      if (!el) return;

      const cursorPos = el.selectionStart ?? currentValue.length;
      const textBeforeCursor = currentValue.slice(0, cursorPos);
      const lastAsciiAt = textBeforeCursor.lastIndexOf("@");
      const lastFullAt = textBeforeCursor.lastIndexOf("＠");
      const fallbackAt = Math.max(lastAsciiAt, lastFullAt);
      const atMatch = textBeforeCursor.match(
        /(?:^|\s)[@＠]([\p{L}\p{N}._-]*)$/u
      );
      let atIndex = fallbackAt;
      if (atMatch) {
        const segment = atMatch[0] || "";
        atIndex =
          cursorPos - segment.length + (segment.startsWith(" ") ? 1 : 0);
      }

      const mentionLabel =
        option.kind === "special" ? option.token : option.name;
      const before = currentValue.slice(0, Math.max(0, atIndex));
      const after = currentValue.slice(cursorPos);
      const newValue = `${before}@${mentionLabel} ${after}`;

      setValue(newValue);
      setShowMentions(false);

      setTimeout(() => {
        const newCursorPos =
          Math.max(0, atIndex) + mentionLabel.length + 2;
        el.setSelectionRange(newCursorPos, newCursorPos);
        el.focus();
      }, 0);
    },
    []
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      currentValue: string,
      ref: React.RefObject<HTMLTextAreaElement | null>,
      setValue: (v: string) => void
    ): boolean => {
      if (!showMentions || groupedOptions.all.length === 0) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIdx((i) =>
          Math.min(i + 1, groupedOptions.all.length - 1)
        );
        return true;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIdx((i) => Math.max(i - 1, 0));
        return true;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(
          groupedOptions.all[selectedMentionIdx],
          currentValue,
          ref,
          setValue
        );
        return true;
      } else if (e.key === "Escape") {
        setShowMentions(false);
        return true;
      }
      return false;
    },
    [showMentions, groupedOptions, selectedMentionIdx, insertMention]
  );

  const closeMentions = useCallback(() => {
    setShowMentions(false);
  }, []);

  const buildMentionPayload = useCallback(
    (content: string): MentionPayload => {
      const includeAll = /(?:^|\s)[@＠](todos|all)(?=\s|$|[.,;:!?])/iu.test(
        content
      );
      const mentionedUserIds = users
        .filter(
          (user) =>
            hasMention(content, user.name) ||
            (user.email ? hasMention(content, user.email) : false)
        )
        .map((user) => user.id);
      const mentionedGroupIds = groups
        .filter(
          (group) =>
            hasMention(content, group.name) ||
            hasMention(content, group.slug)
        )
        .map((group) => group.id);
      const groupMemberIds = groups
        .filter((group) => mentionedGroupIds.includes(group.id))
        .flatMap((group) => group.memberIds);
      const recipients = includeAll
        ? users
            .map((user) => user.id)
            .filter((id) => id !== currentUserId)
        : [...new Set([...mentionedUserIds, ...groupMemberIds])].filter(
            (id) => id !== currentUserId
          );
      return {
        mentions: recipients,
        mentionMeta: {
          includeAll,
          userIds: mentionedUserIds,
          groupIds: mentionedGroupIds,
        },
      };
    },
    [groups, users, currentUserId]
  );

  return {
    users,
    groups,
    showMentions,
    mentionQuery,
    mentionTarget,
    selectedMentionIdx,
    groupedOptions,
    setSelectedMentionIdx,
    handleTextChange,
    insertMention,
    handleKeyDown,
    closeMentions,
    buildMentionPayload,
  };
}
