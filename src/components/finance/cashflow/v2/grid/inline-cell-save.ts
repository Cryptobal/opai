import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import {
  saveOccurrenceAmount,
  saveGroupAmount,
  revertAmount,
  type AmountResult,
} from "./cashflow-amount";
import {
  createManualEntryViaApi,
  materializeItemAmountViaApi,
} from "./cashflow-create";
import { isRealItemId } from "./grid-helpers";
import type { ClientReturnRange } from "./return-range-client";

export async function saveInlineEdit(opts: {
  amount: number;
  currentAmount: number;
  isGroup: boolean;
  occurrenceId: string | null;
  groupOccurrences?: { id: string; amountClp: number }[];
  returnRange?: ClientReturnRange;
}): Promise<{
  res: AmountResult;
  optimistic?: number;
  noop?: boolean;
  projection?: ProjectionMatrix;
}> {
  if (opts.amount === Math.round(opts.currentAmount)) {
    return { res: { ok: true }, noop: true };
  }
  const res = opts.isGroup
    ? await saveGroupAmount(
        opts.groupOccurrences ?? [],
        opts.amount,
        opts.returnRange,
      )
    : opts.occurrenceId
      ? await saveOccurrenceAmount(
          opts.occurrenceId,
          opts.amount,
          opts.returnRange,
        )
      : { ok: false, error: "Cuota sin materializar" };
  return {
    res,
    optimistic: opts.isGroup ? undefined : opts.amount,
    projection: res.projection,
  };
}

export async function revertInlineEdit(opts: {
  isGroup: boolean;
  occurrenceId: string | null;
  groupOccurrences?: { id: string; amountClp: number }[];
  returnRange?: ClientReturnRange;
}): Promise<AmountResult> {
  const ids = opts.isGroup
    ? (opts.groupOccurrences ?? []).map((o) => o.id)
    : opts.occurrenceId
      ? [opts.occurrenceId]
      : [];
  return revertAmount(ids, opts.returnRange);
}

export async function saveInlineCreate(opts: {
  amount: number;
  itemId: string;
  itemName: string;
  kind: "INCOME" | "EXPENSE";
  categoryId?: string | null;
  scheduledDate: string;
  returnRange?: ClientReturnRange;
}): Promise<{
  ok: boolean;
  error?: string;
  id?: string | null;
  projection?: ProjectionMatrix;
}> {
  if (isRealItemId(opts.itemId)) {
    return materializeItemAmountViaApi({
      itemId: opts.itemId,
      originalDate: opts.scheduledDate,
      amountClp: opts.amount,
      returnRange: opts.returnRange,
    });
  }
  return createManualEntryViaApi({
    kind: opts.kind,
    name: opts.itemName,
    amountClp: opts.amount,
    scheduledDate: opts.scheduledDate,
    categoryId: opts.categoryId ?? null,
    returnRange: opts.returnRange,
  });
}
