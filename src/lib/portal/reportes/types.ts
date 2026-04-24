export interface GenerateParams {
  tenantId: string;
  accountId: string;
  installationIds: string[];
  desde: Date;
  hasta: Date;
  guardiaId?: string;
}

export interface GenerateResult {
  data: Record<string, unknown>;
  pdfBuffer: Buffer | null;
  xlsxBuffer: Buffer | null;
}

export interface XlsxSheet {
  name: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Record<string, unknown>[];
}
