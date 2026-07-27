"use client";

import { useRef, useState } from "react";
import { useSwipeGesture } from "@/components/chat/hooks/useSwipeGesture";
import { useKeyboardOffset } from "@/hooks/useKeyboardOffset";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { ThreadsPanel } from "./ThreadsPanel";
import type { ChatPanelSharedProps } from "./chat-panel-props";

export function ChatSheetMobile(props: ChatPanelSharedProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const keyboardOffset = useKeyboardOffset();

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

  const sheetHeight =
    keyboardOffset > 0
      ? `min(88dvh, calc(100dvh - 56px - ${keyboardOffset}px))`
      : "min(88dvh, calc(100dvh - 56px))";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={() => requestClose()}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden text-ds-text-1 opai-glass-strong"
        style={{
          height: sheetHeight,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          paddingBottom: keyboardOffset > 0 ? keyboardOffset : undefined,
          transition: closing ? "transform 180ms ease-out" : undefined,
        }}
        role="dialog"
        aria-label="OPAI Intelligence"
        data-opai-ai-sheet
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ChatHeader
            threadTitle={props.threadTitle}
            onOpenThreads={() => setThreadsOpen(true)}
            onNew={props.onNew}
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
            quickStarters={props.quickStarters}
            persistenceEnabled={props.persistenceEnabled}
            pageContext={props.pageContext}
            onClearPageContext={props.onClearPageContext}
            onSendStarter={props.onSendStarter}
            onAction={props.onAction}
            onNavigateInternal={props.onNavigateInternal}
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
                  : "calc(env(safe-area-inset-bottom) + 0.75rem)",
            }}
          >
            <ChatComposer {...props.composer} />
          </div>
          <ThreadsPanel
            open={threadsOpen}
            onClose={() => setThreadsOpen(false)}
            conversations={props.conversations}
            activeConversationId={props.activeConversationId}
            persistenceEnabled={props.persistenceEnabled}
            onNew={props.onNew}
            onSelect={props.onSelectConversation}
            onRefresh={props.onRefreshConversations}
            variant="sheet"
          />
        </div>
      </div>
    </>
  );
}
