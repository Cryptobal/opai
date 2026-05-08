/**
 * Datos demo para vistas admin de formato (propuesta económica).
 */

export function getMockPresentationPayload() {
  return {
    client: { company_name: "Empresa Demo S.A." },
    quote: { number: "COT-24001", date: new Date().toLocaleDateString("es-CL") },
    contact: { email: "contacto@gard.cl", phone: "+56 9 0000 0000" },
    sections: {
      s23_propuesta_economica: {
        pricing: {
          items: [
            {
              description: "Servicio de vigilancia privada — turno día",
              quantity: 720,
              unit_price: 1800,
              subtotal: 1296000,
            },
            {
              description: "Coordinación y supervision",
              quantity: 1,
              unit_price: 320000,
              subtotal: 320000,
            },
          ],
          subtotal: 1616000,
          payment_terms: "Transferencia 30 días",
          adjustment_terms: "IPC anual según política Gard",
          notes: ["Duración inicial 12 meses."],
        },
      },
    },
  };
}
