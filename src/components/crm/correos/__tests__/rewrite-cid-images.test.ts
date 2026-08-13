import { describe, expect, it } from "vitest";
import {
  resolveCidAttachment,
  rewriteCidImages,
  type CidAttachmentRef,
} from "../rewrite-cid-images";

const att: CidAttachmentRef = {
  messageId: "msg-1",
  attachmentId: "att-1",
  filename: "image001.jpg",
  mimeType: "image/jpeg",
  contentId: "image001.jpg@01DABC",
  size: 6123,
};

describe("resolveCidAttachment", () => {
  it("matchea por contentId con o sin brackets", () => {
    expect(resolveCidAttachment("image001.jpg@01DABC", [att])?.attachmentId).toBe("att-1");
    expect(resolveCidAttachment("<image001.jpg@01DABC>", [att])?.attachmentId).toBe("att-1");
  });

  it("matchea por filename (Outlook)", () => {
    expect(
      resolveCidAttachment("image001.jpg", [{ ...att, contentId: null }])?.attachmentId,
    ).toBe("att-1");
  });

  it("usa la única imagen del mensaje como fallback", () => {
    expect(
      resolveCidAttachment("xyz@local", [{ ...att, contentId: null, filename: "firma.png" }])
        ?.filename,
    ).toBe("firma.png");
  });
});

describe("rewriteCidImages", () => {
  it("reescribe cid a la URL del endpoint de adjuntos", () => {
    const html = '<p><img src="cid:image001.jpg" alt="firma"></p>';
    const out = rewriteCidImages(html, "thread-1", [att], "msg-1");
    expect(out).toContain("/api/crm/correos/thread-1/attachments/msg-1/att-1");
    expect(out).toContain("fn=image001.jpg");
    expect(out).not.toContain("cid:");
  });

  it("reescribe url(cid) y background=cid a la URL del adjunto", () => {
    const html =
      '<td background="cid:image001.jpg@01DABC" style="background-image:url(cid:image001.jpg@01DABC)"></td>';
    const out = rewriteCidImages(html, "thread-1", [att], "msg-1");
    expect(out).toContain("/api/crm/correos/thread-1/attachments/msg-1/att-1");
    expect(out).not.toContain("cid:");
  });

  it("deja cid sin match intacto", () => {
    const html = '<img src="cid:missing@x">';
    expect(rewriteCidImages(html, "t", [], "m")).toBe(html);
  });
});
