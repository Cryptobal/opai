import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RsvpBadge } from "../RsvpBadge";

describe("RsvpBadge", () => {
  it("participante invitado por email (sin Google) con accepted → ✓ Va", () => {
    render(
      <RsvpBadge
        participant={{ invitedVia: "email", responseStatus: "accepted" }}
      />,
    );
    expect(screen.getByText("✓ Va")).toBeInTheDocument();
    expect(screen.queryByText(/OPAI|Sin invitar/)).not.toBeInTheDocument();
  });

  it("sin vía de invitación → ◉ Sin invitar", () => {
    render(
      <RsvpBadge
        participant={{ invitedVia: "none", responseStatus: "accepted" }}
      />,
    );
    expect(screen.getByText("◉ Sin invitar")).toBeInTheDocument();
  });

  it("cuenta Google con declined → ✗ No va", () => {
    render(
      <RsvpBadge
        participant={{ invitedVia: "google_account", responseStatus: "declined" }}
      />,
    );
    expect(screen.getByText("✗ No va")).toBeInTheDocument();
  });
});
