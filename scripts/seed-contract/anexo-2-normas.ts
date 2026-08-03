import { p, t, bold, tk, h, hr, ul } from "./helpers";

/** ANEXO 2 — Normas del Puesto (texto PDF Gard v2). */
export const ANEXO_2_NODES = [
  hr(),
  h(1, [bold("ANEXO 2 - NORMAS DEL PUESTO")]),
  p([
    t("Las siguientes son las actividades a controlar del servicio. Cualquier actividad no contemplada en este documento no podrá ser exigida al personal sin acuerdo previo y por escrito entre los coordinadores designados, conforme a la cláusula OCTAVA del contrato."),
  ]),
  h(3, [bold("CONTROL DE ACCESO")]),
  ul([
    "Efectuar un control y registro de acceso de personas y vehículos que ingresen a las instalaciones de la empresa o del establecimiento.",
    "Solicitar a toda persona que no sea de la empresa la debida identificación mediante su cédula de identidad y entregar su credencial de visita.",
    "Recibir todas las visitas, clientes y proveedores que necesiten relacionarse con algún funcionario de la empresa, con trato cortés y amable.",
    "Su enlace de comunicación para informar de la visita es el anexo telefónico de la persona que debe recibir la visita.",
    "Solicitar a toda persona ajena a la empresa la cédula de identidad, anotando todos los datos en el libro de novedades.",
    "Una vez aprobado el ingreso, registrar nombre de la visita, persona con quien se entrevista, hora de entrada y salida.",
    "No permitir el ingreso de personas en estado de ebriedad, bajo influencia de drogas o que se nieguen a identificarse.",
  ]),
  h(3, [bold("RONDAS")]),
  ul([
    "Efectuar las rondas y controles con la frecuencia que se haya acordado.",
    "Subsanar las anomalías que encuentre en su recorrido: luces encendidas innecesariamente, grifos o llaves de agua abiertas, puertas, portones o rejas abiertas o cerradas indebidamente, según corresponda.",
    "Al cumplir su jornada de trabajo, realizar una revisión completa de las instalaciones o dependencias, informando inmediatamente a su superior jerárquico cualquier observación que detecte y dejando la debida constancia en el libro de novedades.",
  ]),
  h(3, [bold("ASEO E HIGIENE")]),
  ul([
    "Preocuparse personalmente de que el sector de garita permanezca aseado.",
    "El aseo de las demás dependencias del cliente no forma parte de las funciones del personal de seguridad.",
  ]),
  h(3, [bold("PROTOCOLO DE INCIDENTES Y REPORTERÍA")]),
  ul([
    "Reportarse diariamente al inicio y término de sus turnos con el supervisor de operaciones y/o el asistente de operaciones, quienes llevarán un control diario de cada pauta de servicio por instalación o por cliente.",
    "Llevar un libro de novedades en el que se deberá dejar constancia de todas las novedades que se produzcan.",
    "Detectar y alertar a sus supervisores o a la empresa sobre cualquier actividad inusual y dar aviso a Carabineros (133) o Bomberos (132), según el caso.",
    "Llevar un registro de las llamadas telefónicas de urgencia, anotando la hora de recepción, persona que llama, motivo y con quién se quiere comunicar, informando del mensaje a la persona involucrada en la primera oportunidad que se presente.",
    "Queda estrictamente prohibido utilizar el teléfono para asuntos particulares, participar en concursos, fonoservicios u otros que no tengan relación directa con la función que desempeña.",
  ]),
  h(3, [bold("LIMITACIONES DEL SERVICIO")]),
  p([
    t("El personal de seguridad solo ejecutará las funciones contempladas en estas Normas del Puesto. La empresa de seguridad no se hace responsable por la ejecución de tareas no incluidas en este documento ni por las consecuencias derivadas de su ejecución bajo instrucción directa del cliente sin coordinación previa con el supervisor, conforme a la cláusula OCTAVA del contrato."),
  ]),
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
