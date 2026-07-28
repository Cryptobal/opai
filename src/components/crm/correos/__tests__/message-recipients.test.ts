import { describe, expect, it } from "vitest";
import {
  buildRecipientChips,
  displayName,
  summarizeRecipients,
} from "../message-recipients";

describe("message-recipients", () => {
  it("displayName prefiere nombre sobre email", () => {
    expect(displayName('"Ana Pérez" <ana@maclean.cl>')).toBe("Ana Pérez");
    expect(displayName("solo@x.cl")).toBe("solo");
  });

  it("summarizeRecipients compacta Para y CC en una línea", () => {
    const s = summarizeRecipients({
      fromEmail: "Constanza Daniela <c@maclean.cl>",
      replyToEmail: "Roberto <roberto@maclean.cl>",
      toEmails: ["comercial <comercial@gard.cl>"],
      ccEmails: [
        "vriquelme <vriquelme@maclean.cl>",
        "yencastilar <yencastilar@maclean.cl>",
        "omjang <omjang@maclean.cl>",
      ],
    });
    expect(s.from).toBe("Constanza Daniela");
    expect(s.line).toContain("Para comercial");
    expect(s.line).toContain("CC 3");
    expect(s.line).toContain("Reply-To");
  });

  it("buildRecipientChips incluye De, Reply-To, Para y CC", () => {
    const chips = buildRecipientChips({
      fromEmail: "A <a@x.cl>",
      replyToEmail: "B <b@x.cl>",
      toEmails: ["c@x.cl"],
      ccEmails: ["d@x.cl", "e@x.cl"],
    });
    expect(chips.map((c) => c.label)).toEqual([
      "De",
      "Responder a",
      "Para",
      "CC",
      "CC",
    ]);
  });

  it("no duplica Reply-To si es el mismo email que De", () => {
    const chips = buildRecipientChips({
      fromEmail: "A <a@x.cl>",
      replyToEmail: "A <a@x.cl>",
      toEmails: [],
      ccEmails: [],
    });
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe("De");
  });
});
