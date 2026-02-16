import type { Decimal } from "@prisma/client/runtime/library";

export type AccountTreeNode = {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  level: number;
  isSystem: boolean;
  isActive: boolean;
  acceptsEntries: boolean;
  children: AccountTreeNode[];
};

export type JournalLineInput = {
  accountId: string;
  description?: string;
  debit: number;
  credit: number;
  costCenterId?: string;
  thirdPartyId?: string;
  thirdPartyType?: "CUSTOMER" | "SUPPLIER";
};

export type JournalEntryInput = {
  date: string; // ISO date YYYY-MM-DD
  description: string;
  reference?: string;
  sourceType?: string;
  sourceId?: string;
  costCenterId?: string;
  lines: JournalLineInput[];
};

export type LedgerEntry = {
  date: Date;
  entryNumber: number;
  description: string;
  reference: string | null;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
};
