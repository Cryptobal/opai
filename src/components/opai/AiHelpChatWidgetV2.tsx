"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useIntelligenceSidePanelContext } from "./IntelligenceSidePanelContext";
import { useChatSidePanelContext } from "@/components/chat/ChatFloatingProvider";
import { useNotificationSidePanelContext } from "@/components/notifications/NotificationSidePanelContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ChatDockDesktop } from "./ai-help/ChatDockDesktop";
import { ChatSheetMobile } from "./ai-help/ChatSheetMobile";
import { focusAiHelpComposer } from "./ai-help/ChatComposer";
import { useHelpChatController } from "./ai-help/useHelpChatController";
import type { ChatPanelSharedProps } from "./ai-help/chat-panel-props";
import {
  AI_COMMAND_EVENT,
  AI_OPEN_ANCHORED_EVENT,
  type AiCommandDetail,
  type AiOpenAnchoredDetail,
} from "@/lib/ai/ai-command-event";

function scheduleComposerFocus() {
  // Varios intentos: el sheet/dock monta async y en móvil el teclado
  // solo responde si el foco llega cerca del gesto de apertura.
  focusAiHelpComposer();
  requestAnimationFrame(() => {
    focusAiHelpComposer();
    window.setTimeout(() => focusAiHelpComposer(), 50);
    window.setTimeout(() => focusAiHelpComposer(), 150);
  });
}

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
      scheduleComposerFocus();
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
      scheduleComposerFocus();
    };
    window.addEventListener("opai-ai-open", openEvt);
    return () => window.removeEventListener("opai-ai-open", openEvt);
  }, [chatCtx, notifCtx, intelCtx]);

  useEffect(() => {
    const onAnchored = (ev: Event) => {
      const detail = (ev as CustomEvent<AiOpenAnchoredDetail>).detail;
      if (!detail?.anchorType || !detail?.anchorId) return;
      chatCtx.closePanel();
      notifCtx.closePanel();
      intelCtx.openPanel();
      void ctrlRef.current.openAnchored(detail);
    };
    window.addEventListener(AI_OPEN_ANCHORED_EVENT, onAnchored);
    return () => window.removeEventListener(AI_OPEN_ANCHORED_EVENT, onAnchored);
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
        // Esperar a que React registre el page context del hilo (openThread)
        // antes de enviar; 50ms era insuficiente y el prompt iba sin entidad.
        const sendWhenReady = (attempt: number) => {
          const latest = ctrlRef.current;
          if (latest.sending) return;
          const ctx = latest.pageContext;
          const hasThread =
            ctx?.entityType === "crm_email_thread" && Boolean(ctx.entityId);
          if (hasThread || attempt >= 4) {
            void latest.sendMessage(detail.prompt);
            return;
          }
          window.setTimeout(() => sendWhenReady(attempt + 1), 80);
        };
        window.setTimeout(() => sendWhenReady(0), 80);
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
    reasoningText: ctrl.reasoningText,
    reasoningSteps: ctrl.reasoningSteps,
    reasoningMs: ctrl.reasoningMs,
    quickStarters: ctrl.quickStarters,
    persistenceEnabled: ctrl.persistenceEnabled,
    pageContext: ctrl.pageContext,
    conversations: ctrl.conversations,
    activeConversationId: ctrl.activeConversationId,
    scrollRef: ctrl.scrollRef,
    onClose: () => setOpen(false),
    onNew: ctrl.activeAnchor ? ctrl.startNewAnchored : ctrl.startNewConversation,
    anchorLabel: ctrl.activeAnchor?.name ?? null,
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
          aria-label="Abrir OPAI Intelligence"
          title="OPAI Intelligence"
          // Desktop: FAB esquina. Móvil: orbe en BottomNav (OpaiOrb) para no
          // tapar Responder/Reenviar ni los FAB de Agenda/Tareas.
          className="opai-orb fixed right-6 z-[70] hidden h-12 w-12 items-center justify-center overflow-hidden rounded-full bottom-6 lg:flex active:scale-95 lg:hover:scale-[1.05] motion-safe:transition-transform"
        >
          <span aria-hidden className="opai-orb-sweep absolute inset-0 rounded-full" />
          <Sparkles className="relative h-5 w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
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
