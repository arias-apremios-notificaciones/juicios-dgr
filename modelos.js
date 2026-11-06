/*
 * modelos.js — Escritos de la carpeta "MODELOS PARA LA APP" (Drive), sellados por Carlos uno por uno.
 * Archivo puro: lo usan la app (lista, buscador, vista previa) y Apps Script (va dentro de TODO_EN_UNO.gs), y corre en Node para las pruebas.
 * Lo variable sale del juicio (encabezado con la OGA del SAE, carátula, Nº de expediente) y de los datos entre llaves
 * ({DEMANDADO}, {CUIT}, {JUZGADO DE PAZ}, montos y fechas), que se completan en la app. Título y cuerpo se pueden editar antes de generar.
 */
var Modelos = (function () {
  'use strict';

  // Textos del pedido de sentencia sellado (Motor.gs, generarPedidoSentencia_).
  var PEDIDO_SENTENCIA = ['Que atento al estado en que se encuentran las presentes actuaciones, vengo a solicitar que pasen las mismas sin más trámite a dictar sentencia.',
                          'A tal efecto, acompaño constancia de inscripción de ARCA. Téngase presente.'];
  // Comparecencia de los escritos de honorarios (EscritosHon.js, sellada el 30/10/2026).
  var POR_DERECHO_PROPIO = ', abogado, apoderado de la parte actora, por derecho propio a V.S. respetuosamente digo:';
  // COMUNICO ESTADO DE LA DEUDA: el escrito de GALVEZ PALERMO (pago parcial) y la variante sin pagos.
  var ESTADO_DEUDA_PARCIAL = [
    'Vengo a comunicar la imputación de la transferencia efectuada, por lo que la deuda en ejecución se regularizó de manera parcial, conforme surge del IVP N° {IVP N°} que se adjunta, de donde surge que por la Boleta de Deuda {BOLETA DE DEUDA} queda un remanente a cancelar de {SALDO} a la fecha de confección de dicho informe, la que deberá ser actualizada hasta la fecha de su efectivo pago. Asimismo se acompaña Planilla de cálculo.',
    'Por lo expuesto, solicito que se corra traslado a la demandada a los fines del debido control.'];
  var ESTADO_DEUDA_SIN_PAGOS = [
    'Vengo a comunicar el estado actualizado de la deuda en ejecución, conforme surge del IVP N° {IVP N°} que se adjunta, de donde surge que no se registran pagos imputados a la Boleta de Deuda {BOLETA DE DEUDA}, por lo que la deuda se mantiene íntegramente impaga y asciende a la suma de {SALDO} a la fecha de confección de dicho informe, la que deberá ser actualizada hasta la fecha de su efectivo pago. Asimismo se acompaña Planilla de cálculo.',
    'Por lo expuesto, solicito que se corra traslado a la demandada a los fines del debido control.'];
  // COMUNICO CANCELACION. PIDO LEVANTAMIENTO…: el escrito de FRIAR SA; la frase del informe bancario es optativa (pedido de Carlos, 05/11/2026).
  var CANCELACION_CUERPO = [
    'I.- Vengo a poner en conocimiento que la demandada canceló la deuda en ejecución. Acompaño Informe de Verificación de Pagos N° {IVP N°}. Se agregue y se tenga presente.',
    'II.- Encontrándose cancelada la deuda en ejecución, solicito el levantamiento de embargo dispuesto en autos y, en caso de que la entidad bancaria haya retenido fondos, solicito la devolución de fondos a la cuenta origen de la demandada.',
    'A tales efectos, presto la conformidad establecida en el artículo 35 de la Ley 5480. Se tenga presente.'];
  var INFORME_BANCARIO = 'Asimismo, acompaño informe bancario emitido por el Colegio de Abogados de Tucumán. Se agregue y se tenga presente.';
  // OFREZCO PRUEBA (cuadernos de prueba de las excepciones): CUENCA DULCE (A1, documental) y MONTE CASSINO (A2, informativa).
  // El texto de la prueba se copia de la sección PRUEBAS de la contestación de excepciones (Drive o SAE); si no está, va el habitual.
  var PRESENTACION_PRUEBA = ', de las condiciones personales que constan en autos, a V.S. respetuosamente me presento y digo:';
  var DOCUMENTAL_HABITUAL = 'Las constancias de autos, en especial el escrito de demanda, las boletas de deuda -cargos tributarios- que sirven de base a la presente acción y el escrito de contestación de Excepciones.';
  var INFORMATIVA_HABITUAL = 'Solicito se libre oficio a la División Control de Cobros Judiciales de la DGR, a los fines de que por su intermedio remita copia digitalizada del expediente Nº {EXPEDIENTE ADMINISTRATIVO}.';
  var CUADERNOS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
  // Lo copiado de la contestación se acomoda a la redacción de los escritos base ("Las constancias de autos…", "Solicito se libre oficio…").
  function acomodarPrueba(clase, p) {
    p = String(p).replace(/\s+/g, ' ').trim().replace(/^[•\-–]\s*/, '');
    p = p.replace(/[–—]\s*cargos tributarios\s*[-–—]/gi, '-cargos tributarios-');
    if (clase === 'DOCUMENTAL') p = p.replace(/^(?:las\s+)?constancias de autos/i, 'Las constancias de autos');
    else p = p.replace(/^(?:solicito\s+)?(?:que\s+)?se\s+libre(n)?\s+oficio(s)?/i, function (x, n, s) { return 'Solicito se libre' + (n || '') + ' oficio' + (s || ''); })
              .replace(/^(?:librar|libra|oficio)\s+(?:oficio\s+)?(a|al)\b/i, 'Solicito se libre oficio $1');
    if (!/[.:;]$/.test(p)) p += '.';
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  function cuerpoPrueba(clase, parrafos) {
    var documental = clase === 'DOCUMENTAL';
    parrafos = parrafos.map(function (p) { return acomodarPrueba(clase, p); });
    return ['I.- Ofrezco prueba ' + (documental ? 'documental' : 'informativa') + ':'].concat(parrafos,
      ['II.- Petitorio:', 'Por lo expuesto, a V.S. pido:',
       documental ? 'Se tenga por ofrecida en tiempo y forma la prueba y se forme el presente cuaderno.-'
                  : 'Se tenga por ofrecida en tiempo y forma la prueba, se forme el presente cuaderno y se libre oficio.-']);
  }
  // Desplegable del embargo: los bancos que más aparecen en los oficios del SAE y los habituales en Tucumán ("Otro" se escribe a mano).
  var BANCOS = ['BANCO BBVA ARGENTINA S.A.', 'BANCO COMAFI S.A.', 'BANCO CREDICOOP COOPERATIVO LTDO.', 'BANCO DE GALICIA Y BUENOS AIRES S.A.U.',
                'BANCO DE LA NACION ARGENTINA', 'BANCO DEL TUCUMAN S.A.', 'BANCO HIPOTECARIO S.A.', 'BANCO HSBC ARGENTINA S.A.', 'BANCO ICBC ARGENTINA S.A.U.',
                'BANCO INDUSTRIAL S.A.', 'BANCO MACRO S.A.', 'BANCO PATAGONIA S.A.', 'BANCO SANTANDER RIO SA', 'BANCO SUPERVIELLE S.A.'];

  /*
   * Cada modelo: nombre (= título, como se lista), claves (para el buscador), titulo, presentacion, cuerpo, arca,
   * adjunto (lo que Carlos sube y se une detrás del escrito), campos (datos entre llaves), calcular, seguimiento, cierre,
 * requisitos (lo que Carlos confirma en la app antes de generar).
   * Campos: tipo texto | fecha | monto | cuit | anio (4 números) | opciones (desplegable, con "Otro" a mano); auto: demandado | cuit | importe | hoy (se completa solo con el MAESTRO / la fecha de hoy).
   * adjunto.opcional: se puede generar sin subir nada (DOY CUMPLIMIENTO, SE NOTIFIQUE POR EDICTOS); si se sube, se une igual.
   * Solo se piden los datos cuyo {…} sigue en el título o el cuerpo: si Carlos borra el párrafo, no se reclama el dato.
 * variantes: cuerpos alternativos que se eligen en la app (el primero es el del modelo).
   */
  var MODELOS = {
    // ── Sellados el 04/11/2026 ──
    // "S.A. ESTABLECIMIENTOS VITIVINICOLAS ESCORIHUELA (5389-19) I - DEVUELVO CEDULA LEY DILIGENCIADA"
    DEVUELVO_CEDULA_LEY: {
      nombre: 'DEVUELVO CEDULA LEY DILIGENCIADA', claves: 'cedula ley 22172 diligenciada notificacion otra provincia extraña jurisdiccion',
      titulo: 'DEVUELVO CEDULA LEY DILIGENCIADA',
      presentacion: ', apoderado en autos por la parte actora, a V.S. respetuosamente digo:',
      cuerpo: ['Vengo a devolver la Cédula Ley N° 22172 debidamente diligenciada. Se agregue y se tenga presente.'],
      adjunto: { etiqueta: 'Cédula ley diligenciada', archivo: 'CEDULA LEY DILIGENCIADA' }
    },
    // "SOLUCIONES EXPRES SAS (691-21) OGA 1 - DEVUELVO OFICIO"
    DEVUELVO_OFICIO_RI: {
      nombre: 'DEVUELVO OFICIO DILIGENCIADO AL RI', claves: 'oficio registro inmobiliario ri informe inmueble bienes diligenciado',
      titulo: 'DEVUELVO OFICIO DILIGENCIADO AL RI',
      presentacion: ', apoderado de la actora, a V.S. respetuosamente digo:',
      cuerpo: ['Vengo a devolver oficio debidamente diligenciado e informado por la Dirección del Registro Inmobiliario de la Provincia. Se agregue y tenga presente.'],
      adjunto: { etiqueta: 'Informe del Registro Inmobiliario', archivo: 'INFORME REGISTRO INMOBILIARIO' }
    },
    // "AGUIRRE NESTOR DANIEL Y AGUIRRE JOSE LUIS S.H. (790-21) - SE ABRA CUENTA"
    SE_ABRA_CUENTA: {
      nombre: 'SE ABRA CUENTA', claves: 'cuenta judicial banco cbu embargo oficiado',
      titulo: 'SE ABRA CUENTA',
      presentacion: ', apoderado de la parte actora, y por derecho propio a V.S. respetuosamente digo:',
      cuerpo: ['En virtud de lo informado por el Banco oficiado, solicito que se abra la respectiva cuenta judicial y se informe el CBU a la citada entidad bancaria, a los fines de continuar con la ejecución solicitada.']
    },
    // "BERRONDO JOSE OSVALDO (10649-26) - ACOMPAÑO BONO DE MOVILIDAD"
    BONO_MOVILIDAD: {
      nombre: 'ACOMPAÑO BONO DE MOVILIDAD', claves: 'bono movilidad cedula oficial notificador intimacion',
      titulo: 'ACOMPAÑO BONO DE MOVILIDAD',
      presentacion: ', de las condiciones personales que constan en autos, a V.S. respetuosamente digo:',
      cuerpo: ['De conformidad con el decreto que antecede, vengo a acompañar bono de movilidad correspondiente. Se tenga por presentado y se confeccione cédula.'],
      adjunto: { etiqueta: 'Bono de movilidad', archivo: 'BONO DE MOVILIDAD' }
    },
    // "BIO TRINIDAD SOCIEDAD ANONIMA (3492-13) - SOLICITO EXTRACCION DE PARALIZADO"
    EXTRACCION_PARALIZADO: {
      nombre: 'SOLICITO EXTRACCION DE PARALIZADO', claves: 'paralizado archivo extraccion desarchivo reactivar',
      titulo: 'SOLICITO EXTRACCION DE PARALIZADO',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: ['Atento lo informado, solicito que se extraigan las actuaciones de paralizado.']
    },
    // "CENTRO DE SERVICIOS DEL ESTE SRL (13160-26) - SOLICITO SE LIBRE MANDAMIENTO A JUZGADO DE PAZ"
    MANDAMIENTO_JUZGADO_PAZ: {
      nombre: 'SOLICITO SE LIBRE MANDAMIENTO A JUZGADO DE PAZ', claves: 'mandamiento intimacion pago juzgado paz domicilio interior',
      titulo: 'SOLICITO SE LIBRE MANDAMIENTO A JUZGADO DE PAZ',
      presentacion: ', apoderado de la parte actora, a VS respetuosamente digo:',
      cuerpo: ['Atento al estado en el que se encuentran las presentes actuaciones, solicito que se provea y se libre mandamiento de intimación de pago para la prosecución de la causa. A tales efectos, denuncio que el Juzgado de Paz al cual corresponde el domicilio del demandado es el de {JUZGADO DE PAZ}. Se tenga presente y se remita el mandamiento de intimación.'],
      campos: [{ id: 'JUZGADO DE PAZ', etiqueta: 'Juzgado de Paz del domicilio del demandado (ej. LOS RALOS)', tipo: 'texto' }]
    },
    // "CLINICA MAYO DE U.M.C.B. S.R.L. (5376-15) - ACTUALIZO PLANILLA POR HONORARIOS". Texto = el sellado el 30/10/2026 en EscritosHon.js.
    PLANILLA_HONORARIOS: {
      nombre: 'ACTUALIZO PLANILLA POR HONORARIOS', claves: 'planilla actualizacion honorarios orden pago saldo regulacion',
      titulo: 'ACTUALIZO PLANILLA POR HONORARIOS',
      presentacion: POR_DERECHO_PROPIO, cierre: true,
      cuerpo: [
        'En fecha {FECHA DEL OFICIO} se libró oficio por orden de pago por {MONTO PAGADO} en concepto de honorarios regulados y firmes.',
        'Atento a esto, vengo a acompañar planilla de actualización de honorarios a los fines de que se corra traslado de la misma a la demandada para su compulsa, conformidad y pago respectivo.',
        'Para la actualización se tuvo en cuenta la fecha de sentencia de regulación de honorarios ({FECHA DE REGULACION}) hasta el {ACTUALIZADO HASTA}, tomando como base la suma de {MONTO BASE}.',
        'Del cálculo efectuado surge que el monto actualizado arroja la suma de {MONTO ACTUALIZADO}. Se acompaña planilla de actualización con los parámetros de cálculo. Se agregue y se tenga presente.',
        'Habiéndose abonado la suma de {MONTO PAGADO}, cabe restar este monto a los {MONTO ACTUALIZADO}, lo que da un monto adeudado de {SALDO}, con más los aportes previsionales y lo que VS considere por acrecidas.',
        'Solicito que se corra traslado de la planilla presentada, a los fines de su verificación.'
      ],
      campos: [
        { id: 'FECHA DEL OFICIO', etiqueta: 'Fecha del oficio de la orden de pago', tipo: 'fecha' },
        { id: 'MONTO PAGADO', etiqueta: 'Monto de la orden de pago (lo ya pagado)', tipo: 'monto' },
        { id: 'FECHA DE REGULACION', etiqueta: 'Fecha de la sentencia de regulación', tipo: 'fecha' },
        { id: 'ACTUALIZADO HASTA', etiqueta: 'Actualizado hasta', tipo: 'fecha', auto: 'hoy' },
        { id: 'MONTO BASE', etiqueta: 'Base de la actualización', tipo: 'monto' },
        { id: 'MONTO ACTUALIZADO', etiqueta: 'Monto actualizado (de la planilla)', tipo: 'monto' }
      ],
      calcular: function (n) {
        if (n['MONTO ACTUALIZADO'] <= n['MONTO PAGADO']) return { error: 'El monto actualizado tiene que ser mayor que lo pagado.' };
        return { SALDO: pesos(n['MONTO ACTUALIZADO'] - n['MONTO PAGADO']) };
      },
      seguimiento: 'ACTUALIZO PLANILLA POR HONORARIOS: SALDO {SALDO}.',
      adjunto: { etiqueta: 'Planilla de actualización', archivo: 'PLANILLA DE ACTUALIZACION' }
    },
    // "AGRO LA GLORIA SRL (14346-24) - PIDO SE LIBREN OFICIOS"
    PIDO_OFICIOS: {
      nombre: 'PIDO SE LIBREN OFICIOS', claves: 'oficios bienes embargo registro inmobiliario arca iva sentencia firme investigacion',
      titulo: 'PIDO SE LIBREN OFICIOS',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: [
        'Atento al estado procesal de la presente causa y encontrándose debidamente notificada y firme la sentencia de trance y remate, sin que la demandada haya cancelado la misma, y al no conocer bienes susceptibles de embargo de {DEMANDADO}, CUIT {CUIT}, vengo a solicitar que por vuestro intermedio se libren los pertinentes Oficios a fines de establecer si existen bienes para poder ejecutar la Sentencia recaída en autos, a saber:',
        'Se Oficie a la Dirección de Registro Inmobiliario a los fines de indicar si existen Inmuebles inscriptos a nombre de la accionada.',
        'Se oficie a ARCA a los fines de que indique si posee inscripción en dicho Organismo Fiscal, en qué actividades se encuentra inscripta en su caso y si presenta y paga las declaraciones juradas de IVA desde el año {DESDE EL AÑO} a la fecha.'
      ],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' },
               // El año era fijo (2020); Carlos pidió el 05/11/2026 que sea un dato a completar.
               { id: 'DESDE EL AÑO', etiqueta: 'Año desde el que se piden las DDJJ de IVA a ARCA', tipo: 'anio' }]
    },
    // "AGRO TIUN S.R.L. (167-13) - ACOMPAÑO CONSTANCIA": la constancia de ARCA es la del mes, la que ya usa el pedido de sentencia.
    ACOMPANO_CONSTANCIA: {
      nombre: 'ACOMPAÑO CONSTANCIA', claves: 'constancia inscripcion arca afip cumplimiento proveido',
      titulo: 'ACOMPAÑO CONSTANCIA',
      presentacion: ', apoderado de la parte actora, por derecho propio a V.S. respetuosamente digo:',
      cuerpo: ['Vengo a dar cumplimiento con el proveído que antecede. A tales efectos, acompaño constancia de inscripción ante ARCA. Se agregue y se tenga presente.'],
      arca: true
    },
    // ── Sellados el 04/11/2026 (segunda tanda) ──
    // "CONSULTING SERVICE S.R.L. (2947-21) - ACOMPAÑO ARANCEL"
    ACOMPANO_ARANCEL: {
      nombre: 'ACOMPAÑO ARANCEL', claves: 'arancel oficio registro automotor dnrpa seccional proveido',
      titulo: 'ACOMPAÑO ARANCEL',
      presentacion: ', apoderado de la actora, a V.S. respetuosamente DIGO:',
      cuerpo: ['Dando cumplimiento con el proveído que antecede, vengo a acompañar el arancel correspondiente, a los fines de diligenciar el oficio al Registro Seccional del Automotor N° {REGISTRO N°} de Tucumán. Se agregue y se tenga presente.'],
      campos: [{ id: 'REGISTRO N°', etiqueta: 'N° del Registro Seccional del Automotor (ej. 8)', tipo: 'texto' }],
      adjunto: { etiqueta: 'Arancel', archivo: 'ARANCEL' }
    },
    // "ELITE SECURITY GROUP S.R.L. (3839-20) - ACOMPAÑO INFORME. PIDO INHIBICION GENERAL DE BIENES"
    INHIBICION_GENERAL: {
      nombre: 'ACOMPAÑO INFORME. PIDO INHIBICION GENERAL DE BIENES', claves: 'inhibicion general bienes dnrpa automotor informe negativo sin bienes 302',
      titulo: 'ACOMPAÑO INFORME. PIDO INHIBICION GENERAL DE BIENES',
      presentacion: ', apoderado de la actora, a V.S. respetuosamente DIGO:',
      cuerpo: [
        'I.- ACOMPAÑO INFORME:',
        'Vengo a acompañar Informe de la DNRPA, de donde surge que la demandada {DEMANDADO}, CUIT N° {CUIT}, no posee automotores a su nombre. Se agregue y se tenga presente.',
        'II.- SOLICITO INHIBICION DE BIENES:',
        'Que atento el estado de autos, donde se pudo constatar de los informes solicitados que el demandado {DEMANDADO}, CUIT N° {CUIT} no posee bienes a su nombre que pudieran cubrir el monto demandado, convirtiéndose en infructuosa y dilatoria cualquier intento de ejecución de sentencia que se pretenda, declaro bajo juramento que desconozco que el demandado {DEMANDADO} tenga bienes susceptibles de ser embargados, por lo que solicito se ordene la INHIBICION GENERAL DE BIENES en contra del mismo.',
        'Encontrándose acreditadas las exigencias previstas en el artículo 302 CPCCT, solicito se haga lugar a la medida solicitada, y se libren todos los oficios correspondientes, es decir, al REGISTRO INMOBILIARIO, al REGISTRO NACIONAL DEL AUTOMOTOR y al Registro Público de Comercio, con la salvedad de consignar la leyenda “LIBRE DE DERECHO”, dado que mi mandante es sujeto exento.',
        'Resultan ser precedentes válidos las decenas de inhibiciones otorgadas en iguales condiciones, como las que se citan a continuación: causa SEI Ingeniería SRL – Expte. 4602/22, causa AEREGE SRL Expte. 1857/20, causa Madie SRL Expte. 6280/17, causa Jaraco SRL Expte. 8502/24, causa Consultas y Proyectos S.A. Expte. 3556/15, Lacteos y Fiambres del NOA Expte. 7811/22 entre otras, por lo que revocándose por contrario imperio la denegatoria efectuada, se procedió a dictar la medida solicitada.'
      ],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' }],
      // Lo que tiene que estar en el SAE antes de pedirla (Carlos lo confirma en la app).
      requisitos: ['El informe del Registro Inmobiliario (sin inmuebles a su nombre) ya está subido en el SAE.',
                   'El informe de ARCA es negativo de actividades.'],
      adjunto: { etiqueta: 'Informe de la DNRPA (sin automotores)', archivo: 'INFORME DNRPA' }
    },
    // "GALVEZ PALERMO MARIA SOLEDAD (7169-25) - COMUNICO ESTADO DE LA DEUDA": a mano, para IVP con pago mínimo o sin pago
    // (el motor ya redacta solo COMUNICO CANCELACIÓN cuando hay IVP generado).
    ESTADO_DEUDA: {
      nombre: 'COMUNICO ESTADO DE LA DEUDA', claves: 'ivp remanente pago parcial imputacion transferencia boleta deuda planilla calculo saldo',
      titulo: 'COMUNICO ESTADO DE LA DEUDA',
      presentacion: ', apoderado de la parte actora, a V.S. respetuosamente digo:',
      cuerpo: ESTADO_DEUDA_PARCIAL,
      // Carlos pidió la variante sin pagos (04/11/2026) y la selló el 05/11/2026; en la app se elige y reemplaza el cuerpo.
      variantes: [{ nombre: 'Con pago parcial', cuerpo: ESTADO_DEUDA_PARCIAL }, { nombre: 'Sin pagos', cuerpo: ESTADO_DEUDA_SIN_PAGOS }],
      campos: [{ id: 'IVP N°', etiqueta: 'N° del IVP (ej. I 202609577)', tipo: 'texto' },
               { id: 'BOLETA DE DEUDA', etiqueta: 'Boleta de deuda (ej. BCOT/3053/2025)', tipo: 'texto' },
               { id: 'SALDO', etiqueta: 'Saldo a cancelar según el IVP', tipo: 'monto' }],
      seguimiento: 'COMUNICO ESTADO DE LA DEUDA: SALDO {SALDO}.',
      adjunto: { etiqueta: 'IVP y planilla de cálculo', archivo: 'IVP Y PLANILLA' }
    },
    // "LOGISTICA LA SERENISIMA S.A. (4191-17) - PIDO EMBARGO POR HONORARIOS". Texto = el sellado el 30/10/2026 en EscritosHon.js (art. 611, no 608).
    EMBARGO_HONORARIOS: {
      nombre: 'PIDO EMBARGO EJECUTORIO POR HONORARIOS', claves: 'embargo ejecutorio honorarios banco cuenta fondos regulacion firme 611',
      titulo: 'PIDO EMBARGO EJECUTORIO POR HONORARIOS',
      presentacion: POR_DERECHO_PROPIO, cierre: true,
      cuerpo: [
        'Encontrándose firme y consentida la regulación de honorarios, vengo a ejecutar la misma. En tal sentido, y conforme lo previsto por el artículo 611 procesal, solicito que se trabe embargo ejecutorio, el cual se deberá efectivizar sobre los fondos que el accionado {DEMANDADO}, CUIT N° {CUIT}, tenga depositados o se depositen en el futuro en cuenta corriente y/o caja de ahorro y/o cuenta de valores al cobro y/o cuenta títulos y/o depósitos a plazo fijo, en el {BANCO} por la suma de {HONORARIOS}, en concepto de honorarios, más {APORTES} en concepto de aportes previsionales obligatorios correspondientes al 10%, con más lo que V.S. presupueste para responder por acrecidas. A tal efecto, solicito se libre el oficio correspondiente.',
        'Se deja constancia que el monto por el cual se solicita el embargo, es el monto original regulado, por lo que se hace expresa reserva de actualizar los honorarios hasta la fecha de efectivo pago de los mismos. Se tenga presente.',
        'Que efectivizada la misma, se haga saber a la accionada. Se tenga presente.'
      ],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' },
               { id: 'BANCO', etiqueta: 'Banco', tipo: 'opciones', opciones: BANCOS },
               { id: 'HONORARIOS', etiqueta: 'Honorarios regulados (los aportes 10 % se calculan solos)', tipo: 'monto' }],
      calcular: function (n) {
        var h = n.HONORARIOS, ap = Math.round(h * 10) / 100;   // sin IVA: Monotributista desde el 03/11/2026
        return { APORTES: pesos(ap), TOTAL: pesos(h + ap) };
      },
      seguimiento: 'PIDO EMBARGO POR HONORARIOS: {TOTAL} ({BANCO}).'
    },
    // "MOLINA PADILLA XIMENA (14368-26) - SE REMITA A OFICIALES AD HOC": título cambiado por Carlos.
    OFICIALES_AD_HOC: {
      nombre: 'SOLICITO SE LIBRE MANDAMIENTO A OFICIALES AD HOC', claves: 'oficiales justicia ad hoc mandamiento intimacion pago capital casillero digital remita acordada',
      titulo: 'SOLICITO SE LIBRE MANDAMIENTO A OFICIALES AD HOC',
      presentacion: ', por el actor en autos a V.S., digo respetuosamente:',
      cuerpo: ['Siendo que el domicilio del demandado es en el radio capital de la Provincia, solicito que se confeccione mandamiento de intimación de pago y se remita a casillero digital de Oficiales de Justicia ad hoc autorizados por Acordadas Nros. 423/2000, 587/2000 y concordantes, para su debido diligenciamiento. Se tenga presente.']
    },
    // ── Tercera tanda (05/11/2026): pendientes de que Carlos los selle ──
    // "PAEZ ELIANA NOELI (19928-24) - EJECUTO SENTENCIA. PIDO EMBARGO"
    EJECUTO_EMBARGO: {
      nombre: 'EJECUTO SENTENCIA. PIDO EMBARGO', claves: 'ejecuto sentencia embargo ejecutorio fondos banco cuenta firme consentida trance remate',
      titulo: 'EJECUTO SENTENCIA. SOLICITO EMBARGO',
      presentacion: ', apoderado en autos por la actora, a V.S. respetuosamente me presento y digo:',
      cuerpo: [
        'EJECUTO SENTENCIA. PIDO EMBARGO EJECUTORIO:',
        'Encontrándose la sentencia de trance y remate, firme y consentida, solicito en la instancia de ejecución de sentencia, que se disponga el embargo sobre los fondos que la accionada {DEMANDADO}, CUIT N° {CUIT}, tenga depositados o se depositen en el futuro en cuenta corriente y/o caja de ahorro y/o cuenta de valores al cobro y/o cuenta títulos y/o depósitos a plazo fijo, en el {BANCO}, por la suma de {MONTO}, con más lo que V.S. presupueste para responder por acrecidas. A tal efecto, solicito se libre el oficio correspondiente.',
        'Que efectivizada la misma, se haga saber a la accionada. Se tenga presente.',
        'Se deja expresa constancia que el monto que se ejecuta, es el consignado en la demanda, por lo que, hago expresa reserva de actualizar dicho monto hasta la cancelación definitiva del crédito. Se tenga presente.'
      ],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' },
               { id: 'BANCO', etiqueta: 'Banco', tipo: 'opciones', opciones: BANCOS },
               { id: 'MONTO', etiqueta: 'Monto a embargar (el de la demanda: sale del IMPORTE del MAESTRO)', tipo: 'monto', auto: 'importe' }],
      seguimiento: 'EJECUTO SENTENCIA. PIDO EMBARGO: {MONTO} ({BANCO}).'
    },
    // "SIXCOM SA (16967-24) - DEVUELVO PUBLICACION DE EDICTOS. PIDO SENTENCIA": intimación de pago por edictos (Boletín Oficial).
    EDICTOS_PIDO_SENTENCIA: {
      nombre: 'DEVUELVO PUBLICACION DE EDICTOS. PIDO SENTENCIA', claves: 'edictos publicacion boletin oficial intimacion pago pido sentencia despacho resolver',
      titulo: 'DEVUELVO PUBLICACION DE EDICTOS. PIDO SENTENCIA',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: [
        'I.- Vengo por el presente a adjuntar la publicación de edictos dispuesta en autos, en donde se intima de pago a la demandada. Se acompaña copia digital de la publicación del primer día de publicación ({PRIMER DIA}) y del {DIA DE PUBLICACION} y último día ({ULTIMO DIA}). Se agregue y se tenga por notificado.',
        'II.- Solicito pasen las actuaciones a despacho para resolver y se notifique por edictos dicha sentencia.'
      ],
      campos: [{ id: 'PRIMER DIA', etiqueta: 'Fecha del primer día de publicación', tipo: 'fecha' },
               { id: 'ULTIMO DIA', etiqueta: 'Fecha del último día de publicación', tipo: 'fecha' },
               { id: 'DIA DE PUBLICACION', etiqueta: 'El último día fue el… (quinto si se publicó 5 días; décimo si 10)', tipo: 'opciones', opciones: ['quinto', 'décimo'] }],
      arca: true,
      seguimiento: 'DEVUELVO PUBLICACION DE EDICTOS. PIDO SENTENCIA.',
      // edictos: el servidor busca las publicaciones en el Boletín Oficial (Edictos.js), completa las fechas y une el primer y el último día.
      edictos: true,
      adjunto: { etiqueta: 'Primer y último edicto publicados', archivo: 'EDICTOS PUBLICADOS' }
    },
    // "ESTRADA FRANCISCO JOAQUIN (4461-24) - EJECUTO SENTENCIA. PIDO EMBARGO SOBRE INMUEBLE"
    EMBARGO_INMUEBLE: {
      nombre: 'EJECUTO SENTENCIA. PIDO EMBARGO SOBRE INMUEBLE', claves: 'ejecuto sentencia embargo inmueble matricula padron registro inmobiliario informe dominial minuta 175',
      titulo: 'EJECUTO SENTENCIA. PIDO EMBARGO SOBRE INMUEBLE',
      presentacion: ', por el actor en autos a V.S., digo respetuosamente:',
      cuerpo: [
        'I.- Atento al estado en el que se encuentran las presentes actuaciones, donde recayó sentencia firme y consentida, vengo a iniciar la respectiva ejecución de sentencia.',
        'II.- Para hacer efectivo el crédito de mi mandante, vengo a solicitar a S.S. se ordene TRABAR EMBARGO hasta cubrir el importe de capital e intereses reclamado con más lo que S.S. considere por acrecidas legales, de conformidad a lo normado por el artículo 175 del Código Tributario, del bien inmueble de propiedad de la demandada {DEMANDADO}, CUIT {CUIT}, de la propiedad individualizada bajo la matrícula {MATRICULA}, Padrón N° {PADRON} (acompaño informe del Registro Inmobiliario de la Provincia), facultando para suscribir las minutas correspondientes al suscripto y/o a quien autorice al efecto, librándose a tales efectos oficio al Registro Inmobiliario de la Provincia. PIDO EMBARGO.'
      ],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' },
               { id: 'MATRICULA', etiqueta: 'Matrícula del inmueble (ej. Z-04554)', tipo: 'texto' },
               { id: 'PADRON', etiqueta: 'Padrón del inmueble (ej. 153070)', tipo: 'texto' }],
      seguimiento: 'EJECUTO SENTENCIA. PIDO EMBARGO SOBRE INMUEBLE MATRICULA {MATRICULA}.',
      adjunto: { etiqueta: 'Informe del Registro Inmobiliario e informe dominial', archivo: 'INFORME RI Y DOMINIAL' }
    },
    // "MONTENEGRO SILVIA ROSA (10537-25) - SE LIBRE CEDULA": texto genérico, se edita según el caso.
    SE_LIBRE_CEDULA: {
      nombre: 'SE LIBRE CEDULA', claves: 'cedula notificacion confeccione bono movilidad decreto editable',
      titulo: 'SE LIBRE CEDULA',
      presentacion: ', de las condiciones personales que constan en autos, a V.S. respetuosamente digo:',
      cuerpo: ['Que atento al estado en que se encuentran las presentes actuaciones, y luego de haber acompañado el respectivo bono de movilidad, solicito se confeccione cédula conforme se encuentra ordenado en el decreto que antecede, y se notifique correspondientemente.']
    },
    // "PARAMERICA S.A. (9783-24) - SE LIBRE NUEVA CEDULA"
    SE_LIBRE_NUEVA_CEDULA: {
      nombre: 'SE LIBRE NUEVA CEDULA', claves: 'nueva cedula juzgado de paz notificar demandado informado editable',
      titulo: 'SE LIBRE NUEVA CEDULA',
      presentacion: ', apoderado en autos por la actora, a V.S. respetuosamente me presento y digo:',
      cuerpo: ['Atento a lo informado por el Juzgado de Paz actuante, solicito que se libre nueva cédula al Juzgado de Paz de {JUZGADO DE PAZ} a los fines de notificar al demandado.'],
      campos: [{ id: 'JUZGADO DE PAZ', etiqueta: 'Juzgado de Paz al que va la nueva cédula (ej. Lules)', tipo: 'texto' }]
    },
    // "PEREYRA CESAR LUIS (7138-25) - SE LIBRE NUEVO MANDAMIENTO A JUZGADO DE PAZ"
    NUEVO_MANDAMIENTO: {
      nombre: 'SE LIBRE NUEVO MANDAMIENTO', claves: 'nuevo mandamiento juzgado de paz jurisdiccion superintendencia domicilio intimacion editable',
      titulo: 'SE LIBRE NUEVO MANDAMIENTO A JUZGADO DE PAZ',
      presentacion: ', apoderado en autos por la actora, a V.S. respetuosamente me presento y digo:',
      cuerpo: ['Atento a lo informado por el Juzgado de Paz de {JUZGADO QUE INFORMO}, de conformidad con las averiguaciones efectuadas ante Superintendencia de Juzgados de Paz, el domicilio del demandado pertenece a la jurisdicción del Juzgado de Paz de {JUZGADO DE PAZ NUEVO}, por lo que solicito se libre nuevo mandamiento a través de dicho Juzgado.'],
      campos: [{ id: 'JUZGADO QUE INFORMO', etiqueta: 'Juzgado de Paz que informó (ej. Tafí Viejo)', tipo: 'texto' },
               { id: 'JUZGADO DE PAZ NUEVO', etiqueta: 'Juzgado de Paz que corresponde (ej. Las Talitas)', tipo: 'texto' }]
    },
    // "FRIAR SA (12123-26) - COMUNICO CANCELACION DE LA DEUDA. PIDO LEVANTAMIENTO DE EMBARGO Y DEVOLUCION DE FONDOS"
    CANCELACION_LEVANTAMIENTO: {
      nombre: 'COMUNICO CANCELACION. PIDO LEVANTAMIENTO DE EMBARGO Y DEVOLUCION DE FONDOS', claves: 'cancelacion ivp levantamiento embargo devolucion fondos informe bancario colegio abogados 5480',
      titulo: 'COMUNICO CANCELACION DE LA DEUDA. PIDO LEVANTAMIENTO DE EMBARGO Y DEVOLUCION DE FONDOS',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: CANCELACION_CUERPO,
      variantes: [{ nombre: 'Sin informe bancario', cuerpo: CANCELACION_CUERPO }, { nombre: 'Con informe bancario', cuerpo: CANCELACION_CUERPO.slice(0, 1).concat(INFORME_BANCARIO, CANCELACION_CUERPO.slice(1)) }],
      campos: [{ id: 'IVP N°', etiqueta: 'N° del IVP (ej. I 202609058)', tipo: 'texto' }],
      seguimiento: 'COMUNICO CANCELACION DE LA DEUDA. PIDO LEVANTAMIENTO DE EMBARGO Y DEVOLUCION DE FONDOS. IVP {IVP N°}.',
      adjunto: { etiqueta: 'IVP e informe bancario (Colegio de Abogados)', archivo: 'IVP E INFORME BANCARIO' }
    },
    // "PITA JORGE HORACIO (14302-24) - SOLICITO SE LIBRE OFICIO A LA CNE": etiqueta pedida por Carlos; se encuentra por CNE,
    // Cámara Nacional Electoral o Juzgado Electoral.
    OFICIO_CNE: {
      nombre: 'PIDO OFICIO A LA CNE', claves: 'cne camara nacional electoral juzgado electoral domicilio demandado oficial justicia padron',
      titulo: 'SE LIBRE OFICIO A LA CAMARA NACIONAL ELECTORAL',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: ['Atento a lo informado por el oficial de justicia actuante, vengo a solicitar se libre oficio a la Cámara Nacional Electoral a los fines de que indique el domicilio del demandado {DEMANDADO}, CUIT {CUIT}.'],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' }]
    },
    // "BULACIO SILVANA (2486-23) - EJECUTO SENTENCIA. PIDO EMBARGO AUTOMOTOR": la tabla del Word va en renglones.
    EMBARGO_AUTOMOTOR: {
      nombre: 'EJECUTO SENTENCIA. PIDO EMBARGO AUTOMOTOR', claves: 'ejecuto sentencia embargo automotor rodado vehiculo dominio dnrpa registro seccional arancel',
      titulo: 'EJECUTO SENTENCIA. PIDO EMBARGO AUTOMOTOR',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: [
        'Encontrándose firme y consentida la sentencia de trance y remate recaída en autos, vengo por el presente a ejecutar la misma. Solicito, a los efectos de hacer efectivo el cobro del crédito adeudado, se ordene el embargo ejecutorio sobre el rodado Automotor, que se indica a continuación:',
        'MARCA: {MARCA}. MODELO: {MODELO}. DOMINIO: {DOMINIO}. AÑO DE FABRICACIÓN: {AÑO DE FABRICACION}. REGISTRO SECCIONAL: {REGISTRO SECCIONAL}.',
        'Pido que se libre oficio al Registro indicado ({REGISTRO SECCIONAL}) a los efectos de la traba del embargo respectivo. Asimismo, se solicita que se disponga que informe la efectivización de la medida en el plazo de 72 horas de recibida la manda judicial.',
        'Se adjunta Ficha informe expedido por la DNRPA, de donde surge que la demandada {DEMANDADO}, CUIT {CUIT} es titular del vehículo Automotor cuyo embargo se solicita.',
        'Asimismo se acompaña el recibo de pago del arancel para el diligenciamiento del oficio respectivo. Se agregue y se tenga presente.'
      ],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' },
               { id: 'MARCA', etiqueta: 'Marca (ej. TOYOTA)', tipo: 'texto' },
               { id: 'MODELO', etiqueta: 'Modelo y tipo (ej. YARIS XS 1.5 6M/T. TIPO: SEDAN 5 PUERTAS)', tipo: 'texto' },
               { id: 'DOMINIO', etiqueta: 'Dominio (ej. AG784UR)', tipo: 'texto' },
               { id: 'AÑO DE FABRICACION', etiqueta: 'Año de fabricación', tipo: 'anio' },
               { id: 'REGISTRO SECCIONAL', etiqueta: 'Registro Seccional (ej. ANDALGALA, CATAMARCA)', tipo: 'texto' }],
      seguimiento: 'EJECUTO SENTENCIA. PIDO EMBARGO AUTOMOTOR DOMINIO {DOMINIO}.',
      adjunto: { etiqueta: 'Ficha de la DNRPA y recibo del arancel', archivo: 'DNRPA Y ARANCEL' }
    },
    // "JAIME CESAR DANIEL (2959-21) - SE NOTIFIQUE POR EDICTOS": texto del modelo; se edita según la situación.
    NOTIFIQUE_EDICTOS: {
      nombre: 'SE NOTIFIQUE POR EDICTOS', claves: 'edictos notificacion domicilio cne camara electoral infructuosa 173 editable',
      titulo: 'SE NOTIFIQUE POR EDICTOS',
      presentacion: ', de las condiciones personales que constan en autos, a V.S. respetuosamente digo:',
      cuerpo: [
        'Que vengo por medio de la presente a devolver oficio debidamente diligenciado a la Cámara Nacional Electoral, en donde se constata que el domicilio del demandado, {DOMICILIO}, es el mismo en el que se ha practicado infructuosamente la notificación en fecha {FECHA DE LA NOTIFICACION}.',
        'Ante ello, y después de haber agotado todas las instancias para anoticiar al demandado, solicito se notifique por edictos de conformidad con lo establecido en el artículo 173 del Código Tributario Provincial.'
      ],
      campos: [{ id: 'DOMICILIO', etiqueta: 'Domicilio informado por la CNE (ej. Barrio ATE, Mza. 3, Lote 32, S/N)', tipo: 'texto' },
               { id: 'FECHA DE LA NOTIFICACION', etiqueta: 'Fecha de la notificación infructuosa', tipo: 'fecha' }],
      adjunto: { etiqueta: 'Oficio diligenciado de la CNE (si corresponde)', archivo: 'OFICIO CNE DILIGENCIADO', opcional: true }
    },
    // "MOLINA PADILLA XIMENA (14368-26) - DOY CUMPLIMIENTO": texto del modelo o en blanco para escribirlo.
    DOY_CUMPLIMIENTO: {
      nombre: 'DOY CUMPLIMIENTO', claves: 'doy cumplimiento proveido acompaño demanda firmada en blanco libre editable',
      titulo: 'DOY CUMPLIMIENTO',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: ['Atento al proveído que antecede, vengo a acompañar escrito de demanda debidamente firmada. Se agregue y se tenga presente.'],
      variantes: [{ nombre: 'Acompaño demanda firmada', cuerpo: ['Atento al proveído que antecede, vengo a acompañar escrito de demanda debidamente firmada. Se agregue y se tenga presente.'] },
                  { nombre: 'En blanco (lo escribís vos)', cuerpo: [] }],
      adjunto: { etiqueta: 'Lo que se acompaña (si corresponde)', archivo: 'ADJUNTO', opcional: true }
    },
    // "HSM FOODS (4854-25) - COMUNICO IMPUTACION. EJECUTO SALDO. PIDO EMBARGO"
    IMPUTACION_EMBARGO: {
      nombre: 'COMUNICO IMPUTACION. EJECUTO SALDO. PIDO EMBARGO', claves: 'imputacion actualizo ejecucion saldo embargo ivp planilla actualizacion dacion pago transferencia banco',
      titulo: 'COMUNICO IMPUTACION. EJECUTO SALDO. SOLICITO EMBARGO',
      presentacion: ', apoderado en autos por la actora, a V.S. respetuosamente me presento y digo:',
      cuerpo: [
        'I.- COMUNICO IMPUTACION DE PAGOS:',
        'Vengo por el presente a comunicar que mi mandante procedió a la imputación del monto transferido precedentemente. A los fines de su correcta verificación, acompaño Informe de Verificación de Pagos N° {IVP N°} y su correspondiente planilla de actualización, de donde surge dicha imputación. Se agregue y se tenga presente.',
        'II.- EJECUTO SALDO. PIDO EMBARGO EJECUTORIO:',
        'Habiéndose imputado la suma dada en pago y transferida de {MONTO IMPUTADO}, al {FECHA DEL PAGO}, fecha en la cual la demandada realizó la dación en pago respectiva, se adeuda la suma de {SALDO}.',
        'A los efectos de que mi mandante pueda disponer de los fondos adeudados en concepto de renta fiscal, solicito en la instancia de ejecución de sentencia, que se disponga el embargo sobre los fondos que la accionada {DEMANDADO}, CUIT N° {CUIT}, tenga depositados o se depositen en el futuro en cuenta corriente y/o caja de ahorro y/o cuenta de valores al cobro y/o cuenta títulos y/o depósitos a plazo fijo, en el {BANCO}, por la suma de {SALDO}, con más lo que V.S. presupueste para responder por acrecidas. A tal efecto, solicito se libre el oficio correspondiente.',
        'Que efectivizada la misma, se haga saber a la accionada. Se tenga presente.'
      ],
      campos: [{ id: 'IVP N°', etiqueta: 'N° del IVP (ej. I 202606303)', tipo: 'texto' },
               { id: 'MONTO IMPUTADO', etiqueta: 'Monto dado en pago y transferido', tipo: 'monto' },
               { id: 'FECHA DEL PAGO', etiqueta: 'Fecha de la dación en pago', tipo: 'fecha' },
               { id: 'SALDO', etiqueta: 'Saldo adeudado (de la planilla)', tipo: 'monto' },
               { id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' },
               { id: 'BANCO', etiqueta: 'Banco', tipo: 'opciones', opciones: BANCOS }],
      seguimiento: 'COMUNICO IMPUTACION. EJECUTO SALDO. PIDO EMBARGO: {SALDO} ({BANCO}).',
      adjunto: { etiqueta: 'IVP y planilla de actualización', archivo: 'IVP Y PLANILLA' }
    },
    // "PADILLA PABLO JOSE (9507-24) II - ACTUALIZO EJECUCION"
    ACTUALIZO_EJECUCION: {
      nombre: 'COMUNICO PAGO PARCIAL. ACTUALIZO EJECUCION', claves: 'imputacion actualizo ejecucion pago parcial saldo ivp planilla actualizacion transferencia',
      titulo: 'COMUNICO PAGO PARCIAL. ACTUALIZO EJECUCION',
      presentacion: ', apoderado de la parte actora, a V.S. respetuosamente digo:',
      cuerpo: [
        'En las presentes actuaciones se ejecutó la sentencia recaída, solicitándose que se transfiera a la cuenta de mi mandante por el monto demandado efectuándose reserva de actualizar dicho monto hasta la fecha en que se realizó la transferencia respectiva.',
        'Imputado el monto de {MONTO IMPUTADO}, de acuerdo al Informe de Verificación de Pagos N° {IVP N°} que se acompaña, corresponde continuar con la ejecución por la suma de {SALDO}. En tal sentido, solicito que se ponga en conocimiento del demandado a los fines de estar a derecho. Se tenga presente.'
      ],
      campos: [{ id: 'MONTO IMPUTADO', etiqueta: 'Monto imputado', tipo: 'monto' },
               { id: 'IVP N°', etiqueta: 'N° del IVP (ej. I 202505545)', tipo: 'texto' },
               { id: 'SALDO', etiqueta: 'Saldo por el que sigue la ejecución', tipo: 'monto' }],
      seguimiento: 'COMUNICO PAGO PARCIAL. ACTUALIZO EJECUCION: SALDO {SALDO}.',
      adjunto: { etiqueta: 'IVP y planilla de actualización', archivo: 'IVP Y PLANILLA' }
    },
    // Modelo de otro apoderado (CONTRERAS Y AGUIRRE 12341-25), reescrito con el formato de Carlos: el oficial de justicia
    // informa que no hay numeración a la vista y se devuelve la manda (mandamiento, cédula de sentencia u otra cédula).
    OFICIO_CATASTRO: {
      nombre: 'SE OFICIE A CATASTRO (INMUEBLES COLINDANTES)', claves: 'catastro inmuebles colindantes numeracion a la vista oficial justicia domicilio nueva diligencia mandamiento cedula',
      titulo: 'SE OFICIE A CATASTRO',
      presentacion: ', apoderado de la parte actora a V.S. respetuosamente digo:',
      cuerpo: ['Atento a lo informado por el oficial de justicia actuante, en cuanto a que en el domicilio del demandado no existe numeración a la vista, motivo por el cual se devolvió la manda judicial sin diligenciar, solicito se libre oficio a la Dirección General de Catastro, a fin de que indique la numeración de los inmuebles colindantes al del demandado sito en {DOMICILIO}, sus medidas, características y cualquier otro dato que permita su correcta individualización, a los fines de practicar una nueva diligencia.'],
      campos: [{ id: 'DOMICILIO', etiqueta: 'Domicilio del demandado (ej. Almirante Brown 78 - Lules)', tipo: 'texto' }]
    },
    // ── Sellados el 06/11/2026: cuadernos de prueba de las excepciones (sin la 1ª línea "PROMUEVO DEMANDA…" del Word;
    //    cierre Proveer de Conformidad / JUSTICIA; lo copiado de la contestación se acomoda al escrito base) ──
    // "CUENCA DULCE SRL (3624-26-A1) - OFREZCO PRUEBA DOCUMENTAL A1"
    PRUEBA_DOCUMENTAL: {
      nombre: 'OFREZCO PRUEBA DOCUMENTAL', claves: 'prueba documental instrumental cuaderno excepciones apertura a prueba ofrezco ofrecimiento',
      titulo: 'OFREZCO PRUEBA DOCUMENTAL',
      presentacion: PRESENTACION_PRUEBA,
      prueba: 'DOCUMENTAL',
      cuerpo: cuerpoPrueba('DOCUMENTAL', [DOCUMENTAL_HABITUAL]),
      campos: [{ id: 'CUADERNO', etiqueta: 'Cuaderno de prueba (se agrega al Nº del expediente: …/26-A1)', tipo: 'opciones', opciones: CUADERNOS, defecto: 'A1' }]
    },
    // "MONTE CASSINO SRL (5590-23) II - OFREZCO PRUEBA INFORMATIVA A2"
    PRUEBA_INFORMATIVA: {
      nombre: 'OFREZCO PRUEBA INFORMATIVA', claves: 'prueba informativa informes oficio cuaderno excepciones expediente administrativo cobros judiciales ofrezco ofrecimiento',
      titulo: 'OFREZCO PRUEBA INFORMATIVA',
      presentacion: PRESENTACION_PRUEBA,
      prueba: 'INFORMATIVA',
      cuerpo: cuerpoPrueba('INFORMATIVA', [INFORMATIVA_HABITUAL]),
      campos: [{ id: 'CUADERNO', etiqueta: 'Cuaderno de prueba (se agrega al Nº del expediente: …/23-A2)', tipo: 'opciones', opciones: CUADERNOS, defecto: 'A2' },
               { id: 'EXPEDIENTE ADMINISTRATIVO', etiqueta: 'Expediente administrativo (ej. 6564/376-D-2022)', tipo: 'texto' }]
    }
  };

  // Lo que se le puede sumar a cualquier modelo con un toque (título + párrafos).
  var AGREGADOS = {
    PIDO_SENTENCIA: { nombre: '+ Pido sentencia', titulo: 'PIDO SENTENCIA', cuerpo: PEDIDO_SENTENCIA, arca: true }
  };

  var CARPETA = 'ESCRITOS DE MODELOS';             // BORRADORES AUTOMATICOS/ESCRITOS DE MODELOS/<año del juicio>/
  var CARPETA_ADJUNTOS = 'ADJUNTOS DE ESCRITOS';   // BORRADORES AUTOMATICOS/ADJUNTOS DE ESCRITOS/<año del juicio>/
  var MAX_TITULO = 150, MAX_CUERPO = 6000, MAX_ARCHIVOS = 10;
  var LLAVE = /\{([^{}]+)\}/g;

  function limpio(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function clave(s) { return sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  /** "$15.500" · "$85.870,33" (como en los escritos de Carlos). */
  function pesos(n) {
    var v = Math.round(Number(n) * 100) / 100, ent = Math.floor(v), dec = Math.round((v - ent) * 100);
    return '$' + String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + ('0' + dec).slice(-2) : '');
  }

  /** "15.500" · "$ 85.870,33" · "85870.33" → número (null si no es un monto). */
  function monto(v) {
    var t = String(v == null ? '' : v).replace(/[$\s]/g, '');
    if (!t) return null;
    if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    var n = Number(t);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  /** "5/3/26" · "05/03/2026" → "05/03/2026" (null si no es una fecha). */
  function fecha(v) {
    var m = String(v || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (!m) return null;
    var d = Number(m[1]), me = Number(m[2]), a = Number(m[3].length === 2 ? '20' + m[3] : m[3]);
    var f = new Date(Date.UTC(a, me - 1, d));
    if (f.getUTCMonth() !== me - 1 || f.getUTCDate() !== d) return null;
    return ('0' + d).slice(-2) + '/' + ('0' + me).slice(-2) + '/' + a;
  }

  /** Todos los tipos que se pueden generar a mano, en orden alfabético (los dos del motor + los modelos). */
  var FIJOS = [{ id: 'PEDIDO_SENTENCIA', nombre: 'SOLICITO DICTADO DE SENTENCIA', claves: 'pido pedido sentencia trance remate intimado' },
               { id: 'COMUNICO_IVP', nombre: 'COMUNICO CANCELACIÓN (IVP)', claves: 'ivp cancelacion cancelado pago comunico informe verificacion' }];
  function lista() {
    return FIJOS.map(function (t) { return { id: t.id, nombre: t.nombre, claves: t.claves, modelo: false }; })
      .concat(Object.keys(MODELOS).map(function (id) { var m = MODELOS[id]; return { id: id, nombre: m.nombre, claves: m.claves + ' ' + m.cuerpo.join(' '), modelo: true }; }))
      .sort(function (a, b) { return clave(a.nombre) < clave(b.nombre) ? -1 : clave(a.nombre) > clave(b.nombre) ? 1 : 0; });
  }

  /** Buscador por palabras clave: cada palabra tiene que aparecer (sin importar tildes ni mayúsculas) en el nombre, las claves o el texto. */
  function buscar(texto) {
    var palabras = clave(texto).split(' ').filter(Boolean);
    return lista().filter(function (t) {
      var donde = ' ' + clave(t.nombre + ' ' + t.claves);
      return palabras.every(function (p) { return donde.indexOf(' ' + p) >= 0 || (p.length > 3 && donde.indexOf(p) >= 0); });
    });
  }

  /** Lo que la app necesita para mostrar el modelo y editarlo. */
  function paraApp(id) {
    var m = MODELOS[id];
    if (!m) return null;
    var ag = {};
    Object.keys(AGREGADOS).forEach(function (k) { ag[k] = AGREGADOS[k]; });
    return { id: id, nombre: m.nombre, titulo: m.titulo, cuerpo: m.cuerpo.slice(), arca: !!m.arca, adjunto: m.adjunto || null, requisitos: (m.requisitos || []).slice(),
             variantes: (m.variantes || []).map(function (v) { return { nombre: v.nombre, cuerpo: v.cuerpo.slice() }; }),
             campos: (m.campos || []).map(function (c) { return { id: c.id, etiqueta: c.etiqueta, tipo: c.tipo, auto: c.auto || '', defecto: c.defecto || '', opciones: (c.opciones || []).slice() }; }),
             prueba: m.prueba || '', edictos: !!m.edictos, agregados: ag };
  }

  /** Valor automático de un campo (auto = { demandado, cuit, importe, hoy } del juicio). */
  function valorAuto(c, auto) {
    if (!c.auto || !auto) return c.defecto || '';
    if (c.auto === 'cuit') return String(auto.cuit || '').replace(/\D/g, '');
    if (c.auto === 'importe') return Number(auto.importe) > 0 ? pesos(auto.importe).slice(1) : '';   // IMPORTE del MAESTRO: "603.301,60"
    return String(auto[c.auto] || '');
  }

  /**
   * Encabezado según el juzgado del SAE ("Oficina de Gestión Asociada en Cobros y Apremios N° 2", "Juzgado… II Nom.")
   * y la nominación del MAESTRO (nom: 'I'|'II', centro: 2 = Concepción). Sin dato del SAE: OGA N° 1.
   */
  function encabezado(juzgado, nom) {
    juzgado = String(juzgado || ''); nom = nom || {};
    var conc = /CONCEPCI/i.test(juzgado) || nom.centro === 2;
    var oga = /GESTI[OÓ]N ASOCIADA/i.test(juzgado) || !juzgado;
    var numOga = (juzgado.match(/N[°º]\s*(\d+)/) || [])[1] || '1';
    return oga ? 'OFICINA DE GESTION ASOCIADA EN COBROS Y APREMIOS N° ' + numOga + (conc ? ' DE CONCEPCION' : '')
               : 'JUZGADO DE COBROS Y APREMIOS DE LA ' + (nom.nom || 'I') + ' NOMINACION' + (conc ? ' - CONCEPCION' : '');
  }

  /** Completa los datos entre llaves; devuelve { error } o { valores } (ya con formato: "$15.500", "05/03/2026"). */
  function completarCampos(m, dados, auto, texto) {
    var v = {}, n = {};
    var campos = m.campos || [];
    for (var i = 0; i < campos.length; i++) {
      var c = campos[i], nombre = c.etiqueta.replace(/ \(.*\)$/, ''), crudo = limpio(dados[c.id]) || valorAuto(c, auto);
      if (texto != null && !m.calcular && texto.indexOf('{' + c.id + '}') < 0) continue;   // el dato ya no está en el texto
      if (!crudo) return { error: 'Falta completar: ' + nombre + '.' };
      if (c.tipo === 'monto') {
        if ((n[c.id] = monto(crudo)) === null) return { error: nombre + ': el monto no es válido.' };
        v[c.id] = pesos(n[c.id]);
      } else if (c.tipo === 'fecha') {
        if (!(v[c.id] = fecha(crudo))) return { error: nombre + ': la fecha tiene que ser dd/mm/aaaa.' };
      } else if (c.tipo === 'anio') {
        v[c.id] = crudo.replace(/\D/g, '');
        if (!/^(19|20)\d{2}$/.test(v[c.id])) return { error: nombre + ': el año tiene que tener 4 números (ej. 2020).' };
      } else if (c.tipo === 'cuit') {
        v[c.id] = crudo.replace(/\D/g, '');
        if (!/^\d{11}$/.test(v[c.id])) return { error: 'El CUIT tiene que tener 11 números.' };
      } else v[c.id] = crudo;
    }
    if (m.calcular) {
      var calc = m.calcular(n);
      if (calc.error) return { error: calc.error };
      Object.keys(calc).forEach(function (k) { v[k] = calc[k]; });
    }
    return { valores: v };
  }

  function rellenar(texto, v) { return texto.replace(LLAVE, function (todo, k) { return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : todo; }); }

  /**
   * Arma el escrito con lo que Carlos dejó en la app.
   * @param ed { titulo, cuerpo: [párrafos] o texto con párrafos separados por renglón en blanco, arca, archivos: [lo subido],
   *             campos: { 'JUZGADO DE PAZ': 'LOS RALOS', … }, auto: { demandado, cuit, hoy } del juicio }
   * @return { ok, error } o { ok, titulo, accion, tipo, presentacion, cierre, cuerpo, seguimiento, sinArca, carpeta, adjunto }
   */
  function armar(id, ed) {
    var m = MODELOS[id];
    if (!m) return { ok: false, error: 'Modelo desconocido: ' + id };
    ed = ed || {};
    var titulo = ed.titulo == null ? m.titulo : limpio(ed.titulo).toUpperCase();
    var cuerpo = ed.cuerpo == null ? m.cuerpo.slice()
               : (Array.isArray(ed.cuerpo) ? ed.cuerpo : String(ed.cuerpo).split(/\n\s*\n/)).map(limpio).filter(Boolean);
    if (!titulo.replace(/[.\-–\s]/g, '')) return { ok: false, error: 'Falta el título del escrito.' };
    if (titulo.length > MAX_TITULO) return { ok: false, error: 'El título es muy largo (máximo ' + MAX_TITULO + ' letras).' };
    if (!cuerpo.length) return { ok: false, error: 'El cuerpo del escrito está vacío.' };
    if (cuerpo.join('').length > MAX_CUERPO) return { ok: false, error: 'El cuerpo es muy largo (máximo ' + MAX_CUERPO + ' letras).' };

    var c = completarCampos(m, ed.campos || {}, ed.auto, titulo + ' ' + cuerpo.join(' '));
    if (c.error) return { ok: false, error: c.error };
    var tituloModelo = titulo === m.titulo;
    titulo = rellenar(titulo, c.valores);
    cuerpo = cuerpo.map(function (p) { return rellenar(p, c.valores); });
    var resto = (titulo + ' ' + cuerpo.join(' ')).match(LLAVE);
    if (resto) return { ok: false, error: 'Hay un dato entre llaves que no se completa: ' + resto[0] + '. Borralo o corregilo.' };

    // Cuaderno de prueba: va pegado al Nº del expediente (3624/26-A1) y en el nombre del archivo.
    var cuaderno = '';
    if (m.prueba) {
      cuaderno = limpio((ed.campos || {}).CUADERNO || 'A1').toUpperCase();
      if (!/^[A-Z]\d{1,2}$/.test(cuaderno)) return { ok: false, error: 'El cuaderno de prueba va como A1, A2…' };
    }
    var subidos = (ed.archivos || []).length;
    var edictosAuto = !!(m.edictos && ed.edictos && ed.edictos.primero);   // los del Boletín Oficial cuentan como lo subido
    if (m.adjunto && !m.adjunto.opcional && !subidos && !edictosAuto) return { ok: false, error: 'Falta subir el archivo: ' + m.adjunto.etiqueta.toLowerCase() + '.' };
    if (subidos > MAX_ARCHIVOS) return { ok: false, error: 'Son muchos archivos (máximo ' + MAX_ARCHIVOS + ').' };
    var sinPunto = titulo.replace(/[\s.\-–]+$/, '');
    // Seguimiento propio del modelo (p. ej. con el saldo) solo si el título quedó como en el modelo.
    var seguimiento = m.seguimiento && tituloModelo ? rellenar(m.seguimiento, c.valores) : sinPunto + '.';
    if (/\{[^{}]+\}/.test(seguimiento)) seguimiento = sinPunto + '.';   // un dato del seguimiento quedó afuera del texto
    return {
      ok: true, titulo: titulo, accion: sinPunto + (cuaderno ? ' ' + cuaderno : ''), tipo: sinPunto, presentacion: m.presentacion, cierre: !!m.cierre, cuerpo: cuerpo,
      cuaderno: cuaderno, seguimiento: cuaderno ? seguimiento.replace(/\.$/, ' (CUADERNO ' + cuaderno + ').') : seguimiento, sinArca: !(ed.arca == null ? !!m.arca : ed.arca), carpeta: CARPETA, adjunto: m.adjunto || null
    };
  }

  /**
   * Prueba ofrecida en la contestación de excepciones (texto del Word, del PDF o del SAE).
   * Toma la sección PRUEBAS / OFREZCO PRUEBA hasta la reserva del caso federal o el petitorio, y la reparte en
   * DOCUMENTAL (también "INSTRUMENTAL") e INFORMATIVA (también "INFORMES"). Devuelve los párrafos de cada una.
   */
  var INICIO_PRUEBA = /^\s*(?:[IVX]+\s*[.\-)]+\s*|\d+\s*[.\-)]+\s*)?(?:PRUEBAS?|OFREZCO (?:LA SIGUIENTE )?PRUEBAS?|OFRECIMIENTO DE PRUEBAS?|OFRECE PRUEBAS?)\s*:?\s*$/i;
  var FIN_PRUEBA = /^\s*(?:[IVX]+\s*[.\-)]+\s*|\d+\s*[.\-)]+\s*)?(?:PLANTEO RESERVA|RESERVA DEL CASO FEDERAL|RESERVA|PETITORIO|PETITUM|DERECHO|AUTORIZA)/i;
  var CLASE_PRUEBA = /^\s*(?:[a-z0-9]{1,3}\s*[.\-)]+\s*|[•\-]\s*)?(INSTRUMENTAL|DOCUMENTAL|INFORMATIVA|INFORMES?|PERICIAL(?: CONTABLE)?|CONFESIONAL|TESTIMONIAL)\b\s*:?\s*(.*)$/i;
  function pruebaOfrecida(texto) {
    var lineas = String(texto || '').replace(/\r/g, '').split('\n');
    var desde = -1;
    for (var i = lineas.length - 1; i >= 0; i--) if (INICIO_PRUEBA.test(lineas[i])) { desde = i; break; }   // la última: no la cita de la contraria
    var r = { DOCUMENTAL: [], INFORMATIVA: [], encontrada: desde >= 0 };
    if (desde < 0) return r;
    var seccion = [];
    for (var j = desde + 1; j < lineas.length && !FIN_PRUEBA.test(lineas[j]); j++) seccion.push(lineas[j]);
    // Word: un párrafo por renglón. PDF: los renglones se cortan y los párrafos se separan con un renglón en blanco.
    var conBlancos = /\n\s*\n/.test(seccion.join('\n').trim());
    var bloques = [], actual = [];
    seccion.forEach(function (l) {
      var t = l.trim();
      var corta = !t || CLASE_PRUEBA.test(t) || /^[•\-]\s/.test(t) || /^[a-z0-9]{1,2}\)\s/i.test(t) || !conBlancos;
      if (corta && actual.length) { bloques.push(actual.join(' ')); actual = []; }
      if (t) actual.push(t);
    });
    if (actual.length) bloques.push(actual.join(' '));
    var clase = null;
    bloques.forEach(function (b) {
      b = limpio(b);
      if (/^ofrezco (la siguiente|las siguientes)\s*:?\s*$/i.test(b) || /^(la siguiente|las siguientes)\s*:?$/i.test(b)) return;
      var m = b.match(CLASE_PRUEBA);
      if (m) {
        var k = m[1].toUpperCase();
        clase = /INSTRUMENTAL|DOCUMENTAL/.test(k) ? 'DOCUMENTAL' : /INFORM/.test(k) ? 'INFORMATIVA' : null;
        b = limpio(m[2]);
        if (!b) return;
      }
      if (clase) r[clase].push(b.replace(/^[•\-]\s*/, ''));
    });
    return r;
  }

  /**
   * Columna ADJUNTO de la hoja ESCRITOS: ids de Drive a unir detrás del escrito, separados por coma;
   * "ARCA" = además va la constancia de ARCA del mes. Vacía = solo ARCA (los pedidos de sentencia de siempre).
   */
  function columnaAdjunto(ids, arca) { return ids.length ? ids.concat(arca ? ['ARCA'] : []).join(',') : ''; }

  function leerAdjunto(texto) {
    var partes = String(texto || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var ids = partes.filter(function (x) { return x !== 'ARCA'; });
    return { ids: ids, arca: !ids.length || partes.indexOf('ARCA') >= 0 };
  }

  return { MODELOS: MODELOS, AGREGADOS: AGREGADOS, CARPETA: CARPETA, CARPETA_ADJUNTOS: CARPETA_ADJUNTOS,
           lista: lista, buscar: buscar, paraApp: paraApp, valorAuto: valorAuto, encabezado: encabezado, armar: armar,
           pruebaOfrecida: pruebaOfrecida, cuerpoPrueba: cuerpoPrueba,
           pesos: pesos, monto: monto, fecha: fecha, columnaAdjunto: columnaAdjunto, leerAdjunto: leerAdjunto };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Modelos;
