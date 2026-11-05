/*
 * Seguimientos especiales (idea de Carlos del 28/10/2026, hecha el 05/11/2026): listas propias de juicios para seguir de cerca,
 * con avisos. Cada lista es una tarjeta; cada juicio tiene una fecha de revisión y avisa si cambió el estado o hubo movimiento
 * nuevo en el MAESTRO desde la última vez que se revisó.
 * Archivo puro: lo usan la app (pantalla y cambios sin conexión), Apps Script (SeguimientosSrv.gs) y el servidor de desarrollo,
 * y se prueba en la Mac con pruebas/prueba_seguimientos.js. Fechas siempre como texto 'AAAA-MM-DD'.
 */
var Seguimientos = (function () {
  'use strict';

  var A = typeof Agenda !== 'undefined' ? Agenda : require('./agenda.js');   // fechas: las mismas reglas que la Agenda

  // Las tres listas con las que arranca (Carlos las puede renombrar, cambiar o borrar).
  var LISTAS_INICIALES = [
    { id: 'juicios', nombre: 'Juicios a seguir de cerca', dias: 7 },
    { id: 'honorarios', nombre: 'Honorarios a seguir', dias: 15 },
    { id: 'vencimientos', nombre: 'Vencimientos a vigilar', dias: 3 }
  ];
  var DIAS_SIN_MOVIMIENTO = 90;   // sin movimiento en el MAESTRO desde hace tanto: aviso
  var MAX_LISTAS = 20;

  function limpio(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
  function dias(n) { return n + (n === 1 ? ' día' : ' días'); }

  function inicial(hoy) {
    return {
      listas: LISTAS_INICIALES.map(function (l, i) { return { id: l.id, nombre: l.nombre, dias: l.dias, orden: i + 1, estado: 'ACTIVA', creado: hoy }; }),
      seguidos: []
    };
  }

  function activas(datos) { return datos.listas.filter(function (l) { return l.estado === 'ACTIVA'; }).sort(function (a, b) { return a.orden - b.orden; }); }
  function activos(datos) { return datos.seguidos.filter(function (s) { return s.estado === 'ACTIVO'; }); }
  function lista(datos, id) { return datos.listas.filter(function (l) { return l.id === id && l.estado === 'ACTIVA'; })[0] || null; }

  /** Lo que recibe la app: solo lo vigente. */
  function paraApp(datos, hoy) { return { ok: true, listas: activas(datos), seguidos: activos(datos), hoy: hoy }; }

  /** Fecha que manda la app (lo hecho sin conexión lleva el día en que se hizo): hasta 60 días atrás; si no, hoy. */
  function fechaHecho(iso, hoy) {
    iso = String(iso || '');
    return A.fechaValida(iso) && iso <= hoy && iso >= A.sumarDias(hoy, -60) ? iso : hoy;
  }

  function validarLista(d) {
    d = d || {};
    var nombre = limpio(d.nombre, 60), n = Number(d.dias);
    if (!nombre) return { ok: false, error: 'Poné un nombre a la lista.' };
    if (!(n >= 1 && n <= 365 && Math.floor(n) === n)) return { ok: false, error: 'Cada cuántos días revisar: un número de 1 a 365.' };
    return { ok: true, lista: { nombre: nombre, dias: n } };
  }

  function validarSeguido(d) {
    d = d || {};
    var it = { lista: String(d.lista || ''), e: limpio(d.e, 40), d: limpio(d.d, 200), nota: String(d.nota == null ? '' : d.nota).trim().slice(0, 1000), revisar: String(d.revisar || '') };
    if (!it.e) return { ok: false, error: 'Elegí el juicio.' };
    if (!it.lista) return { ok: false, error: 'Elegí la lista.' };
    if (it.revisar && !A.fechaValida(it.revisar)) return { ok: false, error: 'La fecha de revisión no es válida.' };
    return { ok: true, item: it };
  }

  function idValido(id) { return /^[\w-]{4,20}$/.test(String(id || '')); }

  /**
   * Aplica un cambio (el mismo pedido que la app manda al servidor) sobre una copia de los datos.
   * Lo usan el servidor, el servidor de desarrollo y la app cuando no hay señal. nuevoId: para lo que llega sin id.
   * @return { ok, error } o { ok, datos, aviso }
   */
  function aplicar(datos, b, hoy, nuevoId) {
    var d = JSON.parse(JSON.stringify(datos));
    var mal = function (t) { return { ok: false, error: t }; };
    var id = function (x) { return idValido(x) ? String(x) : (nuevoId ? nuevoId() : 's' + Date.now().toString(36)); };

    if (b.a === 'segLista') {
      var vl = validarLista(b.lista);
      if (!vl.ok) return vl;
      var lid = b.lista && b.lista.id, actualL = lid ? d.listas.filter(function (l) { return l.id === lid; })[0] : null;
      if (actualL && actualL.estado !== 'ACTIVA') return mal('Esa lista ya no existe.');
      if (lid && !actualL && !b.nuevo) return mal('Esa lista ya no existe.');
      var repetida = activas(d).filter(function (l) { return l.id !== lid && l.nombre.toUpperCase() === vl.lista.nombre.toUpperCase(); })[0];
      if (repetida) return mal('Ya hay una lista con ese nombre.');
      if (actualL) Object.assign(actualL, vl.lista);
      else {
        if (activas(d).length >= MAX_LISTAS) return mal('Son muchas listas (máximo ' + MAX_LISTAS + ').');
        var orden = d.listas.reduce(function (m, l) { return Math.max(m, l.orden); }, 0) + 1;
        d.listas.push(Object.assign({ id: id(lid), orden: orden, estado: 'ACTIVA', creado: fechaHecho(b.creado, hoy) }, vl.lista));
      }
      return { ok: true, datos: d, aviso: actualL ? 'Lista guardada' : 'Lista creada' };
    }

    if (b.a === 'segListaBorrar') {
      var lb = lista(d, b.id);
      if (!lb) return mal('Esa lista ya no existe.');
      lb.estado = 'BORRADA';
      var n = 0;
      d.seguidos.forEach(function (s) { if (s.lista === lb.id && s.estado === 'ACTIVO') { s.estado = 'QUITADO'; n++; } });
      return { ok: true, datos: d, aviso: 'Lista borrada' + (n ? ' (con ' + n + (n === 1 ? ' juicio)' : ' juicios)') : '') };
    }

    if (b.a === 'segGuardar') {
      var v = validarSeguido(b.item);
      if (!v.ok) return v;
      var it = v.item, l = lista(d, it.lista);
      if (!l) return mal('Esa lista ya no existe.');
      var sid = b.item.id, actual = sid ? d.seguidos.filter(function (s) { return s.id === sid; })[0] : null;
      if (actual && actual.estado !== 'ACTIVO') return mal('Ese juicio ya no está en seguimiento.');
      if (sid && !actual && !b.nuevo) return mal('Ese juicio ya no está en seguimiento.');
      var ya = activos(d).filter(function (s) { return s.lista === it.lista && s.e === it.e && s.id !== sid; })[0];
      if (ya) return mal('Ese juicio ya está en "' + l.nombre + '".');
      if (actual) {
        actual.lista = it.lista; actual.nota = it.nota; actual.d = it.d || actual.d;
        if (it.revisar) actual.revisar = it.revisar;
        return { ok: true, datos: d, aviso: 'Guardado' };
      }
      var desde = fechaHecho(b.creado, hoy);
      d.seguidos.push({ id: id(sid), lista: it.lista, e: it.e, d: it.d, nota: it.nota, revisar: it.revisar || A.sumarDias(desde, l.dias),
                        ultRevision: desde, estadoRev: limpio(b.estadoRev, 60), movRev: A.fechaValida(b.movRev) ? b.movRev : '', estado: 'ACTIVO', creado: desde });
      return { ok: true, datos: d, aviso: 'Agregado a "' + l.nombre + '"' };
    }

    if (b.a === 'segMarcar') {
      var s = d.seguidos.filter(function (x) { return x.id === b.id && x.estado === 'ACTIVO'; })[0];
      if (!s) return mal('Ese juicio ya no está en seguimiento.');
      if (b.accion === 'QUITAR') { s.estado = 'QUITADO'; return { ok: true, datos: d, aviso: 'Quitado del seguimiento' }; }
      if (b.accion !== 'REVISADO') return mal('Acción desconocida');
      var f = fechaHecho(b.fecha, hoy), ls = lista(d, s.lista);
      s.ultRevision = f;
      s.revisar = A.sumarDias(f, ls ? ls.dias : 7);
      s.estadoRev = limpio(b.estadoRev, 60);
      s.movRev = A.fechaValida(b.movRev) ? b.movRev : s.movRev;
      return { ok: true, datos: d, aviso: 'Revisado: la próxima es el ' + A.dmy(s.revisar) };
    }
    return mal('Acción desconocida');
  }

  /**
   * Avisos de un juicio seguido. fila = { g: estado del MAESTRO, ultMov: 'AAAA-MM-DD' } o null si no está en el MAESTRO.
   * grave = va al contador de la pestaña.
   */
  function alertas(s, fila, hoy) {
    var r = [];
    if (s.revisar && s.revisar <= hoy) {
      var atraso = A.diasEntre(s.revisar, hoy);
      r.push({ tipo: 'REVISAR', grave: true, texto: atraso ? 'Revisión atrasada ' + dias(atraso) : 'Toca revisar hoy' });
    }
    if (!fila) { r.push({ tipo: 'NO_ESTA', grave: false, texto: 'No aparece en el MAESTRO' }); return r; }
    if (s.estadoRev && fila.g && fila.g !== s.estadoRev) r.push({ tipo: 'ESTADO', grave: true, texto: 'Cambió el estado: ' + s.estadoRev + ' → ' + fila.g });
    if (fila.ultMov && s.movRev && fila.ultMov > s.movRev) r.push({ tipo: 'MOVIMIENTO', grave: false, texto: 'Movimiento nuevo en el MAESTRO (' + A.dmy(fila.ultMov) + ')' });
    else if (fila.ultMov && fila.g !== 'CANCELADO TOTAL') {
      var quieto = A.diasEntre(fila.ultMov, hoy);
      if (quieto >= DIAS_SIN_MOVIMIENTO) r.push({ tipo: 'SIN_MOV', grave: false, texto: 'Sin movimiento hace ' + dias(quieto) });
    }
    return r;
  }

  /** "Toca revisar hoy" · "Revisión atrasada…" · "Próxima revisión: 12/11 (en 7 días)". */
  function textoRevision(s, hoy) {
    if (!s.revisar) return '';
    var n = A.diasEntre(hoy, s.revisar);
    if (n < 0) return 'Revisión atrasada ' + dias(-n) + ' (' + A.dmy(s.revisar) + ')';
    if (n === 0) return 'Toca revisar hoy';
    return 'Próxima revisión: ' + A.dmy(s.revisar) + (n === 1 ? ' (mañana)' : ' (en ' + dias(n) + ')');
  }

  /** Los de una lista, con sus avisos: primero lo grave, después lo que tiene novedades, después por fecha de revisión. */
  function deLista(datos, listaId, filaDe, hoy) {
    return activos(datos).filter(function (s) { return s.lista === listaId; }).map(function (s) {
      var al = alertas(s, filaDe(s.e), hoy);
      return { s: s, alertas: al, graves: al.filter(function (a) { return a.grave; }).length };
    }).sort(function (a, b) {
      return (b.graves - a.graves) || (b.alertas.length - a.alertas.length) || (a.s.revisar < b.s.revisar ? -1 : a.s.revisar > b.s.revisar ? 1 : 0);
    });
  }

  /** Lo que dice la tarjeta de cada lista. */
  function resumenLista(datos, l, filaDe, hoy) {
    var xs = deLista(datos, l.id, filaDe, hoy);
    var graves = xs.filter(function (x) { return x.graves; }).length, novedades = xs.filter(function (x) { return !x.graves && x.alertas.length; }).length;
    var r = { numero: xs.length, unidad: xs.length === 1 ? 'juicio' : 'juicios', info: [], graves: graves };
    if (graves) r.alerta = '⚠ ' + graves + ' para revisar';
    if (novedades) r.info.push(novedades + ' con novedades');
    if (!xs.length) r.info.push('Vacía');
    else if (!graves) {
      var prox = xs.map(function (x) { return x.s.revisar; }).filter(Boolean).sort()[0];
      if (prox) r.info.push('Próxima revisión: ' + A.dmy(prox).slice(0, 5));
    }
    r.info.push('Revisar cada ' + dias(l.dias));
    return r;
  }

  /** Para el contador de la pestaña: juicios con algo grave (toca revisar o cambió el estado). */
  function contarGraves(datos, filaDe, hoy) {
    var n = 0;
    activas(datos).forEach(function (l) { n += deLista(datos, l.id, filaDe, hoy).filter(function (x) { return x.graves; }).length; });
    return n;
  }

  /** Mail de la mañana: lo que toca revisar hoy o está atrasado. null si no hay nada. */
  function resumenMail(datos, hoy, urlApp) {
    var nombres = {};
    activas(datos).forEach(function (l) { nombres[l.id] = l.nombre; });
    var xs = activos(datos).filter(function (s) { return nombres[s.lista] && s.revisar && s.revisar <= hoy; })
      .sort(function (a, b) { return a.revisar < b.revisar ? -1 : a.revisar > b.revisar ? 1 : 0; });
    if (!xs.length) return null;
    var lineas = xs.map(function (s) {
      return '• ' + (s.d ? s.d + ' — ' : '') + 'Expte. ' + s.e + ' (' + nombres[s.lista] + ')\n  ' + textoRevision(s, hoy) + (s.nota ? '\n  Nota: ' + s.nota : '');
    });
    return { asunto: 'Seguimientos: ' + xs.length + (xs.length === 1 ? ' juicio para revisar' : ' juicios para revisar'),
             cuerpo: lineas.join('\n\n') + (urlApp ? '\n\nAbrir los seguimientos: ' + urlApp : ''), cantidad: xs.length };
  }

  return {
    LISTAS_INICIALES: LISTAS_INICIALES, DIAS_SIN_MOVIMIENTO: DIAS_SIN_MOVIMIENTO,
    inicial: inicial, activas: activas, activos: activos, lista: lista, paraApp: paraApp, fechaHecho: fechaHecho,
    validarLista: validarLista, validarSeguido: validarSeguido, aplicar: aplicar,
    alertas: alertas, textoRevision: textoRevision, deLista: deLista, resumenLista: resumenLista, contarGraves: contarGraves, resumenMail: resumenMail
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Seguimientos;
