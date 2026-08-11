import { describe, expect, it } from "vitest";

/**
 * Reglas de owner/reference (sin DB): un solo owner; borrar reference
 * no toca el binario.
 */

type Link = { id: string; fileId: string; role: "owner" | "reference" };
type Doc = { id: string; storageKey: string | null; deleted?: boolean };

function assignRoles(links: Link[]): Link[] {
  const byFile = new Map<string, Link[]>();
  for (const l of links) {
    const arr = byFile.get(l.fileId) ?? [];
    arr.push(l);
    byFile.set(l.fileId, arr);
  }
  const out: Link[] = [];
  for (const [, arr] of byFile) {
    arr.forEach((l, i) => {
      out.push({ ...l, role: i === 0 ? "owner" : "reference" });
    });
  }
  return out;
}

function deleteLink(
  docs: Map<string, Doc>,
  links: Link[],
  linkId: string
): { links: Link[]; docs: Map<string, Doc> } {
  const link = links.find((l) => l.id === linkId);
  if (!link) return { links, docs };
  if (link.role === "reference") {
    return { links: links.filter((l) => l.id !== linkId), docs };
  }
  // owner: cascade doc
  const nextDocs = new Map(docs);
  const d = nextDocs.get(link.fileId);
  if (d) nextDocs.set(link.fileId, { ...d, deleted: true });
  return {
    links: links.filter((l) => l.fileId !== link.fileId),
    docs: nextDocs,
  };
}

describe("documento owner rules", () => {
  it("garantiza un solo owner por file", () => {
    const assigned = assignRoles([
      { id: "l1", fileId: "f1", role: "owner" },
      { id: "l2", fileId: "f1", role: "owner" },
      { id: "l3", fileId: "f1", role: "owner" },
    ]);
    expect(assigned.filter((l) => l.role === "owner")).toHaveLength(1);
    expect(assigned.filter((l) => l.role === "reference")).toHaveLength(2);
  });

  it("borrar reference no toca el binario", () => {
    const docs = new Map<string, Doc>([
      ["f1", { id: "f1", storageKey: "crm/x.pdf" }],
    ]);
    const links: Link[] = [
      { id: "own", fileId: "f1", role: "owner" },
      { id: "ref", fileId: "f1", role: "reference" },
    ];
    const after = deleteLink(docs, links, "ref");
    expect(after.links).toHaveLength(1);
    expect(after.docs.get("f1")?.deleted).toBeFalsy();
    expect(after.docs.get("f1")?.storageKey).toBe("crm/x.pdf");
  });
});
