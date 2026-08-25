/**
 * Evaluación de condiciones de plantillas ({{#if}} y nodo conditionalBlock).
 * Retro-compatible con operadores existentes (== string, > numérico, truthy).
 */

type EntityMap = Record<string, Record<string, unknown> | null | undefined>;

export type ConditionOp =
  | "=="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "truthy"
  | "empty";

const CONDITIONAL_MODULES = new Set([
  "guardia",
  "quote",
  "empresa",
  "account",
  "contract",
  "installation",
  "deal",
  "contact",
]);

export { CONDITIONAL_MODULES };

function isEmptyValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (val === false || val === 0) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  return false;
}

export function evaluateFieldCondition(
  field: string,
  op: ConditionOp,
  value: string | undefined,
  entities: EntityMap,
): boolean {
  const m = /^([a-z_]+)\.(\w+)$/i.exec(field.trim());
  if (!m || !CONDITIONAL_MODULES.has(m[1])) return false;
  const entity = entities[m[1]] as Record<string, unknown> | undefined;
  if (!entity) return false;
  const actual = entity[m[2]];

  if (op === "empty") return isEmptyValue(actual);
  if (op === "truthy") return !isEmptyValue(actual);

  if (op === ">" || op === "<" || op === ">=" || op === "<=") {
    const num = Number(actual);
    const exp = Number(value);
    if (Number.isNaN(num) || Number.isNaN(exp)) return false;
    if (op === ">") return num > exp;
    if (op === "<") return num < exp;
    if (op === ">=") return num >= exp;
    return num <= exp;
  }

  const a = String(actual ?? "").toLowerCase();
  const e = String(value ?? "").toLowerCase();
  if (op === "==") return a === e;
  if (op === "!=") return a !== e;
  return false;
}

/** Evalúa expresiones tipo `guardia.isJubilado=="SI"` / `quote.ipcWeight>0`. */
export function evaluateCondition(expr: string, entities: EntityMap): boolean {
  const text = expr.trim();
  const mNum = /^([a-z_]+)\.(\w+)\s*(>=|<=|!=|>|<|==)\s*(-?\d+(?:\.\d+)?)$/i.exec(text);
  if (mNum) {
    return evaluateFieldCondition(
      `${mNum[1]}.${mNum[2]}`,
      mNum[3] as ConditionOp,
      mNum[4],
      entities,
    );
  }
  const mStr = /^([a-z_]+)\.(\w+)\s*(==|!=)\s*"([^"]*)"$/i.exec(text);
  if (mStr) {
    return evaluateFieldCondition(
      `${mStr[1]}.${mStr[2]}`,
      mStr[3] as ConditionOp,
      mStr[4],
      entities,
    );
  }
  const mEmpty = /^([a-z_]+)\.(\w+)\s+(empty|isempty|vacio|vacío)$/i.exec(text);
  if (mEmpty) {
    return evaluateFieldCondition(`${mEmpty[1]}.${mEmpty[2]}`, "empty", undefined, entities);
  }
  const mTruthy = /^([a-z_]+)\.(\w+)$/i.exec(text);
  if (mTruthy) {
    return evaluateFieldCondition(
      `${mTruthy[1]}.${mTruthy[2]}`,
      "truthy",
      undefined,
      entities,
    );
  }
  return false;
}

export function conditionToMustache(field: string, op: ConditionOp, value?: string): string {
  if (op === "truthy") return `{{#if ${field}}}`;
  if (op === "empty") return `{{#if ${field} empty}}`;
  if (op === "==" || op === "!=") return `{{#if ${field}${op}"${value ?? ""}"}}`;
  return `{{#if ${field}${op}${value ?? "0"}}}`;
}
