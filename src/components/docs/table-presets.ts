type Cell = { text: string; token?: string };

function para(text: string, token?: string) {
  return {
    type: "paragraph",
    content: token
      ? [{ type: "contractToken", attrs: { tokenKey: token, label: text, module: "guardia" } }]
      : text
        ? [{ type: "text", text }]
        : [],
  };
}

function row(cells: Cell[], header = false, condition?: { field: string; op: string; value: string }) {
  const type = header ? "tableHeader" : "tableCell";
  return {
    type: "tableRow",
    attrs: condition ? { condition } : {},
    content: cells.map((c) => ({
      type,
      content: [para(c.text, c.token)],
    })),
  };
}

export function remunerationTable() {
  return {
    type: "table",
    content: [
      row([{ text: "Concepto" }, { text: "Monto" }], true),
      row([{ text: "Sueldo base" }, { text: "Sueldo base", token: "guardia.baseSalary" }]),
      row(
        [{ text: "Colación" }, { text: "Colación", token: "guardia.colacion" }],
        false,
        { field: "guardia.colacion", op: ">", value: "0" },
      ),
      row(
        [{ text: "Movilización" }, { text: "Movilización", token: "guardia.movilizacion" }],
        false,
        { field: "guardia.movilizacion", op: ">", value: "0" },
      ),
      row(
        [{ text: "Bonos" }, { text: "Total bonos", token: "guardia.bonosTotal" }],
        false,
        { field: "guardia.bonosTotal", op: ">", value: "0" },
      ),
    ],
  };
}

export function workerDataTable() {
  return {
    type: "table",
    content: [
      row([{ text: "Dato" }, { text: "Valor" }], true),
      row([{ text: "Nombre" }, { text: "Nombre", token: "guardia.fullName" }]),
      row([{ text: "RUT" }, { text: "RUT", token: "guardia.rut" }]),
      row([{ text: "AFP" }, { text: "AFP", token: "guardia.afp" }]),
      row([{ text: "Salud" }, { text: "Salud", token: "guardia.healthSystem" }]),
      row([{ text: "Contrato" }, { text: "Tipo contrato", token: "guardia.contractType" }]),
    ],
  };
}

export function eppTable() {
  return {
    type: "table",
    content: [
      row([{ text: "EPP" }, { text: "Talla" }, { text: "Cantidad" }], true),
      row([{ text: "Casco" }, { text: "" }, { text: "1" }]),
      row([{ text: "Zapatos de seguridad" }, { text: "" }, { text: "1" }]),
      row([{ text: "Chaleco reflectante" }, { text: "" }, { text: "1" }]),
    ],
  };
}

export function blankTable() {
  return {
    type: "table",
    content: [
      row([{ text: "" }, { text: "" }, { text: "" }], true),
      row([{ text: "" }, { text: "" }, { text: "" }]),
      row([{ text: "" }, { text: "" }, { text: "" }]),
    ],
  };
}
