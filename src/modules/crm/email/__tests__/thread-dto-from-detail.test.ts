import { describe, expect, it } from "vitest";
import type { CorreoDetail } from "../correos.types";
import { threadDtoFromDetail } from "../thread-dto-from-detail";

function detailFixture(partial?: {
  thread?: Partial<CorreoDetail["thread"]>;
  messages?: CorreoDetail["messages"];
  attachments?: CorreoDetail["attachments"];
}): CorreoDetail {
  return {
    thread: {
      id: "thread-1",
      subject: "Invitación a licitación",
      accountId: "acc-1",
      accountName: "Coexpan",
      dealId: null,
      dealTitle: null,
      dealStageName: null,
      dealFechaEntrega: null,
      dealIsLicitacion: false,
      leadId: null,
      providerThreadId: "gmail-1",
      isUnread: false,
      archivedAt: null,
      trashedAt: null,
      snoozedUntil: null,
      starredAt: null,
      spamAt: null,
      sharedWithAccount: false,
      lastMessageAt: "2026-08-04T14:49:00.000Z",
      aiCategory: "licitacion",
      aiUrgency: null,
      aiSentiment: null,
      aiSummary: null,
      aiClassifiedAt: null,
      lastReadAt: null,
      threadSummary: null,
      ...partial?.thread,
    },
    messages: partial?.messages ?? [
      {
        id: "m1",
        direction: "inbound",
        fromEmail: "Luis.Perez@coexpan.com",
        toEmails: ["ventas@gard.cl"],
        ccEmails: [],
        subject: "Invitación a licitación",
        htmlBody: null,
        textBody: "Estimados",
        sentAt: "2026-08-04T14:49:00.000Z",
      },
    ],
    attachments: partial?.attachments ?? [],
    degraded: false,
  };
}

describe("threadDtoFromDetail", () => {
  it("proyecta account/deal y remitente inbound para acciones del Copiloto", () => {
    const dto = threadDtoFromDetail(detailFixture());
    expect(dto.id).toBe("thread-1");
    expect(dto.accountId).toBe("acc-1");
    expect(dto.accountName).toBe("Coexpan");
    expect(dto.fromEmail).toBe("Luis.Perez@coexpan.com");
    expect(dto.subject).toBe("Invitación a licitación");
    expect(dto.messageCount).toBe(1);
    expect(dto.attachmentCount).toBe(0);
  });

  it("cuenta adjuntos y borradores del detalle", () => {
    const dto = threadDtoFromDetail(
      detailFixture({
        messages: [
          {
            id: "m1",
            direction: "outbound",
            fromEmail: "yo@gard.cl",
            toEmails: ["a@b.cl"],
            ccEmails: [],
            subject: "Re",
            htmlBody: null,
            textBody: null,
            sentAt: null,
            isDraft: true,
          },
        ],
        attachments: [
          {
            messageId: "m1",
            attachmentId: "a1",
            filename: "bases.pdf",
            mimeType: "application/pdf",
            size: 10,
          },
        ],
      }),
    );
    expect(dto.hasDraft).toBe(true);
    expect(dto.attachmentCount).toBe(1);
    expect(dto.fromEmail).toBe("yo@gard.cl");
  });
});
