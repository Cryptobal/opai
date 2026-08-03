import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/docs/ContractEditor", () => ({
  ContractEditor: ({
    placeholder,
    renderToolbar,
  }: {
    placeholder?: string;
    renderToolbar?: (editor: null) => React.ReactNode;
  }) => (
    <div data-testid="contract-editor">
      {renderToolbar?.(null)}
      <p>{placeholder}</p>
    </div>
  ),
}));

vi.mock("../EmailToolbar", () => ({
  EmailToolbar: () => <div data-testid="email-toolbar" />,
}));

vi.mock("../CorreoQuotedHistory", () => ({
  CorreoQuotedHistory: ({ html }: { html: string }) => (
    <div data-testid="quoted-history">{html}</div>
  ),
}));

vi.mock("../AttachmentPicker", () => ({
  AttachmentPicker: () => null,
}));

vi.mock("../ScheduleSendSplitButton", () => ({
  ScheduleSendSplitButton: () => null,
}));

vi.mock("../signature/SignatureChip", () => ({
  SignatureChip: () => null,
}));

vi.mock("../ComposerCrmLink", () => ({
  ComposerCrmLink: () => null,
}));

vi.mock("../useEmailAttachments", () => ({
  useEmailAttachments: () => ({
    items: [],
    addFiles: () => {},
    remove: () => {},
    retry: () => {},
    reset: () => {},
  }),
}));

vi.mock("@/hooks/useSpeechDictation", () => ({
  useSpeechDictation: () => ({
    listening: false,
    interimText: "",
    finalText: "",
    silent: false,
    error: null,
  }),
  isSpeechDictationSupported: () => false,
}));

import { EmailComposer } from "../EmailComposer";

describe("EmailComposer AI slot", () => {
  it("Cc/Cco quedan contraídos aunque haya destinatarios en CC", () => {
    render(
      <EmailComposer
        mode="reply"
        threadId="t1"
        initialTo={["a@b.cl"]}
        initialCc={["cc1@b.cl", "cc2@b.cl"]}
        initialSubject="Re: test"
        onSent={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Cc/Cco" })).toBeTruthy();
    expect(screen.queryByText("CC")).toBeNull();
    expect(screen.queryByText("CCO")).toBeNull();
  });

  it("monta aboveFooter entre el cuerpo y el historial citado", () => {
    const { container } = render(
      <EmailComposer
        mode="reply"
        threadId="t1"
        initialTo={["a@b.cl"]}
        initialSubject="Re: test"
        quotedHtml="<p>mensaje previo</p>"
        aboveFooter={<div data-testid="ai-pill">IA</div>}
        onSent={() => {}}
        onClose={() => {}}
      />,
    );

    const body = container.querySelector("[data-email-composer-body]");
    const ai = screen.getByTestId("ai-pill");
    const history = screen.getByTestId("quoted-history");
    expect(body).toBeTruthy();
    expect(ai).toBeTruthy();
    expect(history).toBeTruthy();

    const position = body!.compareDocumentPosition(ai);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const aiThenHistory = ai.compareDocumentPosition(history);
    expect(aiThenHistory & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
