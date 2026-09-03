import { describe, expect, it } from "vitest";
import {
  PROPOSAL_DRAFT_WATERMARK,
  resolveProposalWatermark,
} from "../proposal-watermark";

describe("resolveProposalWatermark", () => {
  it("draft → watermark", () => {
    expect(
      resolveProposalWatermark({
        proposalStatus: "borrador",
        quoteStatus: "draft",
      }),
    ).toBe(PROPOSAL_DRAFT_WATERMARK);
    expect(
      resolveProposalWatermark({
        pdfMode: "draft",
        proposalStatus: "borrador",
        quoteStatus: "draft",
      }),
    ).toBe(PROPOSAL_DRAFT_WATERMARK);
    expect(
      resolveProposalWatermark({
        pdfMode: "draft",
        proposalStatus: "en_revision",
        quoteStatus: "draft",
      }),
    ).toBe(PROPOSAL_DRAFT_WATERMARK);
  });

  it("sent → no watermark", () => {
    expect(
      resolveProposalWatermark({
        pdfMode: "draft",
        proposalStatus: "enviada",
        quoteStatus: "sent",
      }),
    ).toBeNull();
    expect(
      resolveProposalWatermark({
        proposalStatus: "borrador",
        quoteStatus: "sent",
      }),
    ).toBeNull();
    expect(
      resolveProposalWatermark({
        pdfMode: "draft",
        proposalStatus: "en_revision",
        quoteStatus: "sent",
      }),
    ).toBeNull();
  });

  it("approved → no watermark", () => {
    expect(
      resolveProposalWatermark({
        pdfMode: "draft",
        proposalStatus: "aprobada",
        quoteStatus: "sent",
      }),
    ).toBeNull();
    expect(
      resolveProposalWatermark({
        proposalStatus: "aprobada",
        quoteStatus: "draft",
      }),
    ).toBeNull();
    expect(
      resolveProposalWatermark({
        quoteStatus: "approved",
        proposalStatus: "borrador",
      }),
    ).toBeNull();
    expect(
      resolveProposalWatermark({
        proposalStatus: "adjudicada",
        quoteStatus: "draft",
      }),
    ).toBeNull();
    expect(
      resolveProposalWatermark({
        proposalStatus: "presentada",
        quoteStatus: "draft",
      }),
    ).toBeNull();
  });

  it("pdfMode final nunca sella, incluso en borrador", () => {
    expect(
      resolveProposalWatermark({
        pdfMode: "final",
        proposalStatus: "borrador",
        quoteStatus: "draft",
      }),
    ).toBeNull();
  });

  it("GET sin mode (pdfMode draft por default) no sella una propuesta aprobada — repro CPQ-2026-286", () => {
    expect(
      resolveProposalWatermark({
        pdfMode: "draft",
        proposalStatus: "aprobada",
        quoteStatus: "sent",
      }),
    ).toBeNull();
  });

  it("sin status conocido se trata como borrador", () => {
    expect(resolveProposalWatermark({})).toBe(PROPOSAL_DRAFT_WATERMARK);
    expect(resolveProposalWatermark({ pdfMode: "draft" })).toBe(
      PROPOSAL_DRAFT_WATERMARK,
    );
  });
});
