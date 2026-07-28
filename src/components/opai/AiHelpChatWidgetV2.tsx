"use client";

import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { useIntelligenceSidePanelContext } from "./IntelligenceSidePanelContext";
import { useChatSidePanelContext } from "@/components/chat/ChatFloatingProvider";
import { useNotificationSidePanelContext } from "@/components/notifications/NotificationSidePanelContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ChatDockDesktop } from "./ai-help/ChatDockDesktop";
import { ChatSheetMobile } from "./ai-help/ChatSheetMobile";
import { useHelpChatController } from "./ai-help/useHelpChatController";
import type { ChatPanelSharedProps } from "./ai-help/chat-panel-props";
import {
  AI_COMMAND_EVENT,
  type AiCommandDetail,
} from "@/lib/ai/ai-command-event";

export function AiHelpChatWidgetV2() {
  const intelCtx = useIntelligenceSidePanelContext();
  const chatCtx = useChatSidePanelContext();
  const notifCtx = useNotificationSidePanelContext();
  const isDesktop = useMediaQuery("(min-width: 1280px)");

  const setOpen = (next: boolean) => {
    if (next) {
      chatCtx.closePanel();
      notifCtx.closePanel();
      intelCtx.openPanel();
    } else {
      intelCtx.closePanel();
    }
  };

  const ctrl = useHelpChatController({
    open: intelCtx.isPanelOpen,
    setOpen,
  });

  const ctrlRef = useRef(ctrl);
  ctrlRef.current = ctrl;

  useEffect(() => {
    const openEvt = () => {
      chatCtx.closePanel();
      notifCtx.closePanel();
      intelCtx.openPanel();
    };
    window.addEventListener("opai-ai-open", openEvt);
    return () => window.removeEventListener("opai-ai-open", openEvt);
  }, [chatCtx, notifCtx, intelCtx]);

  useEffect(() => {
    const onCommand = (ev: Event) => {
      const detail = (ev as CustomEvent<AiCommandDetail>).detail;
      if (!detail?.prompt?.trim()) return;
      const c = ctrlRef.current;
      if (c.sending) return;
      chatCtx.closePanel();
      notifCtx.closePanel();
      intelCtx.openPanel();
      c.setInput(detail.prompt);
      if (detail.autoSend) {
        // Esperar un tick a que el panel monte y el page context esté listo.
        window.setTimeout(() => {
          const latest = ctrlRef.current;
          if (latest.sending) return;
          void latest.sendMessage(detail.prompt);
        }, 50);
      }
    };
    window.addEventListener(AI_COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(AI_COMMAND_EVENT, onCommand);
  }, [chatCtx, notifCtx, intelCtx]);

  useEffect(() => {
    if (!ctrl.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") intelCtx.closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ctrl.open, intelCtx]);

  if (ctrl.loadingConfig || !ctrl.canAccess) return null;

  const panelProps: ChatPanelSharedProps = {
    threadTitle: ctrl.threadTitle,
    messages: ctrl.messages,
    loadingMessages: ctrl.loadingMessages,
    sending: ctrl.sending,
    streamingStarted: ctrl.streamingStarted,
    activeToolName: ctrl.activeToolName,
    quickStarters: ctrl.quickStarters,
    persistenceEnabled: ctrl.persistenceEnabled,
    pageContext: ctrl.pageContext,
    conversations: ctrl.conversations,
    activeConversationId: ctrl.activeConversationId,
    scrollRef: ctrl.scrollRef,
    onClose: () => setOpen(false),
    onNew: ctrl.startNewConversation,
    onSelectConversation: (id) => {
      ctrl.setActiveConversationId(id);
      ctrl.setIsNewConversation(!id);
      if (!id) ctrl.setMessages([]);
    },
    onRefreshConversations: ctrl.refreshConversations,
    onClearPageContext: ctrl.clearPageContext,
    onSendStarter: (q) => void ctrl.sendMessage(q),
    onAction: ctrl.handleAction,
    onNavigateInternal: ctrl.navigateInternal,
    onRegenerate: ctrl.regenerateLast,
    onConfirmResolved: (messageId, id, status) => {
      ctrl.setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.pendingConfirmations) return m;
          return {
            ...m,
            pendingConfirmations: m.pendingConfirmations.map((p) =>
              p.id === id ? { ...p, status } : p,
            ),
          };
        }),
      );
    },
    onFeedback: (messageId, next) => {
      ctrl.setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: next } : m)),
      );
    },
    friendlyToolLabel: ctrl.friendlyToolLabel,
    composer: {
      input: ctrl.input,
      onInputChange: ctrl.setInput,
      onSend: () => void ctrl.sendMessage(),
      onStop: ctrl.stopStreaming,
      sending: ctrl.sending,
      staging: ctrl.staging,
      pendingFiles: ctrl.pendingFiles,
      onAddFiles: ctrl.addFiles,
      onRemoveFile: ctrl.removeFile,
      dictationActive: ctrl.dictationActive,
      dictationSupported: ctrl.dictationSupported,
      onToggleDictation: () => {
        if (ctrl.dictationActive) ctrl.cancelDictation();
        else ctrl.startDictation();
      },
      voiceProps: ctrl.dictationActive
        ? {
            levelRef: ctrl.levelRef,
            elapsedMs: ctrl.elapsedMs,
            silent: ctrl.silent,
            confirmedText: ctrl.confirmedText,
            interimText: ctrl.interimText,
            onCancel: ctrl.cancelDictation,
            onFinish: () => void ctrl.finishDictation(),
            onSend: () => void ctrl.finishAndSendDictation(),
          }
        : undefined,
      polishEnabled: ctrl.polishEnabled,
      onPolishChange: ctrl.setPolish,
    },
  };

  return (
    <>
      {!ctrl.open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden lg:flex items-center justify-center fixed right-6 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)/0.4)] transition-transform hover:scale-[1.05] lg:bottom-6"
          aria-label="Abrir OPAI Intelligence"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      ) : null}

      {ctrl.open ? (
        isDesktop ? (
          <ChatDockDesktop {...panelProps} />
        ) : (
          <ChatSheetMobile {...panelProps} />
        )
      ) : null}
    </>
  );
}
