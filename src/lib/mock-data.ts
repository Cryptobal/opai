/**
 * Mock Data para testing de presentaciones
 * Payload completo de ejemplo con datos ficticios pero realistas
 */

import { PresentationPayload } from '@/types/presentation';

export function getMockPresentationPayload(): PresentationPayload {
  return {
    // Metadatos
    id: 'demo-polpaico-2026-02',
    template_id: 'commercial-v1',
    theme: 'executive',
    created_at: '2026-02-04T10:00:00Z',
    updated_at: '2026-02-04T10:00:00Z',
    
    // Datos del cliente
    client: {
      company_name: 'Polpaico S.A.',
      contact_name: 'Roberto González Martínez',
      contact_first_name: 'Roberto',
      contact_last_name: 'González',
      contact_title: 'Gerente de Operaciones',
      contact_department: 'Operaciones',
      contact_email: 'rgonzalez@polpaico.cl',
      contact_phone: '+56 2 2345 6789',
      contact_mobile: '+56 9 8765 4321',
      phone: '+56 2 2345 6789',
      website: 'www.polpaico.cl',
      industry: 'Manufactura - Cemento',
      rut: '76.123.456-7',
      giro: 'Fabricación de cemento y productos de hormigón',
      address: 'Camino a Noviciado 1234',
      city: 'Til Til',
      state: 'Región Metropolitana',
      zip: '9370000',
    },
    
    // Cotización
    quote: {
      number: 'COT-2026-00342',
      date: '2026-02-04',
      valid_until: '2026-03-06',
      created_date: '2026-02-04',
      subject: 'Propuesta de Servicio de Seguridad Integral',
      description: 'Hemos diseñado esta propuesta específicamente para Polpaico considerando la naturaleza crítica de sus operaciones de manufactura de cemento, donde la continuidad operacional 24/7 no es negociable. Su planta en Til Til requiere no solo presencia física de guardias, sino un sistema completo de supervisión, trazabilidad y reportabilidad que garantice control total sobre la seguridad de sus activos, personal y procesos productivos. A diferencia de otros proveedores, entendemos que en su industria, un incidente de seguridad puede significar detención de producción, pérdida de inventario crítico y exposición legal significativa.',
      subtotal: 5300000,
      tax: 1007000,
      total: 6307000,
      currency: 'CLP',
    },
    
    // Servicio
    service: {
      scope_summary: 'Servicio integral de seguridad con guardias 24/7, supervisión permanente y control de acceso para planta industrial.',
      sites: [
        {
          name: 'Planta Principal Til Til',
          address: 'Camino a Noviciado 1234, Til Til',
          comuna: 'Til Til',
          industry_type: 'Industrial - Cemento',
        },
      ],
      positions: [
        {
          title: 'Guardia de Seguridad 24/7',
          schedule: '24 horas',
          shift_type: '6x1',
          quantity: 4,
        },
        {
          title: 'Supervisor de Seguridad',
          schedule: 'Lun-Vie 08:00-18:00',
          shift_type: '5x2',
          quantity: 1,
        },
      ],
      coverage_hours: '24/7/365',
      start_date: '2026-03-01',
    },
    
    // Assets
    assets: {
      logo: '/Logo Gard Blanco.png',
      guard_photos: [
        '/guardia_hero.jpg',
        '/guardia_entrada.jpg',
        '/guardia_recepcion.jpg',
        '/guardia_conserje.jpeg',
        '/guardia_caseta.jpeg',
        '/guardia_cims.jpg',
        '/guardia_cims_1.jpg',
        '/guardia_conserje_1.jpeg',
      ],
      client_logos: [
        '/clientes_Polpaico.png',
        '/clientes_International Paper.png',
        '/clientes_Tritec.webp',
        '/clientes_Sparta.webp',
        '/clientes_Tattersall.png',
        '/clientes_Transmat.webp',
        '/clientes_Zerando.webp',
        '/clientes_bbosch.webp',
        '/clientes_Delegacion.png',
        '/clientes_Dhemax.png',
        '/clientes_Embajada Brasil.png',
        '/clientes_Emecar.jpg',
        '/clientes_Forestal Santa Blanca.png',
        '/clientes_GL Events.png',
        '/clientes_Newtree.png',
        '/clientes_eCars.png',
      ],
      hero_image: '/hero_guardias.webp',
      os10_qr_url: '/QR OS10.png',
    },
    
    // CTA y contacto
    cta: {
      meeting_link: 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1Pw1jeKf---C8bRMp7lqkoSZHhwwqW1kA5QkCjRSvOVGoDda0qVwbzELTHf8vIJCwX4bMkiH0Z',
      whatsapp_link: 'https://wa.me/56982307771',
      phone: '+56 98 230 7771',
      email: 'comercial@gard.cl',
    },
    
    contact: {
      name: 'Equipo Comercial',
      email: 'comercial@gard.cl',
      phone: '+56 98 230 7771',
      position: 'Gerente Comercial',
    },
    
    // Secciones S01-S29
    sections: {
      // S01 - Hero
      s01_hero: {
        headline: 'Seguridad privada diseñada para continuidad operacional',
        subheadline: 'Guardias profesionales + supervisión activa + control en tiempo real',
        microcopy: 'Protegemos personas, activos y procesos críticos en entornos empresariales exigentes.',
        personalization: 'Propuesta para [ACCOUNT_NAME] — [QUOTE_NUMBER]',
        cta_primary_text: 'Agendar visita técnica sin costo',
        cta_secondary_text: 'Solicitar propuesta directa',
        background_image: '/guardia_hero.jpg',
        kpi_overlay: {
          value: '99,5%',
          label: 'Cobertura de turnos',
        },
      },
      
      // S02 - Executive Summary
      s02_executive_summary: {
        commitment_title: 'Nuestro compromiso: transparencia total',
        commitment_text: 'Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.',
        differentiators: [
          'Supervisión activa en terreno (no solo desde oficina)',
          'Reportabilidad ejecutiva en tiempo real',
          'Control de rondas verificable (NFC/QR)',
          'Cumplimiento laboral garantizado (OS-10 vigente)',
        ],
        traditional_model_reality: [
          'Control inexistente de lo que hace el guardia',
          'Reportes inexistentes o tardíos',
          'Trazabilidad inexistente',
          'Descubrimiento de fallas solo después del incidente',
        ],
        impact_metrics: [
          { value: '67%', label: 'Reducción de incidentes' },
          { value: '96%', label: 'Cumplimiento de rondas' },
          { value: '100%', label: 'Eventos documentados' },
          { value: '24h', label: 'Respuesta a consultas' },
        ],
      },
      
      // S03 - Transparencia
      s03_transparencia: {
        main_phrase: 'Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.',
        protocol_steps: {
          detection: 'Inmediato',
          report: '≤ 15 minutos',
          action: '≤ 2 horas',
        },
        kpis: [
          { value: '67%', label: 'Menos incidentes' },
          { value: '96%', label: 'Rondas cumplidas' },
          { value: '100%', label: 'Eventos documentados' },
        ],
      },
      
      // S04 - El Riesgo Real
      s04_riesgo: {
        headline: 'El verdadero riesgo no es la ausencia de seguridad. Es la falsa sensación de control.',
        symptoms: [
          {
            icon: 'AlertTriangle',
            title: 'Control inexistente',
            description: 'No sabe qué hace el guardia minuto a minuto',
          },
          {
            icon: 'FileText',
            title: 'Reportes inexistentes',
            description: 'Informes tardíos o nulos sobre novedades',
          },
          {
            icon: 'Shield',
            title: 'Trazabilidad inexistente',
            description: 'Sin evidencia de rondas ni supervisiones',
          },
        ],
        statistic: '73% de las empresas descubre fallas solo después de un incidente grave.',
      },
      
      // S05 - Fallas del Modelo Tradicional
      s05_fallas_modelo: {
        table_rows: [
          {
            characteristic: 'Sin supervisión en terreno',
            operational_consequence: 'Guardias sin control real',
            financial_impact: 'Riesgo no mitigado',
          },
          {
            characteristic: 'Reportes manuales tardíos',
            operational_consequence: 'Decisiones con información obsoleta',
            financial_impact: 'Incidentes no prevenidos',
          },
          {
            characteristic: 'Sin trazabilidad de rondas',
            operational_consequence: 'No hay evidencia de cobertura',
            financial_impact: 'Exposición legal',
          },
        ],
      },
      
      // S06 - Costo Real
      s06_costo_real: {
        cost_cards: [
          {
            title: 'Robo interno',
            description: 'Pérdidas no detectadas',
            estimated_impact: '$5-15M anuales',
          },
          {
            title: 'Demanda laboral',
            description: 'Incumplimiento normativo',
            estimated_impact: '$20-50M por caso',
          },
          {
            title: 'Horas gerenciales',
            description: 'Gestión de crisis evitables',
            estimated_impact: '$3-8M anuales',
          },
        ],
        conclusion_note: 'Una inversión mensual controlada vs. un costo impredecible',
      },
      
      // S07 - Sistema de Capas
      s07_sistema_capas: {
        intro_text: 'No vendemos guardias. Implementamos un sistema de seguridad gestionado.',
        layers: [
          { level: 1, name: 'Guardia', description: 'Presencia física profesional' },
          { level: 2, name: 'Supervisión', description: 'Verificación activa en terreno' },
          { level: 3, name: 'Control', description: 'Trazabilidad digital (rondas NFC/QR)' },
          { level: 4, name: 'Reportabilidad', description: 'Informes automáticos en tiempo real' },
          { level: 5, name: 'Gestión', description: 'Análisis y mejora continua' },
        ],
      },
      
      // S08 - 4 Pilares
      s08_4_pilares: {
        pillar1: {
          title: 'Personal profesional',
          description: 'Selección rigurosa y capacitación continua',
          details: ['100→12 funnel de selección', 'Evaluación psicológica', 'Verificación de antecedentes'],
        },
        pillar2: {
          title: 'Supervisión permanente',
          description: 'Control activo 24/7 en terreno',
          details: ['Mínimo 2 supervisiones por turno', 'Máximo 4h sin verificación', 'Rondas aleatorias'],
        },
        pillar3: {
          title: 'Control y trazabilidad',
          description: 'Tecnología para verificar cumplimiento',
          details: ['Rondas NFC/QR', 'Registro fotográfico + GPS', 'Reportes automáticos'],
        },
        pillar4: {
          title: 'Gestión orientada a resultados',
          description: 'KPIs medibles y revisión mensual',
          details: ['Dashboard ejecutivo', 'Reuniones de gestión', 'Mejora continua'],
        },
      },
      
      // S09 - Cómo Operamos
      s09_como_operamos: {
        stages: [
          {
            step: 1,
            title: 'Diagnóstico',
            description: 'Visita técnica y levantamiento de necesidades',
            deliverable: 'Informe de evaluación de riesgos',
          },
          {
            step: 2,
            title: 'Diseño',
            description: 'Propuesta de dotación, turnos y protocolos',
            deliverable: 'Plan de servicio personalizado',
          },
          {
            step: 3,
            title: 'Asignación',
            description: 'Selección y capacitación del personal',
            deliverable: 'Equipo asignado y capacitado',
          },
          {
            step: 4,
            title: 'Supervisión',
            description: 'Verificación activa y control en terreno',
            deliverable: 'Reportes de supervisión',
          },
          {
            step: 5,
            title: 'Registro',
            description: 'Trazabilidad digital de rondas y eventos',
            deliverable: 'Evidencia fotográfica + GPS',
          },
          {
            step: 6,
            title: 'Reportes',
            description: 'Información ejecutiva automática',
            deliverable: 'Dashboard + informes periódicos',
          },
          {
            step: 7,
            title: 'Mejora continua',
            description: 'Análisis de KPIs y ajustes',
            deliverable: 'Plan de optimización',
          },
        ],
      },
      
      // S10 - Supervisión
      s10_supervision: {
        levels: [
          {
            level: 1,
            name: 'Autocontrol',
            description: 'Registro digital de rondas',
            frequency: 'Según protocolo',
          },
          {
            level: 2,
            name: 'Supervisor en terreno',
            description: 'Verificación presencial',
            frequency: 'Mínimo 2 veces por turno',
          },
          {
            level: 3,
            name: 'Coordinador de zona',
            description: 'Rondas aleatorias',
            frequency: 'Semanal',
          },
          {
            level: 4,
            name: 'Gestión ejecutiva',
            description: 'Reuniones con cliente',
            frequency: 'Mensual',
          },
        ],
        night_shift_timeline: [
          { time: '20:00', activity: 'Inicio de turno + briefing' },
          { time: '22:00', activity: 'Primera supervisión en terreno' },
          { time: '02:00', activity: 'Segunda supervisión en terreno' },
          { time: '06:00', activity: 'Tercera supervisión + reporte' },
          { time: '08:00', activity: 'Cambio de turno + handover' },
        ],
        sla: [
          'Máximo 4 horas sin verificación',
          'Mínimo 2 supervisiones por turno',
          'Respuesta a incidentes < 15 minutos',
          'Cobertura de turnos 99,5%',
        ],
      },
      
      // S11 - Reportabilidad
      s11_reportabilidad: {
        daily: {
          title: 'Reporte Diario',
          items: ['Novedades del turno', 'Incidentes registrados', 'Rondas completadas', 'Personal en servicio'],
        },
        weekly: {
          title: 'Reporte Semanal',
          items: ['Tendencias de incidentes', 'KPIs operativos', 'Observaciones de supervisión', 'Recomendaciones'],
        },
        monthly: {
          title: 'Dashboard Ejecutivo Mensual',
          items: ['Análisis de resultados', 'Cumplimiento de SLAs', 'Estadísticas comparativas', 'Plan de mejora'],
        },
      },
      
      // S12 - Cumplimiento
      s12_cumplimiento: {
        intro_text: 'Tranquilidad operativa, legal y financiera',
        risks: [
          'Multas DT por incumplimiento laboral',
          'Demandas de trabajadores',
          'Cierre de operaciones',
          'Daño reputacional',
        ],
        guarantees: [
          'OS-10 vigente y verificable',
          'Contratos al día',
          'Imposiciones pagadas',
          'Seguros vigentes',
          'Documentación disponible en 24h',
        ],
        commitment_time: 'Documentación disponible en menos de 24 horas',
      },
      
      // S13 - Certificaciones
      s13_certificaciones: {
        os10_qr: '/QR OS10.png',
        ley_karin_info: 'Canal de denuncias activo según Ley Karin',
        ethics_code: 'Código de ética y anticorrupción implementado',
        screening_checks: [
          'Verificación de antecedentes penales',
          'Evaluación psicológica',
          'Examen de salud ocupacional',
          'Referencias laborales verificadas',
        ],
      },
      
      // S14 - Tecnología
      s14_tecnologia: {
        tools: [
          {
            name: 'Control de rondas NFC/QR',
            what_is_it: 'Puntos de verificación en sitio',
            purpose: 'Asegurar cobertura real',
            real_benefit: 'Evidencia verificable de recorridos',
          },
          {
            name: 'Registro digital de eventos',
            what_is_it: 'App móvil con foto + GPS + timestamp',
            purpose: 'Documentar incidentes',
            real_benefit: 'Trazabilidad legal completa',
          },
          {
            name: 'Reportes automáticos',
            what_is_it: 'Dashboard web en tiempo real',
            purpose: 'Información ejecutiva',
            real_benefit: 'Decisiones basadas en datos',
          },
        ],
        note: 'No obligamos a comprar tecnología adicional. Sistema incluido en el servicio.',
      },
      
      // S15 - Selección de Personal
      s15_seleccion: {
        funnel: [
          { stage: 'Postulantes', quantity: 100 },
          { stage: 'Preselección curricular', quantity: 40 },
          { stage: 'Evaluación psicológica', quantity: 25 },
          { stage: 'Verificación antecedentes', quantity: 18 },
          { stage: 'Entrevistas finales', quantity: 12 },
        ],
        criteria_table: [
          { criterion: 'Perfil psicológico', description: 'Estabilidad, responsabilidad, autocontrol' },
          { criterion: 'Experiencia real', description: 'Mínimo 1 año en seguridad privada' },
          { criterion: 'Adaptación', description: 'Capacidad para turnos nocturnos y condiciones exigentes' },
          { criterion: 'Disciplina', description: 'Cumplimiento de protocolos' },
          { criterion: 'Salud', description: 'Examen ocupacional aprobado' },
        ],
        retention_rate: '85% vs industria 50-60%',
      },
      
      // S16 - Nuestra Gente
      s16_nuestra_gente: {
        message: 'Guardias comprometidos, entrenados y supervisados',
        photos: [
          '/guardia_hero.jpg',
          '/guardia_entrada.jpg',
          '/guardia_recepcion.jpg',
          '/guardia_conserje.jpeg',
          '/guardia_caseta.jpeg',
          '/guardia_cims.jpg',
          '/guardia_cims_1.jpg',
          '/guardia_conserje_1.jpeg',
        ],
        values: [
          { title: 'Profesionalismo', description: 'Capacitación continua y certificaciones' },
          { title: 'Compromiso', description: 'Identificación con el cliente' },
          { title: 'Integridad', description: 'Ética y transparencia' },
          { title: 'Responsabilidad', description: 'Cumplimiento de protocolos' },
          { title: 'Adaptabilidad', description: 'Flexibilidad ante contingencias' },
        ],
      },
      
      // S17 - Continuidad del Servicio
      s17_continuidad: {
        scenarios: [
          {
            title: 'Ausencia programada',
            description: 'Vacaciones, permisos legales',
            response_time: 'Reemplazo coordinado con 48h de anticipación',
          },
          {
            title: 'Ausencia imprevista',
            description: 'Licencia médica, emergencia',
            response_time: 'Cobertura en máximo 2 horas',
          },
          {
            title: 'Contingencia mayor',
            description: 'Renuncia masiva, huelga',
            response_time: 'Plan de contingencia activado inmediatamente',
          },
          {
            title: 'Aumento de demanda',
            description: 'Picos de operación, eventos',
            response_time: 'Refuerzo disponible con 24h de aviso',
          },
        ],
        sla_coverage: 'Cobertura garantizada en máximo 2 horas',
        kpi_compliance: '99,5% de cumplimiento de turnos',
      },
      
      // S18 - KPIs
      s18_kpis: {
        indicators: [
          {
            name: 'Cumplimiento de rondas',
            description: '% de rondas ejecutadas vs programadas',
            target: '≥95%',
            measurement_frequency: 'Diario',
          },
          {
            name: 'Cobertura de turnos',
            description: '% de turnos cubiertos sin retrasos',
            target: '≥99%',
            measurement_frequency: 'Diario',
          },
          {
            name: 'Tiempo de respuesta',
            description: 'Minutos entre incidente y reporte',
            target: '≤15 min',
            measurement_frequency: 'Por incidente',
          },
          {
            name: 'Incidentes documentados',
            description: '% de eventos con registro fotográfico',
            target: '100%',
            measurement_frequency: 'Por incidente',
          },
          {
            name: 'Satisfacción del cliente',
            description: 'Evaluación mensual',
            target: '≥4.5/5',
            measurement_frequency: 'Mensual',
          },
          {
            name: 'Permanencia del personal',
            description: '% de guardias que permanecen >12 meses',
            target: '≥85%',
            measurement_frequency: 'Anual',
          },
        ],
        review_note: 'Revisión mensual con el cliente en reunión de gestión',
      },
      
      // S19 - Resultados con Clientes
      s19_resultados: {
        case_studies: [
          {
            sector: 'Logística',
            sites: 3,
            staffing: '12 guardias + 2 supervisores',
            duration: '4 años',
            metrics: [
              { value: '78%', label: 'Reducción incidentes' },
              { value: '98%', label: 'Cumplimiento rondas' },
              { value: '100%', label: 'Eventos documentados' },
              { value: '4.8/5', label: 'Satisfacción' },
            ],
            quote: 'La trazabilidad nos permite tomar decisiones con información real.',
          },
          {
            sector: 'Manufactura',
            sites: 2,
            staffing: '8 guardias + 1 supervisor',
            duration: '3 años',
            metrics: [
              { value: '65%', label: 'Menos pérdidas' },
              { value: '100%', label: 'OS-10 vigente' },
              { value: '24h', label: 'Respuesta consultas' },
              { value: '4.6/5', label: 'Satisfacción' },
            ],
            quote: 'Dejamos de preocuparnos por temas legales y nos enfocamos en producir.',
          },
          {
            sector: 'Retail',
            sites: 5,
            staffing: '20 guardias + 3 supervisores',
            duration: '2 años',
            metrics: [
              { value: '82%', label: 'Menos hurtos' },
              { value: '99%', label: 'Cobertura turnos' },
              { value: '15min', label: 'Tiempo respuesta' },
              { value: '4.7/5', label: 'Satisfacción' },
            ],
            quote: 'La supervisión activa hizo la diferencia. Ahora sabemos que están trabajando.',
          },
          {
            sector: 'Construcción',
            sites: 4,
            staffing: '16 guardias + 2 supervisores',
            duration: '18 meses',
            metrics: [
              { value: '71%', label: 'Menos robos material' },
              { value: '97%', label: 'Cumplimiento rondas' },
              { value: '100%', label: 'Documentación completa' },
              { value: '4.5/5', label: 'Satisfacción' },
            ],
            quote: 'El control de materiales y acceso mejoró radicalmente nuestra operación.',
          },
        ],
      },
      
      // S20 - Clientes
        s20_clientes: {
        client_logos: [
          '/clientes_Polpaico.png',
          '/clientes_International Paper.png',
          '/clientes_Tritec.webp',
          '/clientes_Sparta.webp',
          '/clientes_Tattersall.png',
          '/clientes_Transmat.webp',
          '/clientes_Zerando.webp',
          '/clientes_bbosch.webp',
          '/clientes_Delegacion.png',
          '/clientes_Dhemax.png',
          '/clientes_Embajada Brasil.png',
          '/clientes_Forestal Santa Blanca.png',
          '/clientes_GL Events.png',
          '/clientes_Newtree.png',
          '/clientes_eCars.png',
        ],
        confidentiality_note: 'Algunos clientes no autorizan uso de su marca por políticas de confidencialidad.',
      },
      
      // S21 - Sectores
      s21_sectores: {
        industries: [
          {
            name: 'Logística y Bodegas',
            typical_needs: ['Control de acceso', 'Prevención de robos', 'Supervisión de carga/descarga'],
          },
          {
            name: 'Manufactura e Industria',
            typical_needs: ['Seguridad perimetral', 'Control de contratistas', 'Prevención de accidentes'],
          },
          {
            name: 'Retail y Centros Comerciales',
            typical_needs: ['Atención al público', 'Prevención de hurtos', 'Emergencias'],
          },
          {
            name: 'Construcción e Inmobiliaria',
            typical_needs: ['Protección de materiales', 'Control de acceso', 'Vigilancia nocturna'],
          },
          {
            name: 'Salud y Clínicas',
            typical_needs: ['Control de visitas', 'Emergencias médicas', 'Seguridad de pacientes'],
          },
          {
            name: 'Educación',
            typical_needs: ['Seguridad escolar', 'Control de acceso', 'Eventos especiales'],
          },
        ],
      },
      
      // S22 - TCO
      s22_tco: {
        comparison_columns: {
          low_cost_high_risk: {
            monthly_rate: 4500000,
            annual_rate: 54000000,
            hidden_costs: 15000000,
            total_real: 69000000,
          },
          controlled_cost_low_risk: {
            monthly_rate: 6300000,
            annual_rate: 75600000,
            hidden_costs: 500000,
            total_real: 76100000,
          },
        },
        message: 'La pregunta correcta no es "cuánto cuesta", sino "cuánto me cuesta NO tenerlo".',
        currency: 'CLP',
      },
      
      // S23 - Propuesta Económica
      s23_propuesta_economica: {
        pricing: {
          items: [
            {
              name: 'Puesto de Seguridad (PSEG)',
              description: 'Puestos simultáneos: 7 (lunes a domingo, continuidad 24/7) Rol/turno: 4x4, 12 horas – Dotación requerida: 14 guardias Distribución por acceso: Portería Av. San Luis – Día: 2 puestos / Noche: 1 puesto Portería Av. La Montaña Sur 4149 – Día: 3 puestos / Noche: 1 puesto Servicio: Control de accesos vehicular y peatonal 24/7, registro y validación de visitas, coordinación con Smartki y aplicación de protocolos residenciales. Valor diferenciador: Continuidad operativa asegurada, supervisión en terreno y respaldo para reemplazos y contingencias, manteniendo estándar y trazabilidad del control de acceso.',
              quantity: 1,
              unit_price: 100,
              subtotal: 100,
              currency: 'UF',
            },
            {
              name: 'Puesto de Seguridad (PSEG)',
              description: 'Servicio de guardia de seguridad 12 horas por turno, personal capacitado OS10.',
              quantity: 1,
              unit_price: 50,
              subtotal: 50,
              currency: 'UF',
            },
          ],
          subtotal: 5300000,
          tax: 1007000,
          total: 6307000,
          currency: 'CLP',
          payment_terms: 'Mensual, contraentrega de factura',
          adjustment_terms: 'Reajuste anual: 70% IPC + 30% IMO',
          billing_frequency: 'monthly',
          notes: [
            'Valor mensual en pesos chilenos',
            'Incluye seguros y cumplimiento legal',
            'Mínimo 12 meses de contrato',
            'Equipamiento incluido (radios, linternas)',
          ],
        },
      },
      
      // S24 - Términos y Condiciones
      s24_terminos_condiciones: {
        client_must_provide: [
          'Caseta o espacio físico para guardia',
          'Acceso a agua potable y baños',
          'Lockers o espacio para guardar pertenencias',
          'Iluminación adecuada',
        ],
        service_includes: [
          'Celulares corporativos',
          'Radios y linternas',
          'Uniformes y credenciales',
          'Reportes digitales',
          'Supervisión 24/7',
          'Control remoto de rondas',
          'Seguros y cumplimiento legal',
        ],
      },
      
      // S25 - Comparación Competitiva
      s25_comparacion: {
        comparison_table: [
          { criterion: 'Supervisión en terreno', market: 'Ocasional', gard: 'Permanente', highlight: true },
          { criterion: 'Reportes en tiempo real', market: false, gard: true },
          { criterion: 'Control de rondas verificable', market: false, gard: true, highlight: true },
          { criterion: 'Respuesta a incidentes', market: '> 1 hora', gard: '< 15 min' },
          { criterion: 'Reemplazo por ausencias', market: '> 4 horas', gard: '< 2 horas' },
          { criterion: 'Documentación laboral', market: 'Bajo demanda', gard: '< 24 horas' },
          { criterion: 'Dashboard ejecutivo', market: false, gard: true },
          { criterion: 'Reuniones de gestión', market: false, gard: 'Mensuales' },
          { criterion: 'Capacitación continua', market: false, gard: true },
          { criterion: 'Canal de denuncias', market: false, gard: 'Ley Karin' },
          { criterion: 'Tiempo de implementación', market: '> 4 semanas', gard: '≤ 15 días' },
          { criterion: 'Plan de contingencia', market: false, gard: true, highlight: true },
        ],
      },
      
      // S26 - Por Qué Nos Eligen
      s26_porque_eligen: {
        reasons: [
          'Modelo estructurado (no improvisamos)',
          'Supervisión real (no solo promesas)',
          'Reportes útiles (no burocracia)',
          'Cumplimiento garantizado (tranquilidad legal)',
          'Gestión proactiva (no reactiva)',
          'Resultados medibles (KPIs claros)',
        ],
        renewal_rate: '94% de nuestros clientes renueva contrato',
      },
      
      // S27 - Implementación
      s27_implementacion: {
        phases: [
          {
            week: 1,
            title: 'Visita técnica + diagnóstico',
            description: 'Levantamiento de necesidades y riesgos',
            client_requirements: ['Acceso a instalaciones', 'Contacto operacional'],
            deliverables: ['Informe de evaluación', 'Propuesta de dotación'],
          },
          {
            week: 2,
            title: 'Propuesta + contrato',
            description: 'Aprobación comercial y firma',
            client_requirements: ['Revisión de propuesta', 'Firma de contrato'],
            deliverables: ['Contrato firmado', 'Plan de implementación'],
          },
          {
            week: 3,
            title: 'Reclutamiento + implementación',
            description: 'Selección y capacitación del personal',
            client_requirements: ['Coordinación de inducción'],
            deliverables: ['Personal asignado', 'Sistemas activos'],
          },
          {
            week: 4,
            title: 'Inicio operación + seguimiento',
            description: 'Go-live con supervisión intensiva',
            client_requirements: ['Feedback inicial'],
            deliverables: ['Servicio activo', 'KPIs baseline'],
          },
        ],
        total_duration: '4 semanas / 15 días hábiles',
      },
      
      // S28 - Cierre + CTA
      s28_cierre: {
        headline: 'Seguridad que se gestiona. No seguridad que se espera.',
        cta_primary: {
          text: 'Agendar visita técnica sin costo',
          link: 'https://calendly.com/gard-security/visita-tecnica',
        },
        cta_secondary: {
          text: 'Solicitar propuesta directa',
          link: 'mailto:comercial@gard.cl',
        },
        microcopy: 'Respuesta en 24 horas hábiles',
      },
      
      // S29 - Contacto (ELIMINADO - solo Footer)
      s29_contacto: {
        email: 'comercial@gard.cl',
        phone: '+56 9 8230 7771',
        website: 'www.gard.cl',
        address: 'Lo Fontecilla 201, Las Condes, Chile',
        social_media: {
          linkedin: 'https://www.linkedin.com/company/gard-security',
          instagram: 'https://www.instagram.com/gardsecuritycl/',
          x: 'https://x.com/gard_cl?lang=es',
        },
      },
    },
  };
}
