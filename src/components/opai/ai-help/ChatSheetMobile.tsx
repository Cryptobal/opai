"use client";

import { useRef, useState } from "react";
import { useSwipeGesture } from "@/components/chat/hooks/useSwipeGesture";
import { useKeyboardOffset } from "@/hooks/useKeyboardOffset";
import { startNavProgress } from "../nav-progress-bus";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { ThreadsPanel } from "./ThreadsPanel";
import type { ChatPanelSharedProps } from "./chat-panel-props";

export function ChatSheetMobile(props: ChatPanelSharedProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  // Offset del teclado: el sheet se ancla con `bottom` (patrón Dialog/Sheet).
  // No reducir height Y sumar paddingBottom a la vez — eso dejaba el composer
  // flotando a mitad de pantalla al escribir.
  const keyboardOffset = useKeyboardOffset({ scrollFocusedIntoView: false });

  const closeThreads = () => {
    setThreadsOpen(false);
    setComposerFocusToken((n) => n + 1);
  };

  const finishClose = () => {
    props.onClose();
  };

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "transform 180ms ease-out";
      el.style.transform = "translate3d(0, 110%, 0)";
    }
    window.setTimeout(finishClose, 180);
  };

  const swipe = useSwipeGesture({
    onSwipeDown: () => requestClose(),
    followFinger: true,
    targetRef: sheetRef,
    mobileOnly: false,
    hapticOnComplete: true,
    directionLock: true,
  });

  return (
    <>
      {/* z-[70]/[71]: por encima del lector de correos (z-50) y Copiloto (z-55). */}
      <div
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
        onClick={() => requestClose()}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 top-0 z-[71] flex flex-col overflow-hidden bg-ds-surface-1 text-ds-text-1 opai-glass-strong"
        style={{
          // Pantalla completa; al abrir teclado sube el borde inferior.
          bottom: keyboardOffset,
          paddingTop: "env(safe-area-inset-top, 0px)",
          transition: closing ? "transform 180ms ease-out" : undefined,
        }}
        role="dialog"
        aria-label="OPAI Intelligence"
        data-opai-ai-sheet
        data-opai-ai-sheet-fullscreen
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ChatHeader
            threadTitle={props.threadTitle}
            onOpenThreads={() => setThreadsOpen(true)}
            onNew={() => {
              props.onNew();
              setComposerFocusToken((n) => n + 1);
            }}
            onClose={() => requestClose()}
            swipeHandlers={{
              onTouchStart: swipe.onTouchStart,
              onTouchMove: swipe.onTouchMove,
              onTouchEnd: swipe.onTouchEnd,
            }}
          />
          <ChatMessageList
            messages={props.messages}
            loadingMessages={props.loadingMessages}
            sending={props.sending}
            streamingStarted={props.streamingStarted}
            activeToolName={props.activeToolName}
            reasoningText={props.reasoningText}
            reasoningSteps={props.reasoningSteps}
            reasoningMs={props.reasoningMs}
            quickStarters={props.quickStarters}
            persistenceEnabled={props.persistenceEnabled}
            pageContext={props.pageContext}
            onClearPageContext={props.onClearPageContext}
            onSendStarter={props.onSendStarter}
            onAction={props.onAction}
            onNavigateInternal={(path) => {
              // Cierre animado antes de desmontar (mismo gesto que ✕).
              if (closing) return;
              startNavProgress();
              setClosing(true);
              const el = sheetRef.current;
              if (el) {
                el.style.transition = "transform 180ms ease-out";
                el.style.transform = "translate3d(0, 110%, 0)";
              }
              window.setTimeout(() => props.onNavigateInternal(path), 180);
            }}
            onRegenerate={props.onRegenerate}
            onConfirmResolved={props.onConfirmResolved}
            onFeedback={props.onFeedback}
            friendlyToolLabel={props.friendlyToolLabel}
            scrollRef={props.scrollRef}
          />
          <div
            className="shrink-0 border-t border-ds-border-subtle p-3"
            style={{
              paddingBottom:
                keyboardOffset > 0
                  ? 12
                  : "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
            }}
          >
            <ChatComposer
              {...props.composer}
              autoFocus={!threadsOpen}
              focusToken={composerFocusToken}
            />
          </div>
          <ThreadsPanel
            open={threadsOpen}
            onClose={closeThreads}
            conversations={props.conversations}
            activeConversationId={props.activeConversationId}
            persistenceEnabled={props.persistenceEnabled}
            onNew={props.onNew}
            onSelect={props.onSelectConversation}
            onRefresh={props.onRefreshConversations}
            variant="sheet"
            anchorLabel={props.anchorLabel}
          />
        </div>
      </div>
    </>
  );
}
