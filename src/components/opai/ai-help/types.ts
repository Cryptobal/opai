import type {
  VisualBlock,
  VisualSuggestionItem,
} from "@/lib/ai/help-chat-visual-types";
import type { PendingConfirmationClient } from "./PendingConfirmCards";

export type HistoryConversation = {
  id: string;
  title: string;
  updatedAt: string;
  pinnedAt?: string | null;
  _count?: { messages: number };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  visuals?: VisualBlock[];
  suggestions?: VisualSuggestionItem[];
  feedback?: "up" | "down" | null;
  pendingConfirmations?: PendingConfirmationClient[];
  /** Razonamiento intermedio (preámbulo antes de tool_calls), solo presentación */
  reasoning?: string;
  reasoningMs?: number;
};

export const MAX_VISIBLE_MESSAGES = 120;
