/*
 * comprobantes.js — Carta de pago y recibo de honorarios, y los datos para la factura de ARCA (pedido de Carlos, 04/11/2026, punto 3).
 * Archivo puro: lo usan la app ("Así queda") y Apps Script (va dentro de TODO_EN_UNO.gs, arma el PDF), y corre en Node para las pruebas.
 *
 * CARTA DE PAGO: el texto de las cartas de Carlos (MIGUEZ 4032/24, GOMEZ 10350/26, HAEL 19633/24 y 7133/25, AMADO 4495/24 Concepción;
 *   con montos y pagador distinto del demandado: EMILIO JORGE ANTONIO por ABRAHAM 8242/21). Courier New, justificado, sin fecha.
 * RECIBO: sale del "RECIBO DE PAGO PARCIAL" de Carlos (Google Docs, 01/04/2026), pasado a honorarios de un juicio. SELLADO por Carlos el 06/11/2026.
 * Carta y recibo salen con la firma y el sello escaneados por defecto (decisión de Carlos, 06/11/2026).
 * FACTURA: se emite en ARCA (la emite Carlos); la app muestra los datos para copiar y después se sube el PDF.
 */
var Comprobantes = (function () {
  'use strict';

  var ARCA = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var TRATOS = { SR: 'el Sr.', SRA: 'la Sra.', EMPRESA: '' };
  var DEL = { SR: 'del Sr.', SRA: 'de la Sra.', EMPRESA: 'de' };
  var CONCEPTOS = { TOTAL: 'pago total', CUENTA: 'pago a cuenta', CUOTA: 'pago de la cuota' };
  var FIRMANTE = 'el Dr. Carlos E. Arias, Abogado de la Matrícula Profesional Nº 4831';
  var RAYAS = '-------------------------';

  // ───────── Números ─────────
  /** "$100.000" · "$4.500,50" (como en las cartas de Carlos). */
  function pesos(n) {
    var v = Math.round(Number(n) * 100) / 100, ent = Math.floor(v), dec = Math.round((v - ent) * 100);
    return '$' + String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + ('0' + dec).slice(-2) : '');
  }

  /** "15.500" · "$ 85.870,33" · "85870.33" → número (null si no es un monto). */
  function monto(v) {
    if (typeof v === 'number') return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
    var t = String(v == null ? '' : v).replace(/[$\s]/g, '');
    if (!t) return null;
    if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    var n = Number(t);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  var U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
           'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO',
           'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  var D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  var C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  function hasta999(n) {
    if (n === 100) return 'CIEN';
    var c = Math.floor(n / 100), r = n % 100, out = [];
    if (c) out.push(C[c]);
    if (r < 30) { if (r) out.push(U[r]); }
    else out.push(D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : ''));
    return out.join(' ');
  }
  function entero(n) {
    var mill = Math.floor(n / 1000000), miles = Math.floor((n % 1000000) / 1000), resto = n % 1000, partes = [];
    if (mill) partes.push(mill === 1 ? 'UN MILLÓN' : entero(mill) + ' MILLONES');
    if (miles) partes.push(miles === 1 ? 'MIL' : hasta999(miles) + ' MIL');
    if (resto) partes.push(hasta999(resto));
    return partes.length ? partes.join(' ') : 'CERO';
  }
  /** 104500 → "CIENTO CUATRO MIL QUINIENTOS"; 1500.5 → "MIL QUINIENTOS CON 50/100". "UN" antes de MIL/MILLÓN/PESOS. */
  function enLetras(v) {
    var n = Math.round(Number(v) * 100), cent = n % 100;
    return entero(Math.floor(n / 100)) + (cent ? ' CON ' + ('0' + cent).slice(-2) + '/100' : '');
  }

  // ───────── Juicio ─────────
  /** Nom de HONORARIOS ("I", "II CONCP.", "I CONCEPCION") → "I° Nominación" / "II° Nominación de Concepción". */
  function juzgado(nom) {
    var s = String(nom || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var conc = /CONC/.test(s), r = s.replace(/CONC[A-Z]*\.?/g, '').replace(/[^I]/g, '');
    if (r !== 'I' && r !== 'II') return '';
    return r + '° Nominación' + (conc ? ' de Concepción' : '');
  }

  /** "4032/24" o "19633/24; 7133/25" → ['4032/24'] / ['19633/24', '7133/25']. */
  function listaExptes(e) {
    return String(e || '').split(/\s*(?:;|,|\by\b|\n)\s*/i).map(function (x) { return x.replace(/\s+/g, '').replace(/-/g, '/'); })
      .filter(function (x) { return /^\d{1,6}\/\d{2,4}$/.test(x); });
  }

  /** Empresa (SA, SRL, SAS, SCA, SH, cooperativa…) → sin "Sr."/"Sra."; si no, "el Sr.". */
  function tratoPorNombre(nombre) {
    var s = ' ' + String(nombre || '').toUpperCase().replace(/\./g, '').replace(/[()]/g, ' ') + ' ';
    return /\s(SA|SAU|SRL|SAS|SCA|SH|SAIC|SACIF|SACI|SAICA|SAICF|SE|SOCIEDAD|COOPERATIVA|ASOCIACION|ASOCIACIÓN|FUNDACION|FUNDACIÓN|CIA|COMPAÑIA|COMPAÑÍA)\s/.test(s) ? 'EMPRESA' : 'SR';
  }

  function unirY(lista) { return lista.length < 2 ? lista.join('') : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1]; }

  /** prep 'a' | 'de' → "al juicio … caratulado" / "del juicio" / "a los juicios … caratulados" / "de los juicios". */
  function juicioTexto(prep, d, exptes) {
    var varios = exptes.length > 1;
    return (varios ? prep + ' los juicios de Ejecución Fiscal caratulados' : (prep === 'a' ? 'al' : 'del') + ' juicio de Ejecución Fiscal caratulado') +
      ': “PROVINCIA DE TUCUMAN -D.G.R.- c/ ' + d.demandado + ' s/ EJECUCION FISCAL”, ' +
      (varios ? 'tramitados por Exptes. Nros. ' : 'tramitado por Expte. N° ') + unirY(exptes) +
      ' ante el Juzgado de Cobros y Apremios de la ' + d.juzgado;
  }

  function fechaLarga(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { dia: Number(m[3]), mes: MESES[Number(m[2]) - 1], anio: m[1] };
  }

  /**
   * @param tipo 'CARTA' | 'RECIBO'
   * @param d { demandado, exptes ("4032/24" o varios), juzgado (o nom de HONORARIOS), pagador (vacío = el demandado), trato SR|SRA|EMPRESA,
   *            documento (CUIT o DNI, optativo), honorarios, aportes (optativo), conMontos (carta), concepto TOTAL|CUENTA|CUOTA (recibo),
   *            cuota { n, de }, fecha 'yyyy-mm-dd' (recibo) }
   * @return { ok, titulo, parrafos[], accion (nombre del archivo), celda (texto de la columna J), faltan[] } o { ok:false, error }
   */
  function armar(tipo, d) {
    d = d || {};
    var faltan = [];
    var demandado = String(d.demandado || '').replace(/\s+/g, ' ').trim().toUpperCase();
    var exptes = listaExptes(d.exptes);
    var jz = d.juzgado || juzgado(d.nom);
    if (!demandado) faltan.push('DEMANDADO');
    if (!exptes.length) faltan.push('EXPEDIENTE');
    if (!jz) faltan.push('NOMINACIÓN');
    var pagador = String(d.pagador || '').replace(/\s+/g, ' ').trim().toUpperCase() || demandado;
    var tercero = pagador !== demandado;
    var trato = TRATOS.hasOwnProperty(d.trato) ? d.trato : tratoPorNombre(pagador);
    var docu = String(d.documento || '').replace(/\s+/g, ' ').trim();
    var hon = monto(d.honorarios), apo = monto(d.aportes);
    var j = { demandado: demandado, juzgado: jz };

    if (tipo === 'CARTA') {
      var conMontos = !!d.conMontos || tercero;
      if (conMontos && !hon) faltan.push('HONORARIOS');
      if (faltan.length) return { ok: false, error: 'Falta completar: ' + faltan.join(', '), faltan: faltan };
      var t = 'CARTA DE PAGO – Por la presente ' + FIRMANTE + ', otorga Carta de Pago a ' + pagador + (docu ? ', CUIT ' + docu : '') +
              ', a los efectos de acreditar la cancelación ' + (conMontos ? 'total y definitiva ' : '') + 'de los honorarios profesionales acordados' +
              (conMontos ? ' por un monto de ' + pesos(hon) + ' en concepto de honorarios' + (apo ? ' y ' + pesos(apo) + ' en concepto de aportes previsionales' : '') : '');
      if (tercero) t += '. Se deja debida constancia que ' + (TRATOS[trato] ? TRATOS[trato] + ' ' : '') + pagador + ' abona a cuenta y orden ' + juicioTexto('de', j, exptes);
      else t += ', correspondientes ' + juicioTexto('a', j, exptes);
      return { ok: true, tipo: 'CARTA', titulo: '', parrafos: [t + '.' + RAYAS], accion: 'CARTA DE PAGO POR HONORARIOS' + (apo ? ' Y APORTES' : ''), celda: 'CARTA DE PAGO' };
    }

    if (tipo === 'RECIBO') {
      var concepto = CONCEPTOS.hasOwnProperty(d.concepto) ? d.concepto : 'TOTAL';
      var cuota = d.cuota || {}, f = fechaLarga(d.fecha);
      if (!hon) faltan.push('MONTO');
      if (concepto === 'CUOTA' && !(Number(cuota.n) > 0)) faltan.push('Nº DE CUOTA');
      if (!f) faltan.push('FECHA');
      if (faltan.length) return { ok: false, error: 'Falta completar: ' + faltan.join(', '), faltan: faltan };
      var total = Math.round((hon + (apo || 0)) * 100) / 100;
      var que = concepto === 'CUOTA' ? CONCEPTOS.CUOTA + ' N° ' + Number(cuota.n) + (Number(cuota.de) > 0 ? ' de ' + Number(cuota.de) : '') : CONCEPTOS[concepto];
      var p1 = 'Recibí ' + DEL[trato] + ' ' + pagador + (docu ? ', ' + (/^\d{2}-?\d{8}-?\d$/.test(docu) ? 'CUIT' : 'DNI') + ' n° ' + docu : '') +
               ', la suma de ' + pesos(total) + ' (Pesos ' + enLetras(total) + ')' +
               (apo ? ', de los cuales ' + pesos(hon) + ' corresponden a honorarios y ' + pesos(apo) + ' a aportes previsionales,' : '') +
               ' en concepto de ' + que + ' de los honorarios profesionales acordados' +
               (tercero ? ', abonados a cuenta y orden de ' + demandado : '') +
               ', correspondientes ' + juicioTexto('a', j, exptes) + '.' + RAYAS;
      var p2 = 'En la ciudad de San Miguel de Tucumán, a los ' + f.dia + ' días del mes de ' + f.mes + ' del año ' + f.anio +
               ', se firman dos ejemplares de un mismo tenor y a un solo efecto.' + RAYAS;
      return { ok: true, tipo: 'RECIBO', titulo: concepto === 'TOTAL' ? 'RECIBO DE PAGO' : 'RECIBO DE PAGO PARCIAL', parrafos: [p1, p2],
               accion: concepto === 'TOTAL' ? 'RECIBO DE PAGO DE HONORARIOS' : 'RECIBO DE PAGO PARCIAL DE HONORARIOS', celda: 'RECIBO' };
    }
    return { ok: false, error: 'Tipo de comprobante desconocido: ' + tipo };
  }

  // Texto para la descripción de la factura (Carlos, 06/11/2026). Las variables [***] salen del juicio y se pueden corregir en la app.
  var FACTURA_TEXTO = 'CANCELACION DE HONORARIOS PROFESIONALES CORRESPONDIENTES A JUICIO DE EJECUCION FISCAL CARATULADO: “PROVINCIA DE TUCUMAN –DGR- vs. {DEMANDADO}”, ' +
                      'TRAMITADO ANTE EL JUZGADO DE COBROS Y APREMIOS DE LA {NOMINACION} NOMINACION DEL CENTRO JUDICIAL {CENTRO} POR EXPEDIENTE N° {EXPEDIENTE}.';

  /** Nom de HONORARIOS → { nominacion: 'I°' | 'II°' | '', centro: 'CAPITAL' | 'CONCEPCION' }. */
  function partesNominacion(nom) {
    var s = String(nom || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var r = s.replace(/CONC[A-Z]*\.?/g, '').replace(/[^I]/g, '');
    return { nominacion: r === 'I' || r === 'II' ? r + '°' : '', centro: /CONC/.test(s) ? 'CONCEPCION' : 'CAPITAL' };
  }

  /** v: { demandado, nominacion, centro, exptes }. Lo que falta queda como [***] para completarlo a mano. */
  function textoFactura(v) {
    var dato = function (x) { x = String(x || '').replace(/\s+/g, ' ').trim().toUpperCase(); return x || '[***]'; };
    var ex = listaExptes(v.exptes);
    return FACTURA_TEXTO.replace('{DEMANDADO}', dato(v.demandado)).replace('{NOMINACION}', dato(v.nominacion)).replace('{CENTRO}', dato(v.centro))
      .replace('{EXPEDIENTE}', ex.length ? ex.join(' Y ') : dato(v.exptes));
  }

  /** Lo que se copia en ARCA (Comprobantes en línea → Factura C, monotributo). */
  function datosFactura(d) {
    var hon = monto(d.honorarios), apo = monto(d.aportes), pn = partesNominacion(d.nom);
    var variables = { demandado: String(d.demandado || '').toUpperCase().trim(), nominacion: pn.nominacion, centro: pn.centro, exptes: listaExptes(d.exptes).join('; ') };
    return {
      receptor: String(d.pagador || d.demandado || '').toUpperCase().trim(),
      documento: String(d.documento || ''),
      variables: variables,
      descripcion: textoFactura(variables),
      importe: hon ? pesos(hon + (apo || 0)).replace('$', '') : ''
    };
  }

  return { ARCA: ARCA, armar: armar, tratoPorNombre: tratoPorNombre, datosFactura: datosFactura, textoFactura: textoFactura, partesNominacion: partesNominacion, juzgado: juzgado, listaExptes: listaExptes, enLetras: enLetras, pesos: pesos, monto: monto };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Comprobantes;
