/*
 * Agenda de plazos — reglas compartidas.
 * El mismo archivo corre en la app (navegador) y en Apps Script (avisos por mail).
 * Sin servicios de Google: se prueba en la Mac con pruebas/prueba_agenda.js.
 * Fechas siempre como texto 'AAAA-MM-DD'. inhabiles = {'2026-07-09': true, …} (pestaña CALENDARIO).
 */
var Agenda = (function () {
  'use strict';

  var TIPOS = { VENCIMIENTO: 'Vencimiento', AUDIENCIA: 'Audiencia o reunión', TAREA: 'Tarea sin fecha', RECURRENTE: 'Tarea que se repite' };
  var LUGARES = { TRIBUNALES: 'Tribunales', COMPUTADORA: 'Computadora', TELEFONO: 'Teléfono', DESPACHO: 'Despacho' };
  var FRECUENCIAS = { DIARIA: 'Todos los días', SEMANAL: 'Todas las semanas', MENSUAL: 'Todos los meses' };
  var DIAS_MAIL = { VENCIMIENTO: [7, 3, 1, 0], AUDIENCIA: [7, 1, 0] };
  var RE_ISO = /^\d{4}-\d{2}-\d{2}$/;

  function aFecha(iso) { return new Date(iso + 'T00:00:00Z'); }
  function aIso(d) { return d.toISOString().slice(0, 10); }
  function dmy(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function fechaValida(iso) { return RE_ISO.test(iso || '') && aIso(aFecha(iso)) === iso; }
  function diasEntre(a, b) { return Math.round((aFecha(b) - aFecha(a)) / 86400000); }
  function sumarDias(iso, n) { return aIso(new Date(aFecha(iso).getTime() + n * 86400000)); }

  function esHabil(iso, inhabiles) {
    var dw = aFecha(iso).getUTCDay();
    return dw !== 0 && dw !== 6 && !(inhabiles && inhabiles[iso]);
  }

  /** Días hábiles entre a (excluido) y b (incluido), igual que Reglas.diasHabiles. */
  function habilesEntre(a, b, inhabiles) {
    var n = 0;
    for (var x = sumarDias(a, 1); x <= b; x = sumarDias(x, 1)) if (esHabil(x, inhabiles)) n++;
    return n;
  }

  /** Fecha en que se cumplen n días hábiles, contados desde el día siguiente a "desde". */
  function sumarHabiles(desde, n, inhabiles) {
    var x = desde, c = 0;
    while (c < n) { x = sumarDias(x, 1); if (esHabil(x, inhabiles)) c++; }
    return x;
  }

  /** Clave del período de una tarea que se repite: el día, el lunes de la semana o el mes. */
  function periodo(frecuencia, iso) {
    if (frecuencia === 'MENSUAL') return iso.slice(0, 7);
    if (frecuencia === 'SEMANAL') return sumarDias(iso, -((aFecha(iso).getUTCDay() + 6) % 7));
    return iso;
  }

  function recurrenteHecha(it, hoy) {
    return !!it.ultHecho && periodo(it.frecuencia, it.ultHecho) === periodo(it.frecuencia, hoy);
  }

  function estaHecho(it, hoy) {
    return it.tipo === 'RECURRENTE' ? recurrenteHecha(it, hoy) : it.estado === 'HECHO';
  }

  /** vencido | pasado | hoy | urgente | cerca | normal | hecho: define el color y lo insistente del aviso. */
  function nivel(it, hoy) {
    if (estaHecho(it, hoy)) return 'hecho';
    if (it.tipo === 'VENCIMIENTO') {
      var d = diasEntre(hoy, it.fecha);
      if (d < 0) return 'vencido';
      if (d === 0) return 'hoy';
      if (d <= (it.fatal ? 7 : 3)) return 'urgente';
      return d <= (it.fatal ? 15 : 7) ? 'cerca' : 'normal';
    }
    if (it.tipo === 'AUDIENCIA') {
      var a = diasEntre(hoy, it.fecha);
      if (a < 0) return 'pasado';
      if (a === 0) return 'hoy';
      if (a === 1) return 'urgente';
      return a <= 7 ? 'cerca' : 'normal';
    }
    return 'normal';
  }

  function dias(n) { return n + (n === 1 ? ' día' : ' días'); }

  /** Lo que se lee en la tarjeta y en el mail. */
  function texto(it, hoy, inhabiles) {
    if (it.tipo === 'TAREA') {
      var ant = it.creado ? diasEntre(it.creado, hoy) : 0;
      return ant > 0 ? 'Pendiente hace ' + dias(ant) : 'Cargada hoy';
    }
    if (it.tipo === 'RECURRENTE') {
      return FRECUENCIAS[it.frecuencia] + (it.ultHecho ? ' · última vez: ' + dmy(it.ultHecho) : '');
    }
    var d = diasEntre(hoy, it.fecha), f = dmy(it.fecha);
    if (it.tipo === 'AUDIENCIA') {
      var hora = it.hora ? ' a las ' + it.hora : '';
      if (d < 0) return 'Fue el ' + f + hora;
      if (d === 0) return 'HOY' + hora;
      if (d === 1) return 'Mañana' + hora;
      return 'En ' + dias(d) + ': ' + f + hora;
    }
    if (d < 0) return 'VENCIÓ hace ' + dias(-d) + ' (' + f + ')';
    if (d === 0) return 'Vence HOY (' + f + ')';
    if (d === 1) return 'Vence mañana (' + f + ')';
    return 'Vence en ' + dias(d) + ' (' + f + ') · ' + habilesEntre(hoy, it.fecha, inhabiles) + ' hábiles';
  }

  function porFecha(a, b) {
    return (a.fecha + (a.hora || '')) < (b.fecha + (b.hora || '')) ? -1 : (a.fecha + (a.hora || '')) > (b.fecha + (b.hora || '')) ? 1 : 0;
  }

  /** Reparte los ítems por sección; lo cumplido queda aparte para poder deshacerlo. */
  function secciones(items, hoy) {
    var s = { vencimientos: [], audiencias: [], tareas: [], recurrentes: [], hechos: [] };
    items.forEach(function (it) {
      if (it.estado === 'BORRADO') return;
      if (it.tipo === 'RECURRENTE') s.recurrentes.push(it);
      else if (estaHecho(it, hoy)) s.hechos.push(it);
      else if (it.tipo === 'VENCIMIENTO') s.vencimientos.push(it);
      else if (it.tipo === 'AUDIENCIA') s.audiencias.push(it);
      else s.tareas.push(it);
    });
    s.vencimientos.sort(porFecha); s.audiencias.sort(porFecha);
    s.tareas.sort(function (a, b) { return (a.creado || '') < (b.creado || '') ? -1 : 1; });
    s.recurrentes.sort(function (a, b) { return Number(recurrenteHecha(a, hoy)) - Number(recurrenteHecha(b, hoy)); });
    s.hechos.sort(function (a, b) { return (a.ultHecho || '') < (b.ultHecho || '') ? 1 : -1; });
    return s;
  }

  /** Lo que se muestra arriba, en todas las pestañas. */
  function alertas(items, hoy) {
    var r = { vencidos: 0, hoy: 0, urgentes: 0, total: 0 };
    items.forEach(function (it) {
      if (it.estado === 'BORRADO') return;
      var n = nivel(it, hoy);
      if (n === 'vencido') r.vencidos++;
      else if (n === 'hoy') r.hoy++;
      else if (n === 'urgente') r.urgentes++;
    });
    r.total = r.vencidos + r.hoy + r.urgentes;
    return r;
  }

  function textoAlertas(a) {
    var p = [];
    if (a.vencidos) p.push(a.vencidos + (a.vencidos === 1 ? ' vencido' : ' vencidos'));
    if (a.hoy) p.push(a.hoy + ' para hoy');
    if (a.urgentes) p.push(a.urgentes + (a.urgentes === 1 ? ' próximo' : ' próximos'));
    return p.join(' · ');
  }

  /** ¿Este ítem entra en el mail de hoy? Vencido: todos los días. Plazo fatal: todos los días desde 7 antes. */
  function tocaMail(it, hoy) {
    if (it.estado !== 'PENDIENTE' || !DIAS_MAIL[it.tipo]) return false;
    var d = diasEntre(hoy, it.fecha);
    if (it.tipo === 'VENCIMIENTO' && (d < 0 || (it.fatal && d <= 7))) return true;
    return DIAS_MAIL[it.tipo].indexOf(d) >= 0;
  }

  /** Mail de la mañana. null si hoy no toca avisar nada. */
  function resumenMail(items, hoy, inhabiles, urlApp) {
    var lista = items.filter(function (it) { return tocaMail(it, hoy); }).sort(porFecha);
    if (!lista.length) return null;
    var a = alertas(lista, hoy);
    var asunto = (a.vencidos || a.hoy ? '⚠ ' : '') + 'Agenda: ' + (textoAlertas(a) || (lista.length + (lista.length === 1 ? ' vencimiento cerca' : ' vencimientos cerca')));
    var lineas = lista.map(function (it) {
      return '• ' + (it.fatal ? '[FATAL] ' : '') + it.titulo + (it.e ? ' — Expte. ' + it.e + (it.d ? ' (' + it.d + ')' : '') : '') + '\n  ' + texto(it, hoy, inhabiles);
    });
    return { asunto: asunto, cuerpo: lineas.join('\n\n') + (urlApp ? '\n\nAbrir la agenda: ' + urlApp : ''), cantidad: lista.length };
  }

  function limpio(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }

  /** Controla y normaliza lo que llega del formulario. Corre también en el servidor. */
  function validar(d, inhabiles) {
    d = d || {};
    var it = { tipo: String(d.tipo || ''), titulo: limpio(d.titulo, 300), e: limpio(d.e, 40), d: limpio(d.d, 200), fecha: '', hora: '', fatal: false, lugar: '', frecuencia: '',
               notas: String(d.notas == null ? '' : d.notas).trim().slice(0, 1000) };
    if (!TIPOS[it.tipo]) return { ok: false, error: 'Elegí qué tipo de ítem es.' };
    if (!it.titulo) return { ok: false, error: 'Escribí de qué se trata.' };
    var aviso = '';
    if (it.tipo === 'VENCIMIENTO' || it.tipo === 'AUDIENCIA') {
      if (!fechaValida(d.fecha)) return { ok: false, error: 'Falta la fecha.' };
      it.fecha = d.fecha;
      if (!esHabil(it.fecha, inhabiles)) aviso = 'Ojo: el ' + dmy(it.fecha) + ' es inhábil (fin de semana, feriado o feria).';
    }
    if (it.tipo === 'VENCIMIENTO') it.fatal = !!d.fatal;
    if (it.tipo === 'AUDIENCIA') {
      if (d.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) return { ok: false, error: 'La hora no es válida.' };
      it.hora = d.hora || '';
    }
    if (it.tipo === 'TAREA') {
      if (!LUGARES[d.lugar]) return { ok: false, error: 'Elegí dónde se hace.' };
      it.lugar = d.lugar;
    }
    if (it.tipo === 'RECURRENTE') {
      if (!FRECUENCIAS[d.frecuencia]) return { ok: false, error: 'Elegí cada cuánto se repite.' };
      it.frecuencia = d.frecuencia;
    }
    return { ok: true, item: it, aviso: aviso };
  }

  return {
    TIPOS: TIPOS, LUGARES: LUGARES, FRECUENCIAS: FRECUENCIAS,
    dmy: dmy, fechaValida: fechaValida, diasEntre: diasEntre, sumarDias: sumarDias, esHabil: esHabil, habilesEntre: habilesEntre, sumarHabiles: sumarHabiles,
    periodo: periodo, recurrenteHecha: recurrenteHecha, estaHecho: estaHecho, nivel: nivel, texto: texto, secciones: secciones,
    alertas: alertas, textoAlertas: textoAlertas, tocaMail: tocaMail, resumenMail: resumenMail, validar: validar
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Agenda;
