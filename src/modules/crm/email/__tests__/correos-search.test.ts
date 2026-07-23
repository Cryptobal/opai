import { describe, expect, it } from "vitest";
import {
  buildCorreoSearchConditions,
  buildCorreoSearchIdsQuery,
  escapeLikePattern,
  folderWhereSql,
  parseCorreoSearchQuery,
} from "../correos-search";

describe("parseCorreoSearchQuery", () => {
  it("query vacío o solo espacios → null (sin búsqueda activa)", () => {
    expect(parseCorreoSearchQuery("")).toBeNull();
    expect(parseCorreoSearchQuery("   ")).toBeNull();
    expect(parseCorreoSearchQuery(null)).toBeNull();
    expect(parseCorreoSearchQuery(undefined)).toBeNull();
  });

  it("texto libre simple y múltiple (AND)", () => {
    expect(parseCorreoSearchQuery("cotización")?.terms).toEqual(["cotización"]);
    expect(parseCorreoSearchQuery("cotización guardias")?.terms).toEqual([
      "cotización",
      "guardias",
    ]);
  });

  it("frases entre comillas se conservan con espacios", () => {
    expect(parseCorreoSearchQuery('"orden de compra"')?.terms).toEqual([
      "orden de compra",
    ]);
  });

  it("from:/to:/domain: normalizan a lowercase", () => {
    const parsed = parseCorreoSearchQuery("from:Bob@Acme.com to:MARIA domain:Acme.COM");
    expect(parsed?.from).toEqual(["bob@acme.com"]);
    expect(parsed?.to).toEqual(["maria"]);
    expect(parsed?.domains).toEqual(["acme.com"]);
  });

  it("domain: tolera @ inicial", () => {
    expect(parseCorreoSearchQuery("domain:@acme.com")?.domains).toEqual(["acme.com"]);
  });

  it("operadores con valor entre comillas (from:\"bob jones\")", () => {
    expect(parseCorreoSearchQuery('from:"bob jones"')?.from).toEqual(["bob jones"]);
  });

  it("operadores son case-insensitive", () => {
    const parsed = parseCorreoSearchQuery("FROM:bob HAS:ATTACHMENT");
    expect(parsed?.from).toEqual(["bob"]);
    expect(parsed?.hasAttachment).toBe(true);
  });

  it("before:/after: parsean YYYY-MM-DD como UTC", () => {
    const parsed = parseCorreoSearchQuery("before:2026-07-01 after:2026-06-01");
    expect(parsed?.before?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(parsed?.after?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("fechas inválidas se ignoran (formato, overflow de calendario)", () => {
    expect(parseCorreoSearchQuery("before:ayer")).toBeNull();
    expect(parseCorreoSearchQuery("before:2026/07/01")).toBeNull();
    expect(parseCorreoSearchQuery("before:2026-02-31")).toBeNull();
    // La fecha inválida no contamina, el resto del query sobrevive.
    const parsed = parseCorreoSearchQuery("before:invalida hola");
    expect(parsed?.before).toBeNull();
    expect(parsed?.terms).toEqual(["hola"]);
  });

  it("has:attachment y alias en español", () => {
    expect(parseCorreoSearchQuery("has:attachment")?.hasAttachment).toBe(true);
    expect(parseCorreoSearchQuery("has:adjunto")?.hasAttachment).toBe(true);
    expect(parseCorreoSearchQuery("has:adjuntos")?.hasAttachment).toBe(true);
  });

  it("has: con valor desconocido se ignora", () => {
    expect(parseCorreoSearchQuery("has:estrella")).toBeNull();
    expect(parseCorreoSearchQuery("has:estrella factura")?.terms).toEqual(["factura"]);
    expect(parseCorreoSearchQuery("has:estrella factura")?.hasAttachment).toBe(false);
  });

  it("operadores sin valor se ignoran", () => {
    expect(parseCorreoSearchQuery("from:")).toBeNull();
    expect(parseCorreoSearchQuery("from: hola")?.terms).toEqual(["hola"]);
  });

  it("tokens con ':' que no son operadores quedan como texto libre", () => {
    expect(parseCorreoSearchQuery("re: proyecto")?.terms).toEqual(["re:", "proyecto"]);
    expect(parseCorreoSearchQuery("http://acme.com")?.terms).toEqual(["http://acme.com"]);
  });

  it("query mixto completo", () => {
    const parsed = parseCorreoSearchQuery(
      'licitación from:bob@acme.com to:maria domain:cliente.cl before:2026-07-01 after:2026-01-15 has:attachment "orden de compra"',
    );
    expect(parsed).toMatchObject({
      terms: ["licitación", "orden de compra"],
      from: ["bob@acme.com"],
      to: ["maria"],
      domains: ["cliente.cl"],
      hasAttachment: true,
    });
    expect(parsed?.before?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(parsed?.after?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("múltiples valores del mismo operador se acumulan", () => {
    const parsed = parseCorreoSearchQuery("from:bob from:maria");
    expect(parsed?.from).toEqual(["bob", "maria"]);
  });
});

describe("escapeLikePattern", () => {
  it("escapa wildcards de LIKE", () => {
    expect(escapeLikePattern("50%_desc\\uento")).toBe("50\\%\\_desc\\\\uento");
    expect(escapeLikePattern("normal")).toBe("normal");
  });
});

describe("buildCorreoSearchConditions", () => {
  const base = {
    terms: [],
    from: [],
    to: [],
    domains: [],
    before: null,
    after: null,
    hasAttachment: false,
  };

  it("texto libre genera condición sobre asunto + remitente + destinatarios + cuerpo", () => {
    const [cond] = buildCorreoSearchConditions({ ...base, terms: ["factura"] });
    expect(cond.sql).toContain("f_unaccent(t.subject)");
    expect(cond.sql).toContain("m.from_email");
    expect(cond.sql).toContain("m.to_emails || m.cc_emails");
    expect(cond.sql).toContain("m.text_body ILIKE");
    expect(cond.values).toContain("%factura%");
  });

  it("cada criterio produce una condición AND independiente", () => {
    const conds = buildCorreoSearchConditions({
      ...base,
      terms: ["a", "b"],
      from: ["bob"],
      hasAttachment: true,
    });
    expect(conds).toHaveLength(4);
  });

  it("from: filtra por remitente con patrón escapado", () => {
    const [cond] = buildCorreoSearchConditions({ ...base, from: ["100%bob"] });
    expect(cond.sql).toContain("LOWER(m.from_email) LIKE");
    expect(cond.values).toContain("%100\\%bob%");
  });

  it("to: incluye To/CC/BCC", () => {
    const [cond] = buildCorreoSearchConditions({ ...base, to: ["maria"] });
    expect(cond.sql).toContain("m.to_emails || m.cc_emails || m.bcc_emails");
    expect(cond.values).toContain("%maria%");
  });

  it("domain: matchea dominio exacto y subdominios, no sufijos sueltos", () => {
    const [cond] = buildCorreoSearchConditions({ ...base, domains: ["acme.com"] });
    expect(cond.sql).toContain("split_part(LOWER(p.email), '@', 2) =");
    expect(cond.sql).toContain("LIKE");
    expect(cond.values).toContain("acme.com");
    expect(cond.values).toContain("%.acme.com");
  });

  it("before es exclusivo y after inclusivo sobre last_message_at", () => {
    const before = new Date("2026-07-01T00:00:00.000Z");
    const after = new Date("2026-06-01T00:00:00.000Z");
    const conds = buildCorreoSearchConditions({ ...base, before, after });
    expect(conds[0].sql).toContain("t.last_message_at <");
    expect(conds[0].values).toContain(before);
    expect(conds[1].sql).toContain("t.last_message_at >=");
    expect(conds[1].values).toContain(after);
  });

  it("has:attachment usa attachment_count del hilo", () => {
    const [cond] = buildCorreoSearchConditions({ ...base, hasAttachment: true });
    expect(cond.sql).toContain("t.attachment_count > 0");
  });
});

describe("folderWhereSql (paridad con folderWhere de Prisma)", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  it("trash solo mira trashed_at", () => {
    expect(folderWhereSql("trash", now).sql).toBe("t.trashed_at IS NOT NULL");
  });

  it("inbox es null-safe con snoozed_until (nunca NOT)", () => {
    const sql = folderWhereSql("inbox", now).sql;
    expect(sql).toContain("t.snoozed_until IS NULL OR t.snoozed_until <=");
    expect(sql).not.toContain("NOT");
    expect(sql).toContain("t.archived_at IS NULL");
    expect(sql).toContain("t.spam_at IS NULL");
  });

  it("all excluye papelera y spam; archived exige archived_at", () => {
    expect(folderWhereSql("all", now).sql).toBe(
      "t.trashed_at IS NULL AND t.spam_at IS NULL",
    );
    expect(folderWhereSql("archived", now).sql).toContain("t.archived_at IS NOT NULL");
  });

  it("snoozed exige snoozed_until futuro", () => {
    const cond = folderWhereSql("snoozed", now);
    expect(cond.sql).toContain("t.snoozed_until >");
    expect(cond.values).toContain(now);
  });

  it("carpetas nuevas: sent/drafts por mensajes, spam/starred por timestamps", () => {
    const sent = folderWhereSql("sent", now).sql;
    expect(sent).toContain("m.direction = 'out'");
    expect(sent).toContain("m.is_draft = false");
    const drafts = folderWhereSql("drafts", now).sql;
    expect(drafts).toContain("m.is_draft = true");
    expect(folderWhereSql("spam", now).sql).toContain("t.spam_at IS NOT NULL");
    expect(folderWhereSql("starred", now).sql).toContain("t.starred_at IS NOT NULL");
  });
});

describe("buildCorreoSearchIdsQuery", () => {
  const parsed = parseCorreoSearchQuery("factura from:bob")!;

  it("aísla por tenant y casilla, ordena por recencia y pagina", () => {
    const query = buildCorreoSearchIdsQuery({
      tenantId: "t1",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "inbox",
      cursorDate: null,
      take: 31,
    });
    expect(query.sql).toContain("t.tenant_id::text =");
    expect(query.sql).toContain("t.email_account_id =");
    expect(query.sql).toContain("ORDER BY t.last_message_at DESC NULLS LAST");
    expect(query.sql).toContain("LIMIT");
    expect(query.values).toContain("t1");
    expect(query.values).toContain(31);
  });

  it("con cursor agrega el filtro de paginación", () => {
    const cursor = new Date("2026-07-01T00:00:00.000Z");
    const query = buildCorreoSearchIdsQuery({
      tenantId: "t1",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "all",
      cursorDate: cursor,
      take: 31,
    });
    expect(query.sql).toContain("t.last_message_at <");
    expect(query.values).toContain(cursor);
  });
});
