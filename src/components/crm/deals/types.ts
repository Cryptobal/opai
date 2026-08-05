import type { CrmAccount, CrmDeal, CrmPipelineStage } from "@/types";
import type { DealsFocus } from "@/lib/crm/list-deals";
import type { DealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";

export type DealsView = "board" | "table" | "focus";
export type DealsDensity = "compact" | "normal" | "detail";

export type DealFormState = {
  title: string;
  accountId: string;
  stageId: string;
  amount: string;
  probability: string;
  expectedCloseDate: string;
};

export const DEFAULT_DEAL_FORM: DealFormState = {
  title: "",
  accountId: "",
  stageId: "",
  amount: "",
  probability: "",
  expectedCloseDate: "",
};

export type StageColumnState = {
  deals: CrmDeal[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  total: number;
};

export type CrmDealsClientProps = {
  /** @deprecated Preferir initialByStage; se mantiene por compat del barrel. */
  initialDeals?: CrmDeal[];
  accounts: CrmAccount[];
  stages: CrmPipelineStage[];
  initialFocus?: DealsFocus;
  initialSummary: DealsPipelineSummary;
  /** Primera página ya cargada por stageId (solo etapas abiertas). */
  initialByStage: Record<string, { deals: CrmDeal[]; total: number; hasMore: boolean }>;
};

export type { CrmDeal, CrmPipelineStage, CrmAccount, DealsFocus, DealsPipelineSummary };
