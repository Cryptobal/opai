/**
 * Types for the Document Management System
 */

export interface DocTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  content: any; // Tiptap JSON
  module: string;
  category: string;
  tokensUsed?: string[] | null;
  isActive: boolean;
  isDefault: boolean;
  usageSlug?: string | null; // Solo module=whatsapp: proposal_sent, followup_first, etc.
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    documents: number;
    versions: number;
  };
}

export interface DocTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  content: any;
  changeNote?: string | null;
  createdBy: string;
  createdAt: string;
}

export type DocumentStatus =
  | "draft"
  | "review"
  | "approved"
  | "active"
  | "expiring"
  | "expired"
  | "renewed";

export interface DocDocument {
  id: string;
  tenantId: string;
  uniqueId: string;
  templateId?: string | null;
  title: string;
  content: any; // Tiptap JSON (resolved)
  tokenValues?: Record<string, string> | null;
  module: string;
  category: string;
  status: DocumentStatus;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  renewalDate?: string | null;
  alertDaysBefore: number;
  signatureStatus?: string | null;
  signedAt?: string | null;
  signedBy?: string | null;
  pdfUrl?: string | null;
  pdfGeneratedAt?: string | null;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  template?: DocTemplate | null;
  associations?: DocAssociation[];
}

export interface DocAssociation {
  id: string;
  documentId: string;
  entityType: string; // "crm_account", "crm_deal", "crm_installation", "crm_contact"
  entityId: string;
  role: string; // "primary", "related", "copy"
  createdAt: string;
  // Populated fields (from API joins)
  entityName?: string;
}

export interface DocHistory {
  id: string;
  documentId: string;
  action: string;
  details?: any;
  createdBy: string;
  createdAt: string;
}
