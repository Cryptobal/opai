import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposalSectionList } from "../ProposalSectionList";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";

function section(over: Partial<ProposalSection> & { id: string; title: string }): ProposalSection {
  return {
    order: 0,
    content: "texto",
    status: "ia",
    sources: [],
    ...over,
  };
}

describe("ProposalSectionList expand", () => {
  const sections = [
    section({ id: "s1", title: "Uno", order: 0 }),
    section({ id: "s2", title: "Dos", order: 1 }),
  ];

  it("expand-all abre N", () => {
    render(
      <ProposalSectionList
        sections={sections}
        expandedIds={new Set(["s1", "s2"])}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        readOnly
        mode="comercial"
      />,
    );
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(2);
  });

  it("collapse-all deja 0", () => {
    render(
      <ProposalSectionList
        sections={sections}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        readOnly
        mode="comercial"
      />,
    );
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(2);
  });
});
