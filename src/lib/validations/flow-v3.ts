import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");

export const flowSectionSchema = z.enum([
  "INGRESOS",
  "REMUNERACIONES",
  "IMPUESTOS",
  "GAV",
  "FINANCIAMIENTO",
  "OTROS",
]);

export const flowMatrixQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  horizon: z.enum(["week", "month"]).default("week"),
});

export const flowRowKeySchema = z.enum([
  "BANDEJA_INGRESO",
  "BANDEJA_EGRESO",
  "SUELDO",
  "QUINCENA",
  "PREVIRED",
  "TURNO_EXTRA",
  "FINIQUITO",
  "IVA_F29",
  "IVA_POSTERGADO",
  "OTRO_IMPUESTO",
  "FACTORING",
  "RETIRO_SOCIO",
  "DEVOL_PRESTAMO_SOCIO",
  "APORTE_SOCIO",
  "CREDITO",
]);

export const flowRowCreateSchema = z
  .object({
    section: flowSectionSchema,
    name: z.string().trim().min(1).max(120),
    mapping: z.enum([
      "ACCOUNT_INSTALLATION",
      "ACCOUNTS",
      "CATEGORY",
      "SUPPLIER",
      "MANUAL",
    ]),
    crmAccountId: z.string().uuid().nullish(),
    installationId: z.string().uuid().nullish(),
    recurringTemplateId: z.string().uuid().nullish(),
    accountPlanIds: z.array(z.string().uuid()).max(50).optional(),
    canonicalKey: flowRowKeySchema.nullish(),
    /** @deprecated Preferir accountPlanIds. */
    categoryId: z.string().uuid().nullish(),
    supplierId: z.string().uuid().nullish(),
  })
  .refine((v) => v.mapping !== "ACCOUNT_INSTALLATION" || !!v.crmAccountId, {
    message: "crmAccountId requerido para mapping ACCOUNT_INSTALLATION",
  })
  .refine((v) => !v.recurringTemplateId || v.mapping === "ACCOUNT_INSTALLATION", {
    message: "recurringTemplateId solo aplica a mapping ACCOUNT_INSTALLATION",
  })
  .refine((v) => v.mapping !== "SUPPLIER" || !!v.supplierId, {
    message: "supplierId requerido para mapping SUPPLIER",
  });

export const flowRowRenameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const flowRowUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    section: flowSectionSchema.optional(),
    accountPlanIds: z.array(z.string().uuid()).max(50).optional(),
    canonicalKey: flowRowKeySchema.nullish(),
    /** @deprecated Preferir accountPlanIds. */
    categoryId: z.string().uuid().optional(),
    mapping: z.enum(["ACCOUNTS", "CATEGORY", "MANUAL"]).optional(),
  })
  .refine(
    (v) =>
      v.name != null ||
      v.section != null ||
      v.accountPlanIds != null ||
      v.canonicalKey !== undefined ||
      v.categoryId != null ||
      v.mapping != null,
    { message: "Nada que actualizar" },
  );

export const flowRowReorderSchema = z.object({
  section: flowSectionSchema,
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});

const planAmount = z
  .number()
  .finite()
  .min(-99_999_999_999)
  .max(99_999_999_999);

export const flowPlanUpsertSchema = z.object({
  rowId: z.string().uuid(),
  weekStart: ymd,
  amount: planAmount,
});

/** Ancla manual de saldo acumulado (null ⇒ borrar ancla). */
export const flowBalanceAnchorSchema = z.object({
  weekStart: ymd,
  balanceClp: z
    .number()
    .finite()
    .min(-99_999_999_999)
    .max(99_999_999_999)
    .nullable(),
});

/** Nota libre de celda (body vacío/null ⇒ borrar). */
export const flowCellNoteUpsertSchema = z.object({
  rowId: z.string().uuid(),
  weekStart: ymd,
  body: z.string().max(2000).nullable(),
  /** Si true, estampa la nota en todas las celdas de plan futuras de la fila. */
  applyToFuturePlanCells: z.boolean().optional().default(false),
});

/** Liquidación de proyección vs real (AUTO = reabrir / CLOSED = dar por cumplido). */
export const flowCellSettlementSchema = z.object({
  rowId: z.string().uuid(),
  weekStart: ymd,
  mode: z.enum(["AUTO", "CLOSED"]),
  /** Proyección vigente al cerrar (auditoría). Opcional. */
  projectedClp: z.number().finite().optional(),
});

export const flowPlanBulkFillSchema = z.object({
  rowId: z.string().uuid(),
  weekStarts: z.array(ymd).min(1).max(60),
  amount: planAmount,
});

export const flowRecurringEndDateSchema = z.object({
  /** null = programación sin término. */
  endDate: ymd.nullable(),
});

/** Mover plan de una semana a otra dentro de la misma fila (drag / menú). */
export const flowPlanMoveSchema = z.object({
  rowId: z.string().uuid(),
  fromWeek: ymd,
  toWeek: ymd,
});

/** Mover UNA cuota programada (P) a otra semana. No toca facturas ni el template. */
export const flowScheduledMoveSchema = z.object({
  templateId: z.string().uuid(),
  billingPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Período YYYY-MM"),
  toWeek: ymd,
});

/** Mover un hito de egreso (quincena, sueldos, …) a otra semana. */
export const flowMilestoneMoveSchema = z.object({
  milestoneKey: z.enum([
    "liquido",
    "quincena",
    "previred",
    "impuesto_unico",
    "f29",
    "iva_postergado",
    "turnos_extra",
    "retiro_socio",
    "finiquitos",
  ]),
  billingPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Período YYYY-MM"),
  toWeek: ymd,
});

