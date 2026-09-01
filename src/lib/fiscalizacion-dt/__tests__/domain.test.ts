import { describe, expect, it } from "vitest";
import { isDtGobClEmail, normalizeDtEmail } from "../domain";

describe("isDtGobClEmail", () => {
  it("acepta dominio exacto en minúsculas", () => {
    expect(isDtGobClEmail("inspector@dt.gob.cl")).toBe(true);
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(isDtGobClEmail("  Inspector@DT.GOB.CL  ")).toBe(true);
    expect(normalizeDtEmail("  Inspector@DT.GOB.CL  ")).toBe("inspector@dt.gob.cl");
  });

  it("rechaza otros dominios", () => {
    expect(isDtGobClEmail("alguien@opai.cl")).toBe(false);
    expect(isDtGobClEmail("alguien@gmail.com")).toBe(false);
    expect(isDtGobClEmail("alguien@dt.gob.cl.algo")).toBe(false);
    expect(isDtGobClEmail("alguien@sub.dt.gob.cl")).toBe(false);
    expect(isDtGobClEmail("alguien@dt.gob.clx")).toBe(false);
  });

  it("rechaza correo mal formado", () => {
    expect(isDtGobClEmail("")).toBe(false);
    expect(isDtGobClEmail("@dt.gob.cl")).toBe(false);
    expect(isDtGobClEmail("dt.gob.cl")).toBe(false);
    expect(isDtGobClEmail("a @dt.gob.cl")).toBe(false);
  });
});
