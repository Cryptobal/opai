"use client";

import { Fragment, memo } from "react";
import { Loader2, Mail, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatPageContextValue } from "../ChatPageContextProvider";
import { MessageActionBar } from "./MessageActionBar";
import { PendingConfirmCards } from "./PendingConfirmCards";
import { ReasoningTrace } from "./ReasoningTrace";
import { VisualsRenderer } from "./visuals";
import { renderMessageContent } from "./message-render";
import type { ChatMessage } from "./types";
import type { VisualCardItem, VisualSuggestionItem } from "@/lib/ai/help-chat-visual-types";
import { DealCopilotoPanel } from "@/components/crm/DealCopilotoPanel";

type Props = {
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
  scrollRef: React.RefObject<HTMLDivElement | null>;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string | null) => void;
};

function ChatMessageListInner({
  messages,
  loadingMessages,
  sending,
  streamingStarted,
  activeToolName,
  reasoningText,
  reasoningSteps,
  reasoningMs,
  quickStarters,
  persistenceEnabled,
  pageContext,
  onClearPageContext,
  onSendStarter,
  onAction,
  onNavigateInternal,
  onRegenerate,
  onConfirmResolved,
  onFeedback,
  friendlyToolLabel,
  scrollRef,
  activeConversationId = null,
  onSelectConversation,
}: Props) {
  // Indicador live durante el turno (pensando / tools / razonamiento). El
  // colapso a "Pensó durante…" ocurre en el mensaje persistido al terminar.
  const showLiveReasoning =
    sending && (!!activeToolName || !streamingStarted || !!reasoningText || reasoningSteps > 0);

  return (
    <>
      {pageContext ? (
        <div className="border-b border-primary/30 px-3 py-2 bg-primary/10">
          <div className="flex items-center gap-2">
            {pageContext.entityType === "crm_email_thread" ? (
              <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] uppercase tracking-wide text-primary/70">
                {pageContext.entityType === "crm_email_thread" ? "Correo en pantalla" : "Hablando sobre"}
              </p>
              <p className="text-xs font-medium text-ds-text-1 truncate" title={pageContext.entityName}>
                {pageContext.entityName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearPageContext}
              className="shrink-0 rounded-md p-1 text-ds-text-4 hover:bg-ds-surface-2 hover:text-ds-text-1"
              aria-label="Quitar contexto de página"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      {pageContext?.entityType === "crm_deal" && pageContext.entityId ? (
        <div className="border-b border-ds-border-subtle px-3 py-2">
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
            Conversaciones ancladas
          </p>
          <DealCopilotoPanel
            dealId={pageContext.entityId}
            dealTitle={pageContext.entityName}
            embedded
            activeId={activeConversationId}
            onSelect={onSelectConversation ? (id) => onSelectConversation(id) : undefined}
          />
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loadingMessages ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-status-info-fg/80" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-2 text-center">
            <span className="mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-[0_0_28px_hsl(var(--primary)/0.5)]">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </span>
            <p className="text-sm font-medium text-ds-text-1 mb-1">¿En qué te ayudo?</p>
            <p className="text-xs text-ds-text-3 mb-4">
              Pregunta por módulos, datos del tenant o cómo usar OPAI.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {quickStarters.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSendStarter(q)}
                  className="rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary hover:brightness-110 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isLastAssistant =
                msg.role === "assistant" && idx === messages.length - 1 && !sending;
              const isStreamingBubble =
                msg.role === "assistant" && msg.id.startsWith("tmp-streaming-");
              // Durante el turno, el razonamiento live se renderiza abajo; no
              // duplicar si el mensaje streaming aún no tiene reasoning persistido.
              const showPersistedReasoning =
                msg.role === "assistant" &&
                !!msg.reasoning &&
                !(isStreamingBubble && sending);
              return (
                <Fragment key={msg.id}>
                  {showPersistedReasoning ? (
                    <ReasoningTrace
                      active={false}
                      text={msg.reasoning!}
                      toolLabel={null}
                      steps={0}
                      elapsedMs={msg.reasoningMs}
                    />
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[95%] rounded-2xl px-3 py-2.5 text-sm",
                      msg.role === "user"
                        ? "ml-auto bg-gradient-to-br from-primary/30 to-primary/14 text-ds-text-1 border border-primary/30"
                        : "mr-auto bg-ds-surface-2 text-ds-text-1 border border-ds-border-subtle",
                      isStreamingBubble && !msg.content ? "hidden" : null,
                    )}
                  >
                    <div className="whitespace-pre-wrap">
                      {renderMessageContent(msg.content, onNavigateInternal)}
                    </div>
                    {msg.role === "assistant" && (msg.visuals?.length || msg.suggestions?.length) ? (
                      <VisualsRenderer
                        visuals={msg.visuals ?? []}
                        suggestions={msg.suggestions ?? []}
                        onCardAction={(a) => onAction(a)}
                        onSuggestionAction={(a) => onAction(a)}
                      />
                    ) : null}
                    {msg.role === "assistant" && msg.pendingConfirmations?.length ? (
                      <PendingConfirmCards
                        items={msg.pendingConfirmations}
                        onResolved={(id, status) => onConfirmResolved(msg.id, id, status)}
                      />
                    ) : null}
                    {msg.role === "assistant" && !msg.id.startsWith("tmp-streaming-") ? (
                      <MessageActionBar
                        messageId={msg.id}
                        content={msg.content}
                        feedback={msg.feedback}
                        canPersistFeedback={persistenceEnabled}
                        onRegenerate={isLastAssistant ? onRegenerate : undefined}
                        onFeedback={(next) => onFeedback(msg.id, next)}
                      />
                    ) : null}
                  </div>
                </Fragment>
              );
            })}
            {!sending &&
            messages.length > 0 &&
            messages[messages.length - 1].role === "assistant" &&
            !messages[messages.length - 1].suggestions?.length ? (
              <div className="mr-auto max-w-[95%] flex flex-wrap gap-2 pt-1">
                {quickStarters.map((q) => (
                  <button
                    key={`follow-${q}`}
                    type="button"
                    onClick={() => onSendStarter(q)}
                    className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[12px] text-primary hover:brightness-110 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
        {showLiveReasoning ? (
          <ReasoningTrace
            active
            text={reasoningText}
            toolLabel={activeToolName ? friendlyToolLabel(activeToolName) : null}
            steps={reasoningSteps}
            elapsedMs={reasoningMs}
          />
        ) : null}
      </div>
    </>
  );
}

export const ChatMessageList = memo(ChatMessageListInner);
