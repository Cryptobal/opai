/**
 * Resuelve tokens de firma (signature.signer_N, etc.) en contenido TipTap
 * con datos reales del firmante: imagen, nombre escrito, etc.
 */

type SignerData = {
  name: string;
  signingOrder: number;
  signedAt: Date | null;
  signatureMethod: string | null;
  signatureImageUrl: string | null;
  signatureTypedName: string | null;
  signatureFontFamily: string | null;
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-CL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function resolveSignatureTokensInContent(
  content: unknown,
  ctx: {
    sentAt: Date | null;
    signers: SignerData[];
    repLegalFirma?: string | null;
  }
): unknown {
  if (!content || typeof content !== "object") return content;
  if (Array.isArray(content)) return content.map((c) => resolveSignatureTokensInContent(c, ctx));
  const node = content as { type?: string; attrs?: { tokenKey?: string }; content?: unknown[] };
  if (node.type === "contractToken" && node.attrs?.tokenKey) {
    const key = node.attrs.tokenKey;
    if (key === "signature.sentDate") return { type: "text", text: formatDate(ctx.sentAt) };
    if (key === "signature.signedDate") {
      const last = ctx.signers.reduce(
        (p, s) => (!p || (s.signedAt && (!p.signedAt || s.signedAt > p.signedAt)) ? s : p),
        null as SignerData | null
      );
      return { type: "text", text: formatDate(last?.signedAt ?? null) };
    }
    if (key === "empresa.firmaRepLegal" && ctx.repLegalFirma && (ctx.repLegalFirma.startsWith("data:image") || ctx.repLegalFirma.startsWith("http"))) {
      return { type: "image", attrs: { src: ctx.repLegalFirma, alt: "Firma representante legal" } };
    }
    const effectiveKey = key === "signature.firmaGuardia" || key === "signature.placeholder" ? "signature.signer_1" : key;
    const m = /^signature\.signer_(\d+)$/.exec(effectiveKey);
    if (m) {
      const order = parseInt(m[1], 10);
      const signer = ctx.signers.find((s) => s.signingOrder === order);
      if (!signer) return { type: "text", text: "" };
      if (signer.signatureMethod === "typed") {
        return {
          type: "text",
          text: signer.signatureTypedName || signer.name,
          marks: [{ type: "textStyle", attrs: { fontFamily: signer.signatureFontFamily || "cursive" } }],
        };
      }
      if (signer.signatureImageUrl && (signer.signatureImageUrl.startsWith("data:") || signer.signatureImageUrl.startsWith("http"))) {
        return { type: "image", attrs: { src: signer.signatureImageUrl, alt: `Firma de ${signer.name}` } };
      }
      return { type: "text", text: `[Firmado por ${signer.name}]` };
    }
  }
  if (node.content && Array.isArray(node.content)) {
    return { ...node, content: node.content.map((c) => resolveSignatureTokensInContent(c, ctx)) };
  }
  return content;
}
