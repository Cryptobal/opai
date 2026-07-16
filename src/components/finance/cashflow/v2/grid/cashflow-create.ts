/**
 * Alta manual / materialización de cuota vía upsert-and-act.
 */

import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import type { ClientReturnRange } from "./return-range-client";

export interface CreateManualInput {
  kind: "INCOME" | "EXPENSE";
  name: string;
  amountClp: number;
  scheduledDate: string;
  categoryId?: string | null;
  returnRange?: ClientReturnRange;
}

export type CreateResult =
  | { ok: true; id: string | null; projection?: ProjectionMatrix }
  | { ok: false; error?: string };

export async function createManualEntryViaApi(
  input: CreateManualInput,
): Promise<CreateResult> {
  const { returnRange, ...rest } = input;
  try {
    const res = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        source: "MANUAL",
        ...rest,
        ...(returnRange ? { returnRange } : {}),
      }),
    });
    const j = await res.json().catch(() => null);
    if (j?.success) {
      return {
        ok: true,
        id: j?.data?.id ?? null,
        projection: j?.data?.projection,
      };
    }
    return { ok: false, error: j?.error ?? "No se pudo crear" };
  } catch {
    return { ok: false, error: "Error de red al crear" };
  }
}

export async function materializeItemAmountViaApi(input: {
  itemId: string;
  originalDate: string;
  amountClp: number;
  returnRange?: ClientReturnRange;
}): Promise<CreateResult> {
  const { returnRange, ...rest } = input;
  try {
    const res = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "amount",
        ...rest,
        ...(returnRange ? { returnRange } : {}),
      }),
    });
    const j = await res.json().catch(() => null);
    if (j?.success) {
      return {
        ok: true,
        id: j?.data?.id ?? null,
        projection: j?.data?.projection,
      };
    }
    return { ok: false, error: j?.error ?? "No se pudo crear la cuota" };
  } catch {
    return { ok: false, error: "Error de red al crear" };
  }
}