/** Postergar / deshacer el IVA de un período tributario (YYYY-MM). */
export const flowIvaPostponeSchema = z.object({
  taxPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Período YYYY-MM"),
});

export const flowRecurrenceFrequencySchema = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]);
export const flowPlanCurrencySchema = z.enum(["CLP", "UF"]);
export const flowRecurrenceAmountModeSchema = z.enum(["FIXED", "PCT_SALES"]);
export const flowUfPolicySchema = z.enum([
  "RUN_DAY",
  "LAST_DAY_MONTH",
  "LAST_DAY_PREV_MONTH",
  "CUSTOM_DAY",
  "FIRST_DAY_MONTH",
]);

/** Egreso/financiamiento recurrente de plan (v5: N repeticiones, monto signado).
 *  v5.1: amountMode PCT_SALES = % ventas netas mes anterior (derive-on-read). */
export const flowRecurringPlanCreateSchema = z
  .object({
    rowId: z.string().uuid().optional(),
    /** CLP por ocurrencia. FINANCIAMIENTO acepta signo (− egreso / + ingreso).
     *  PCT_SALES: 0 en egresos; ±1 en FINANCIAMIENTO indica signo cash. */
    amount: planAmount.optional().default(0),
    frequency: flowRecurrenceFrequencySchema,
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    startDate: ymd,
    endDate: ymd.nullish(),
    endAfterOccurrences: z.number().int().min(1).max(240).nullish(),
    currency: flowPlanCurrencySchema.optional().default("CLP"),
    amountMode: flowRecurrenceAmountModeSchema.optional().default("FIXED"),
    /** Porcentaje 0–100 (UI). Se persiste como fracción en BD. */
    pctSales: z.number().finite().gt(0).lte(100).nullish(),
    amountUf: z.number().finite().positive().max(1_000_000).nullish(),
    ufPolicy: flowUfPolicySchema.nullish(),
    ufCustomDay: z.number().int().min(1).max(31).nullish(),
    /** Desglose del monto (ej. "contador + abogado"). Se estampa en celdas. */
    note: z.string().max(2000).nullish(),
    /** Crear fila destino nueva (nombre + categoría opcional) en vez de usar rowId. */
    newRow: z
      .object({
        section: flowSectionSchema,
        name: z.string().trim().min(1).max(120),
        categoryId: z.string().uuid().nullish(),
      })
      .nullish(),
  })
  .refine((v) => !!v.rowId || !!v.newRow, {
    message: "rowId o newRow requerido",
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "endDate no puede ser anterior a startDate",
  })
  .refine(
    (v) => {
      if (v.amountMode === "PCT_SALES") {
        return v.pctSales != null && v.pctSales > 0 && v.pctSales <= 100
          && v.frequency === "MONTHLY";
      }
      return v.currency === "UF"
        ? v.amountUf != null && v.amountUf > 0
        : (v.amount ?? 0) !== 0;
    },
    { message: "Monto requerido (CLP, UF o % ventas 0–100; PCT_SALES exige MONTHLY)" },
  );

export const flowRecurringPlanUpdateSchema = z
  .object({
    amount: planAmount.optional(),
    frequency: flowRecurrenceFrequencySchema.optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    startDate: ymd.optional(),
    endDate: ymd.nullish(),
    endAfterOccurrences: z.number().int().min(1).max(240).nullish(),
    currency: flowPlanCurrencySchema.optional(),
    amountMode: flowRecurrenceAmountModeSchema.optional(),
    pctSales: z.number().finite().gt(0).lte(100).nullish(),
    amountUf: z.number().finite().positive().max(1_000_000).nullish(),
    ufPolicy: flowUfPolicySchema.nullish(),
    ufCustomDay: z.number().int().min(1).max(31).nullish(),
    note: z.string().max(2000).nullish(),
  })
  .refine(
    (v) =>
      v.amount != null ||
      v.frequency != null ||
      v.dayOfMonth !== undefined ||
      v.startDate != null ||
      v.endDate !== undefined ||
      v.endAfterOccurrences !== undefined ||
      v.currency != null ||
      v.amountMode != null ||
      v.pctSales != null ||
      v.amountUf != null ||
      v.ufPolicy !== undefined ||
      v.ufCustomDay !== undefined ||
      v.note !== undefined,
    { message: "Nada que actualizar" },
  )
  .refine(
    (v) =>
      v.amountMode !== "PCT_SALES"
      || (v.pctSales != null && v.pctSales > 0 && v.pctSales <= 100
        && (v.frequency == null || v.frequency === "MONTHLY")),
    { message: "PCT_SALES requiere pctSales 0–100 y frecuencia MONTHLY" },
  );

export const flowUnmatchedIncomeCreateSchema = z.object({
  dteId: z.string().uuid(),
});

/** Vincular DTE(s) de "Otros ingresos" a una programación de su cuenta. */
export const flowUnmatchedIncomeLinkTemplateSchema = z
  .object({
    dteId: z.string().uuid().optional(),
    /** Lote (v4.5): vincular N facturas del mismo cliente. */
    dteIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    templateId: z.string().uuid(),
  })
  .refine((v) => !!v.dteId || (v.dteIds != null && v.dteIds.length > 0), {
    message: "dteId o dteIds requerido",
  });

export const flowChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export const flowRecurringPlanDeleteSchema = z.object({
  keepCells: z.boolean().optional(),
});

/** Cierre semanal desde v3. weekEnd es un domingo (fin de semana ISO). */
export const flowWeeklyCloseSchema = z.object({
  weekEnd: ymd,
  closedBalance: z.number().finite().min(-99_999_999_999).max(99_999_999_999),
  notes: z.string().trim().max(1000).optional(),
  manualReason: z.string().trim().min(5).max(500).optional(),
});
