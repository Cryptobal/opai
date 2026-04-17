import { p, t, bold, tk, hr } from "./helpers";

export const FOOTER_NODES = [
  hr(),
  p([bold("Por LA EMPRESA: "), tk("empresa.razonSocial")]),
  p([t("Representante Legal: "), tk("empresa.repLegalNombre")]),
  p([t("RUT: "), tk("empresa.repLegalRut")]),
  p([tk("signature.signer_1")]),
  hr(),
  p([bold("Por EL CLIENTE: "), tk("account.legalName")]),
  p([t("Representante Legal: "), tk("account.legalRepresentativeName")]),
  p([t("RUT: "), tk("account.legalRepresentativeRut")]),
  p([tk("signature.signer_2")]),
];
