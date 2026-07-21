export type CorreoThreadDTO = {
  id: string;
  subject: string;
  fromEmail: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  leadId: string | null;
  attachmentCount: number;
  messageCount: number;
  providerThreadId: string | null;
  possibleLead: boolean;
  isUnread: boolean;
  archivedAt: string | null;
};

export type CorreoMessageDTO = {
  id: string;
  direction: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  sentAt: string | null;
};

export type CorreoAttachmentDTO = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type CorreoDetail = {
  thread: {
    id: string;
    subject: string;
    accountId: string | null;
    accountName: string | null;
    dealId: string | null;
    dealTitle: string | null;
    leadId: string | null;
    providerThreadId: string | null;
    isUnread: boolean;
    archivedAt: string | null;
  };
  messages: CorreoMessageDTO[];
  attachments: CorreoAttachmentDTO[];
};
