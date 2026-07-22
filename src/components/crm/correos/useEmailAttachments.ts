"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AttachmentPickerItem } from "@/components/opai-ds";
import {
  MAX_EMAIL_ATTACHMENTS,
  MAX_EMAIL_ATTACHMENT_BYTES,
  isBlockedEmailAttachment,
  type StagedEmailAttachment,
} from "@/modules/crm/email/gmail-outbound-attachments";

type EmailAttachmentItem = AttachmentPickerItem & {
  file: File;
  mimeType: string;
  storageKey?: string;
};

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function uploadToR2(params: {
  url: string;
  file: File;
  onProgress: (progress: number) => void;
  register: (xhr: XMLHttpRequest) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    params.register(xhr);
    xhr.open("PUT", params.url);
    xhr.setRequestHeader(
      "Content-Type",
      params.file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        params.onProgress((event.loaded / event.total) * 100);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 respondió ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Error de red durante la subida"));
    xhr.onabort = () => reject(new Error("Subida cancelada"));
    xhr.send(params.file);
  });
}

export function useEmailAttachments() {
  const [items, setItems] = useState<EmailAttachmentItem[]>([]);
  const uploadsRef = useRef(new Map<string, XMLHttpRequest>());
  const itemsRef = useRef<EmailAttachmentItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      for (const xhr of uploadsRef.current.values()) xhr.abort();
      for (const item of itemsRef.current) {
        if (!item.storageKey) continue;
        void fetch("/api/crm/gmail/attachments/presign", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storageKey: item.storageKey }),
          keepalive: true,
        }).catch(() => {});
      }
    },
    [],
  );

  const update = useCallback(
    (id: string, patch: Partial<EmailAttachmentItem>) => {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const uploadOne = useCallback(
    async (item: EmailAttachmentItem) => {
      update(item.id, {
        status: "uploading",
        progress: 0,
        error: undefined,
      });
      let storageKey: string | undefined;
      try {
        const response = await fetch("/api/crm/gmail/attachments/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.name,
            mimeType: item.mimeType,
            size: item.size,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          data?: { uploadUrl: string; storageKey: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error || "No se pudo preparar la subida");
        }
        storageKey = payload.data.storageKey;
        update(item.id, { storageKey });
        await uploadToR2({
          url: payload.data.uploadUrl,
          file: item.file,
          onProgress: (progress) => update(item.id, { progress }),
          register: (xhr) => uploadsRef.current.set(item.id, xhr),
        });
        uploadsRef.current.delete(item.id);
        update(item.id, { status: "ready", progress: 100, storageKey });
      } catch (error) {
        uploadsRef.current.delete(item.id);
        update(item.id, {
          status: "error",
          error: error instanceof Error ? error.message : "No se pudo subir",
          ...(storageKey ? { storageKey } : {}),
        });
      }
    },
    [update],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const slots = Math.max(MAX_EMAIL_ATTACHMENTS - items.length, 0);
      const candidates = files.slice(0, slots);
      if (files.length > slots) {
        toast.error(`Podés adjuntar hasta ${MAX_EMAIL_ATTACHMENTS} archivos`);
      }
      let total = items.reduce((sum, item) => sum + item.size, 0);
      const accepted: EmailAttachmentItem[] = [];
      for (const file of candidates) {
        const mimeType = file.type || "application/octet-stream";
        if (isBlockedEmailAttachment(file.name, mimeType)) {
          toast.error(`Gmail no permite adjuntar “${file.name}”`);
          continue;
        }
        if (total + file.size > MAX_EMAIL_ATTACHMENT_BYTES) {
          toast.error("Los adjuntos no pueden superar 25 MB en total");
          continue;
        }
        total += file.size;
        accepted.push({
          id: makeId(),
          name: file.name,
          size: file.size,
          mimeType,
          file,
          status: "uploading",
          progress: 0,
        });
      }
      if (accepted.length === 0) return;
      setItems((current) => [...current, ...accepted]);
      for (const item of accepted) void uploadOne(item);
    },
    [items, uploadOne],
  );

  const remove = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      uploadsRef.current.get(id)?.abort();
      uploadsRef.current.delete(id);
      setItems((current) => current.filter((candidate) => candidate.id !== id));
      if (item?.storageKey) {
        void fetch("/api/crm/gmail/attachments/presign", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storageKey: item.storageKey }),
        }).catch(() => {});
      }
    },
    [items],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      if (item.storageKey) {
        void fetch("/api/crm/gmail/attachments/presign", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storageKey: item.storageKey }),
        }).catch(() => {});
      }
      update(id, { storageKey: undefined });
      void uploadOne({ ...item, storageKey: undefined });
    },
    [items, update, uploadOne],
  );

  const discardAll = useCallback(() => {
    for (const xhr of uploadsRef.current.values()) xhr.abort();
    uploadsRef.current.clear();
    const keys = items
      .map((item) => item.storageKey)
      .filter((key): key is string => Boolean(key));
    setItems([]);
    for (const storageKey of keys) {
      void fetch("/api/crm/gmail/attachments/presign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey }),
      }).catch(() => {});
    }
  }, [items]);

  const readyAttachments = useMemo<StagedEmailAttachment[]>(
    () =>
      items.flatMap((item) =>
        item.status === "ready" && item.storageKey
          ? [
              {
                storageKey: item.storageKey,
                fileName: item.name,
                mimeType: item.mimeType,
                size: item.size,
              },
            ]
          : [],
      ),
    [items],
  );

  return {
    items,
    addFiles,
    remove,
    retry,
    discardAll,
    resetAfterSend: () => {
      uploadsRef.current.clear();
      setItems([]);
    },
    readyAttachments,
    uploading: items.some((item) => item.status === "uploading"),
    hasErrors: items.some((item) => item.status === "error"),
  };
}
