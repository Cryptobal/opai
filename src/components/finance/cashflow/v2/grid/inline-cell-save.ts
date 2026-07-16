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

export async function saveInlineEdit(opts: {
  amount: number;
  currentAmount: number;
  isGroup: boolean;
  occurrenceId: string | null;
  groupOccurrences?: { id: string; amountClp: number }[];
}): Promise<{ res: AmountResult; optimistic?: number; noop?: boolean }> {
  if (opts.amount === Math.round(opts.currentAmount)) {
    return { res: { ok: true }, noop: true };
  }
  const res = opts.isGroup
    ? await saveGroupAmount(opts.groupOccurrences ?? [], opts.amount)
    : opts.occurrenceId
      ? await saveOccurrenceAmount(opts.occurrenceId, opts.amount)
      : { ok: false, error: "Cuota sin materializar" };
  return {
    res,
    optimistic: opts.isGroup ? undefined : opts.amount,
  };
}

export async function revertInlineEdit(opts: {
  isGroup: boolean;
  occurrenceId: string | null;
  groupOccurrences?: { id: string; amountClp: number }[];
}): Promise<AmountResult> {
  const ids = opts.isGroup
    ? (opts.groupOccurrences ?? []).map((o) => o.id)
    : opts.occurrenceId
      ? [opts.occurrenceId]
      : [];
  return revertAmount(ids);
}

export async function saveInlineCreate(opts: {
  amount: number;
  itemId: string;
  itemName: string;
  kind: "INCOME" | "EXPENSE";
  categoryId?: string | null;
  scheduledDate: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (isRealItemId(opts.itemId)) {
    return materializeItemAmountViaApi({
      itemId: opts.itemId,
      originalDate: opts.scheduledDate,
      amountClp: opts.amount,
    });
  }
  return createManualEntryViaApi({
    kind: opts.kind,
    name: opts.itemName,
    amountClp: opts.amount,
    scheduledDate: opts.scheduledDate,
    categoryId: opts.categoryId ?? null,
  });
}
