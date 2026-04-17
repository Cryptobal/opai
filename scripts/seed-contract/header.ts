import { p, t, bold, tk, h } from "./helpers";

export const HEADER_NODES = [
  h(1, [bold("CONTRATO DE PRESTACIÓN DE SERVICIOS DE SEGURIDAD Y VIGILANCIA PRIVADA")]),
  p([
    t("En "), tk("empresa.comuna"),
    t(", a "), tk("system.todayLong"),
    t(", entre "), bold("LA EMPRESA DE SEGURIDAD: "),
    tk("empresa.razonSocial"),
    t(", RUT "), tk("empresa.rut"),
    t(", representada legalmente por don(a) "), tk("empresa.repLegalNombre"),
    t(", RUT "), tk("empresa.repLegalRut"),
    t(", ambos con domicilio en "), tk("empresa.direccion"),
    t(", comuna de "), tk("empresa.comuna"),
    t(', en adelante "LA EMPRESA"; y por la otra, '),
    bold("EL CLIENTE: "), tk("account.legalName"),
    t(", RUT "), tk("account.rut"),
    t(", representada legalmente por don(a) "), tk("account.legalRepresentativeName"),
    t(", RUT "), tk("account.legalRepresentativeRut"),
    t(", ambos con domicilio en "), tk("account.address"),
    t(", comuna de "), tk("account.commune"),
    t(', en adelante "EL CLIENTE", se ha convenido el siguiente contrato de prestación de servicios de seguridad y vigilancia privada:'),
  ]),
];
