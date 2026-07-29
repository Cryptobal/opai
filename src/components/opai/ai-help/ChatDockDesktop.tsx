"use client";

import { useState } from "react";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { ThreadsPanel } from "./ThreadsPanel";
import type { ChatPanelSharedProps } from "./chat-panel-props";
import { cn } from "@/lib/utils";

export function ChatDockDesktop(props: ChatPanelSharedProps) {
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-40 flex h-full w-[400px] flex-col overflow-hidden text-ds-text-1",
        "border-l border-ds-border-default bg-ds-surface-3 shadow-[-8px_0_30px_-12px_rgba(0,0,0,0.25)]",
        isDragging && "ring-2 ring-primary/50",
      )}
      role="dialog"
      aria-label="OPAI Intelligence"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        props.composer.onAddFiles(e.dataTransfer.files);
        setIsDragging(false);
      }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatHeader
          threadTitle={props.threadTitle}
          onOpenThreads={() => setThreadsOpen((v) => !v)}
          onNew={props.onNew}
          onClose={props.onClose}
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
          onNavigateInternal={props.onNavigateInternal}
          onRegenerate={props.onRegenerate}
          onConfirmResolved={props.onConfirmResolved}
          onFeedback={props.onFeedback}
          friendlyToolLabel={props.friendlyToolLabel}
          scrollRef={props.scrollRef}
        />
        <div className="shrink-0 border-t border-ds-border-subtle p-3">
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
          variant="popover"
        />
        {isDragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary/40 bg-ds-surface-3/80 backdrop-blur-sm">
            <span className="text-sm font-medium text-ds-text-1">Suelta para adjuntar</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
