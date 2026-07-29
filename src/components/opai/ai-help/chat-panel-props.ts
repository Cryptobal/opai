import type { RefObject } from "react";
import type { ChatPageContextValue } from "../ChatPageContextProvider";
import type { ChatMessage, HistoryConversation } from "./types";
import type { VisualCardItem, VisualSuggestionItem } from "@/lib/ai/help-chat-visual-types";
import type { ComponentProps } from "react";
import type { ChatComposer } from "./ChatComposer";

export type ChatPanelSharedProps = {
  threadTitle: string;
  messages: ChatMessage[];
  loadingMessages: boolean;
  sending: boolean;
  streamingStarted: boolean;
  activeToolName: string | null;
  reasoningText: string;
  reasoningSteps: number;
  reasoningMs?: number;
  quickStarters: string[];
  persistenceEnabled: boolean;
  pageContext: ChatPageContextValue | null;
  conversations: HistoryConversation[];
  activeConversationId: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  composer: ComponentProps<typeof ChatComposer>;
  onClose: () => void;
  onNew: () => void;
  onSelectConversation: (id: string | null) => void;
  onRefreshConversations: () => Promise<void>;
  onClearPageContext: () => void;
  onSendStarter: (q: string) => void;
  onAction: (
    action: VisualCardItem["action"] | VisualSuggestionItem["action"] | undefined,
  ) => void;
  onNavigateInternal: (path: string) => void;
  onRegenerate: () => void;
  onConfirmResolved: (messageId: string, id: string, status: "CONFIRMED" | "CANCELLED") => void;
  onFeedback: (messageId: string, next: "up" | "down" | null) => void;
  friendlyToolLabel: (name: string) => string;
};
