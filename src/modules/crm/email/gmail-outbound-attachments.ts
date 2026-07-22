export const MAX_EMAIL_ATTACHMENTS = 10;
// Gmail expresa el límite en MB decimales. Usar 25 MiB supera por sí solo el
// máximo de 35 MB del mensaje MIME una vez aplicado base64.
export const MAX_EMAIL_ATTACHMENT_BYTES = 25_000_000;
export const MAX_GMAIL_RAW_MESSAGE_BYTES = 35_000_000;

const BLOCKED_EXTENSIONS = new Set([
  "ade",
  "adp",
  "apk",
  "appx",
  "appxbundle",
  "bat",
  "bin",
  "cab",
  "chm",
  "cmd",
  "com",
  "cpl",
  "diagcab",
  "diagcfg",
  "diagpkg",
  "dll",
  "dmg",
  "ex",
  "ex_",
  "exe",
  "hta",
  "img",
  "ins",
  "iso",
  "isp",
  "jar",
  "jnlp",
  "js",
  "jse",
  "lib",
  "lnk",
  "mde",
  "mjs",
  "msc",
  "msi",
  "msix",
  "msixbundle",
  "msp",
  "mst",
  "nsh",
  "pif",
  "ps1",
  "scr",
  "sct",
  "shb",
  "sys",
  "vb",
  "vbe",
  "vbs",
  "vhd",
  "vxd",
  "wsc",
  "wsf",
  "wsh",
  "xll",
]);

const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
]);

export type StagedEmailAttachment = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export function sanitizeEmailAttachmentName(fileName: string): string {
  return (
    fileName
      .replace(/[\\/\x00-\x1f\x7f"]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || "archivo"
  );
}

export function isBlockedEmailAttachment(
  fileName: string,
  mimeType: string,
): boolean {
  const normalizedName = fileName.trim().replace(/[.\s]+$/, "");
  const ext = normalizedName.includes(".")
    ? normalizedName
        .slice(normalizedName.lastIndexOf(".") + 1)
        .toLowerCase()
    : "";
  return BLOCKED_EXTENSIONS.has(ext) || BLOCKED_MIME_TYPES.has(mimeType.toLowerCase());
}

export function emailAttachmentPrefix(
  tenantId: string,
  userId: string,
): string {
  return `${tenantId}/crm-email-staged/${userId}/`;
}

export function isOwnedEmailAttachmentKey(params: {
  storageKey: string;
  tenantId: string;
  userId: string;
}): boolean {
  const key = params.storageKey;
  return (
    key.startsWith(emailAttachmentPrefix(params.tenantId, params.userId)) &&
    !key.includes("..") &&
    !key.includes("\\") &&
    !/^https?:/i.test(key)
  );
}
