"use client";

import { useMemo, useState } from "react";
import { emailPlainFallback, sanitizeEmailHtml } from "@/lib/sanitize-email-html";
import styles from "./email-html-body.module.css";

type Props = {
  htmlBody: string | null;
  textBody: string | null;
};

/** Cuerpo de correo: HTML sanitizado por default; toggle a texto plano. */
export function EmailHtmlBody({ htmlBody, textBody }: Props) {
  const hasHtml = Boolean(htmlBody?.trim());
  const [mode, setMode] = useState<"html" | "text">(hasHtml ? "html" : "text");
  const safeHtml = useMemo(
    () => (hasHtml ? sanitizeEmailHtml(htmlBody!) : ""),
    [hasHtml, htmlBody],
  );
  const plain = useMemo(
    () => emailPlainFallback(htmlBody, textBody),
    [htmlBody, textBody],
  );

  return (
    <div className="space-y-1.5">
      {hasHtml && (
        <button
          type="button"
          onClick={() => setMode((m) => (m === "html" ? "text" : "html"))}
          className="text-[12px] text-primary ds-tap"
        >
          {mode === "html" ? "Ver texto" : "Ver original"}
        </button>
      )}
      {mode === "html" && safeHtml ? (
        <div
          className={styles.root}
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-[13px] text-ds-text-2">
          {plain}
        </p>
      )}
    </div>
  );
}
