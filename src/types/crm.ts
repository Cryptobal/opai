export interface CrmLead {
  id: string;
  status: string;
  source?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  notes?: string | null;
  industry?: string | null;
  address?: string | null;
  commune?: string | null;
  city?: string | null;
  website?: string | null;
  serviceType?: string | null;
  metadata?: any;
  createdAt: string;
}

export interface Notification {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  message?: string | null;
  data?: any;
  read: boolean;
  link?: string | null;
  createdAt: string;
}

export type CrmAccountType = "prospect" | "client";

export interface CrmAccount {
  id: string;
  name: string;
  rut?: string | null;
  legalName?: string | null;
  legalRepresentativeName?: string | null;
  legalRepresentativeRut?: string | null;
  industry?: string | null;
  size?: string | null;
  segment?: string | null;
  type: CrmAccountType;
  status: string;
  createdAt: string;
}

export interface CrmInstallation {
  id: string;
  accountId?: string | null;
  leadId?: string | null;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface CrmContact {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary: boolean;
}

export interface CrmPipelineStage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
}

export interface CrmDeal {
  id: string;
  title: string;
  amount: string;
  status: string;
  probability: number;
  expectedCloseDate?: string | null;
  createdAt: string;
  proposalLink?: string | null;
  proposalSentAt?: string | null;
  dealType?: string | null;
  notes?: string | null;
  driveFolderLink?: string | null;
  installationName?: string | null;
  technicalVisitDate?: string | null;
  service?: string | null;
  street?: string | null;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  installationWebsite?: string | null;
  account: CrmAccount;
  stage: CrmPipelineStage;
  primaryContact?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  } | null;
  quotes?: {
    id: string;
    quoteId: string;
  }[];
}
