/**
 * Utilidades del composer de correo para decidir si hay un borrador que
 * guardar. Un reply/forward se monta con destinatarios y asunto prefijados (y
 * a veces un borrador IA precargado): abrir/leer un correo NO debe crear un
 * borrador en Gmail. Solo se autoguarda cuando el usuario editó algo respecto
 * del estado inicial (baseline). Lógica pura y sin React para poder testearla.
 */
import { tiptapToEmailHtml } from "@/lib/docs/tiptap-to-html";

export type ComposerSnapshot = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
};

export type ComposerFields = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** Documento Tiptap del cuerpo (o null si está vacío). */
  body: object | null;
};

/** Texto plano normalizado del cuerpo (para comparar contra el estado inicial). */
export function docPlainText(doc: object | null): string {
  if (!doc) return "";
  return tiptapToEmailHtml(doc)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameStringList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Snapshot comparable de los campos del composer (asunto y cuerpo normalizados). */
export function composerSnapshot(fields: ComposerFields): ComposerSnapshot {
  return {
    to: fields.to,
    cc: fields.cc,
    bcc: fields.bcc,
    subject: fields.subject.trim(),
    body: docPlainText(fields.body),
  };
}

/**
 * `true` cuando el composer no tiene ediciones respecto del baseline: no hay
 * nada que guardar (ni un reply recién abierto, ni un borrador IA sin tocar,
 * ni una composición vacía deben generar un borrador en Gmail).
 */
export function isComposerPristine(
  current: ComposerFields,
  baseline: ComposerSnapshot,
): boolean {
  return (
    sameStringList(current.to, baseline.to) &&
    sameStringList(current.cc, baseline.cc) &&
    sameStringList(current.bcc, baseline.bcc) &&
    current.subject.trim() === baseline.subject &&
    docPlainText(current.body) === baseline.body
  );
}
