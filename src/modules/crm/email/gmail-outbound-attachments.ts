export const MAX_EMAIL_ATTACHMENTS = 10;
export const MAX_EMAIL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  "ade",
  "adp",
  "apk",
  "appx",
  "bat",
  "bin",
  "cab",
  "chm",
  "cmd",
  "com",
  "cpl",
  "dll",
  "dmg",
  "exe",
  "hta",
  "img",
  "ins",
  "iso",
  "isp",
  "jar",
  "js",
  "jse",
  "lib",
  "lnk",
  "mde",
  "msc",
  "msi",
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
  "vxd",
  "wsc",
  "wsf",
  "wsh",
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
  const ext = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
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
