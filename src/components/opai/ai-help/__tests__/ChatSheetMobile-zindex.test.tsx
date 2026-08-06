/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { ChatSheetMobile } from "../ChatSheetMobile";
import type { ChatPanelSharedProps } from "../chat-panel-props";

vi.mock("@/components/chat/hooks/useSwipeGesture", () => ({
  useSwipeGesture: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
  }),
}));

vi.mock("@/hooks/useKeyboardOffset", () => ({
  useKeyboardOffset: () => 0,
}));

vi.mock("../../nav-progress-bus", () => ({
  startNavProgress: vi.fn(),
}));

vi.mock("../ChatHeader", () => ({
  ChatHeader: () => <div data-testid="header" />,
}));

vi.mock("../ChatComposer", () => ({
  ChatComposer: () => <div data-testid="composer" />,
}));

vi.mock("../ChatMessageList", () => ({
  ChatMessageList: () => <div data-testid="messages" />,
}));

vi.mock("../ThreadsPanel", () => ({
  ThreadsPanel: () => null,
}));

function baseProps(): ChatPanelSharedProps {
  return {
    threadTitle: "Asistente",
    messages: [],
    loadingMessages: false,
    sending: false,
    streamingStarted: false,
    activeToolName: null,
    reasoningText: null,
    reasoningSteps: [],
    reasoningMs: null,
    quickStarters: [],
    persistenceEnabled: false,
    pageContext: null,
    conversations: [],
    activeConversationId: null,
    scrollRef: createRef<HTMLDivElement>(),
    onClose: vi.fn(),
    onNew: vi.fn(),
    onSelectConversation: vi.fn(),
    onRefreshConversations: vi.fn(),
    onClearPageContext: vi.fn(),
    onSendStarter: vi.fn(),
    onAction: vi.fn(),
    onNavigateInternal: vi.fn(),
    onRegenerate: vi.fn(),
    onConfirmResolved: vi.fn(),
    onFeedback: vi.fn(),
    friendlyToolLabel: () => "",
    composer: {
      input: "",
      onInputChange: vi.fn(),
      onSend: vi.fn(),
      onStop: vi.fn(),
      sending: false,
      staging: false,
      pendingFiles: [],
      onAddFiles: vi.fn(),
      onRemoveFile: vi.fn(),
      dictationActive: false,
      dictationSupported: false,
      onToggleDictation: vi.fn(),
      polishEnabled: false,
      onPolishChange: vi.fn(),
    },
  };
}

describe("ChatSheetMobile — stacking", () => {
  it("monta por encima del lector/Copiloto (z ≥ 70)", () => {
    const { container } = render(<ChatSheetMobile {...baseProps()} />);
    const scrim = container.querySelector(".z-\\[70\\]");
    const sheet = container.querySelector("[data-opai-ai-sheet]");
    expect(scrim).toBeTruthy();
    expect(sheet?.className).toContain("z-[71]");
  });
});
