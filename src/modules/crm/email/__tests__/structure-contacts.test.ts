import { describe, expect, it } from "vitest";
import {
  guessNameFromLocalPart,
  harvestExternalContacts,
  mergeStructureContacts,
  parseNamedEmail,
  selectedProposalContacts,
  withHeaderContacts,
} from "../structure-contacts";
import { emptyCrmStructureProposal } from "../email-to-crm-structure.types";

describe("parseNamedEmail / guessNameFromLocalPart", () => {
  it("parsea display name + email", () => {
    expect(parseNamedEmail('"Julia Fuentes" <julia.fuentes@maec.es>')).toEqual({
      email: "julia.fuentes@maec.es",
      displayName: "Julia Fuentes",
    });
  });

  it("adivina nombre desde local-part", () => {
    expect(guessNameFromLocalPart("julia.fuentes@maec.es")).toEqual({
      firstName: "Julia",
      lastName: "Fuentes",
    });
  });
});

describe("harvestExternalContacts", () => {
  const tenantDomains = new Set(["empresa-ejemplo.cl"]);

  it("incluye From y CC externos; excluye To del tenant", () => {
    const contacts = harvestExternalContacts({
      tenantDomains,
      ownEmail: "yo@empresa-ejemplo.cl",
      messages: [
        {
          fromEmail: "Embajada España <emb.santiagodechile@maec.es>",
          toEmails: ["yo@empresa-ejemplo.cl"],
          ccEmails: [
            "julia.fuentes@maec.es",
            "fanny.villarroel@maec.es",
            "emb.schile.seg@maec.es",
          ],
        },
      ],
    });

    const emails = contacts.map((c) => c.email).sort();
    expect(emails).toEqual([
      "emb.santiagodechile@maec.es",
      "emb.schile.seg@maec.es",
      "fanny.villarroel@maec.es",
      "julia.fuentes@maec.es",
    ]);
    expect(contacts.find((c) => c.email === "julia.fuentes@maec.es")?.firstName).toBe(
      "Julia",
    );
    expect(contacts.find((c) => c.email === "emb.santiagodechile@maec.es")?.firstName).toBe(
      "Embajada",
    );
  });

  it("no incluye noreply ni dominios del tenant", () => {
    const contacts = harvestExternalContacts({
      tenantDomains,
      ownEmail: "ops@empresa-ejemplo.cl",
      messages: [
        {
          fromEmail: "noreply@maec.es",
          toEmails: ["equipo@empresa-ejemplo.cl", "cliente@minsal.cl"],
          ccEmails: ["yo@empresa-ejemplo.cl"],
        },
      ],
    });
    expect(contacts.map((c) => c.email)).toEqual(["cliente@minsal.cl"]);
  });
});

describe("mergeStructureContacts / withHeaderContacts", () => {
  it("completa CC que la IA omitió y enriquece con firma", () => {
    const merged = mergeStructureContacts(
      [
        {
          firstName: "Embajada",
          lastName: "España",
          email: "emb.santiagodechile@maec.es",
          phone: "+56222352754",
          roleTitle: null,
        },
      ],
      [
        {
          firstName: "Emb",
          lastName: "Santiagodechile",
          email: "emb.santiagodechile@maec.es",
          phone: null,
          roleTitle: null,
        },
        {
          firstName: "Julia",
          lastName: "Fuentes",
          email: "julia.fuentes@maec.es",
          phone: null,
          roleTitle: null,
        },
      ],
    );

    expect(merged).toHaveLength(2);
    const emb = merged.find((c) => c.email === "emb.santiagodechile@maec.es");
    expect(emb?.firstName).toBe("Embajada");
    expect(emb?.phone).toBe("+56222352754");
    expect(merged.some((c) => c.email === "julia.fuentes@maec.es")).toBe(true);
  });

  it("reaplica deselection del borrador en refine", () => {
    const proposal = emptyCrmStructureProposal();
    proposal.contact = {
      firstName: "Embajada",
      lastName: "España",
      email: "emb.santiagodechile@maec.es",
      phone: null,
      roleTitle: null,
    };
    proposal.contacts = [proposal.contact];

    const next = withHeaderContacts(
      proposal,
      [
        {
          firstName: "Julia",
          lastName: "Fuentes",
          email: "julia.fuentes@maec.es",
          phone: null,
          roleTitle: null,
        },
      ],
      [
        {
          firstName: "Julia",
          lastName: "Fuentes",
          email: "julia.fuentes@maec.es",
          phone: null,
          roleTitle: null,
          selected: false,
        },
      ],
    );

    const julia = next.contacts?.find((c) => c.email === "julia.fuentes@maec.es");
    expect(julia?.selected).toBe(false);
    expect(
      selectedProposalContacts({
        contact: next.contact,
        contacts: next.contacts,
      }).map((c) => c.email),
    ).toEqual(["emb.santiagodechile@maec.es"]);
  });
});
