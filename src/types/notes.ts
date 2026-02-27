/* ─── Unified Notes System – Shared Types ─── */

export type NoteEntityType =
  | "account"
  | "contact"
  | "deal"
  | "quote"
  | "ops_guardia"
  | "installation_pauta"
  | "installation";

export interface NoteUser {
  id: string;
  name: string;
  email?: string;
}

export interface NoteGroup {
  id: string;
  name: string;
  slug: string;
  color?: string;
  memberIds: string[];
  memberCount: number;
}

export interface MentionSpecial {
  id: string;
  key: string;
  label: string;
  aliases: string[];
  token: string;
}

export type MentionOption =
  | ({ kind: "special" } & MentionSpecial)
  | ({ kind: "group" } & NoteGroup)
  | ({ kind: "user" } & NoteUser);

export interface MentionPayload {
  mentions: string[];
  mentionMeta: {
    includeAll: boolean;
    userIds: string[];
    groupIds: string[];
  };
}

export interface Note {
  id: string;
  content: string;
  mentions: string[];
  mentionMeta?: Record<string, unknown> | null;
  parentId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  author: NoteUser;
  mentionNames: string[];
  replies: Note[];
}

export type MentionTarget = "new" | "edit" | "reply";
