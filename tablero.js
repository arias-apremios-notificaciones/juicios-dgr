/**
 * tablero.js — Pestaña TABLERO (pedido de Carlos, 04/11/2026): los números de los juicios y de los honorarios.
 *
 * Juicios: se calculan acá con los datos del MAESTRO que ya tiene la app (ESTADO, expediente y SEGUIMIENTO).
 *   Cada línea fechada del SEGUIMIENTO es un movimiento; según cómo empieza se cuenta como escrito, demanda,
 *   sentencia o ejecución (ver RE). La sentencia de un juicio se cuenta una sola vez, en el mes de la primera línea.
 * Honorarios: llegan calculados del servidor (Honorarios.js → estadisticas) y solo con el PIN.
 * Gráficos: una sola serie y un solo color por gráfico; cada uno con su tabla ("Ver tabla").
 */
var Tablero = (function () {
  'use strict';

  function B() { return typeof Buscador !== 'undefined' ? Buscador : require('./buscar.js'); }
  function sinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

  var RE = {
    demanda: /^(INICIO|INICIE|PRESENTO|PRESENTE) (LA )?DEMANDA/,
    sentencia: /^(SALIO|SALIERON) (LA )?SENTENCIA|^SE (DICTO|NOTIFICO) (LA )?SENTENCIA|^(HAY|TIENE) SENTENCIA|^SENTENCIA (FIRME|NOTIFICADA)/,
    ejecucion: /^EJECUTO|^(PIDO|SOLICITO) (NUEVO |NUEVAMENTE |SE LIBRE |SE LIBREN )?(EMBARGO|MANDAMIENTO|OFICIOS? PARA EJECUTAR)|^ENTREGO (EL |NUEVO )?MANDAMIENTO|^ENTREGO A OFICIALES|^SE (TRABO|LIBRO) (EL )?(EMBARGO|MANDAMIENTO)|^(PIDO|SOLICITO) ORDEN DE PAGO/,
    escrito: /^(PIDO|PRESENTO|SOLICITO|DEVUELVO|ACOMPANO|ADJUNTO|COMUNICO|EJECUTO|INICIO DEMANDA|PLANTEO|CONTESTO|ACTUALIZO|HAGO ESCRITO|ESCRITO WEB|REITERO|INTERPONGO|APELO|DENUNCIO|ACREDITO|DESISTO|ACUSO|AMPLIO|OFREZCO|MANIFIESTO|SE LIBRE|SE LIBREN)\b/
  };
  var ESTADOS_SENTENCIA = ['SENTENCIA', 'EJECUCION', 'HONORARIOS PENDIENTES', 'PLANILLA FISCAL'];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** Qué es una línea del SEGUIMIENTO. "IDEM" repite lo de la línea anterior del mismo juicio. */
  function clasificar(texto, anterior) {
    var t = sinTildes(texto).replace(/^[\s\-•·]+/, '').trim();
    if (/^IDEM\b/.test(t) && anterior) return anterior;
    return {
      escrito: RE.escrito.test(t) || RE.demanda.test(t),
      demanda: RE.demanda.test(t),
      sentencia: RE.sentencia.test(t),
      ejecucion: RE.ejecucion.test(t)
    };
  }

  /** Los últimos n meses ('aaaa-mm'), del más viejo al actual. */
  function ultimosMeses(hoy, n) {
    var a = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7)) - 1, out = [];
    for (var k = n - 1; k >= 0; k--) {
      var mm = m - k, aa = a + Math.floor(mm / 12);
      mm = ((mm % 12) + 12) % 12;
      out.push(aa + '-' + ('0' + (mm + 1)).slice(-2));
    }
    return out;
  }

  function mesDe(ddmmaaaa) { var p = String(ddmmaaaa || '').split('/'); return p.length === 3 ? p[2] + '-' + p[1] : ''; }

  /**
   * @param filas  juicios del MAESTRO ({ d, e, f (seguimiento), g (estado) })
   * @param hoy    'aaaa-mm-dd'
   * @return { total, enTramite, conSentencia, enEjecucion, cancelados, porEstado: [{ estado, cantidad }],
   *           porAnio: [{ anio, cantidad }], sinNumero, porMes: [{ mes, movimientos, escritos, demandas, sentencias, ejecuciones }] }
   */
  function juicios(filas, hoy, n) {
    var meses = ultimosMeses(hoy, n || 12), idx = {};
    var porMes = meses.map(function (m, i) { idx[m] = i; return { mes: m, movimientos: 0, escritos: 0, demandas: 0, sentencias: 0, ejecuciones: 0 }; });
    var r = { total: filas.length, enTramite: 0, conSentencia: 0, enEjecucion: 0, cancelados: 0, sinNumero: 0, porMes: porMes };
    var estados = {}, anios = {};
    filas.forEach(function (f) {
      var g = sinTildes(f.g).trim() || 'SIN ESTADO';
      estados[g] = (estados[g] || 0) + 1;
      if (/^CANCELADO/.test(g)) r.cancelados++; else r.enTramite++;
      if (g === 'EJECUCION') r.enEjecucion++;
      var clave = B().exptesDe(f.e)[0];
      if (clave) { var an = 2000 + Number(clave.split('/')[1]); anios[an] = (anios[an] || 0) + 1; } else r.sinNumero++;
      var lineas = B().seguimiento(f.f).slice().reverse(), anterior = null, primeraSentencia = '';
      lineas.forEach(function (l) {
        var c = clasificar(l.texto, anterior);
        anterior = c;
        if (!l.fecha) return;
        var mes = mesDe(l.fecha);
        if (c.sentencia && !primeraSentencia) primeraSentencia = mes;
        if (!(mes in idx)) return;
        var x = porMes[idx[mes]];
        x.movimientos++;
        if (c.escrito) x.escritos++;
        if (c.demanda) x.demandas++;
        if (c.ejecucion) x.ejecuciones++;
      });
      if (primeraSentencia && primeraSentencia in idx) porMes[idx[primeraSentencia]].sentencias++;
      if (primeraSentencia || ESTADOS_SENTENCIA.indexOf(g) >= 0) r.conSentencia++;
    });
    r.porEstado = Object.keys(estados).map(function (k) { return { estado: k, cantidad: estados[k] }; }).sort(function (a, b) { return b.cantidad - a.cantidad; });
    r.porAnio = Object.keys(anios).map(function (k) { return { anio: Number(k), cantidad: anios[k] }; }).sort(function (a, b) { return a.anio - b.anio; });
    return r;
  }

  // ═══════════════════════ DIBUJO ═══════════════════════
  var SVG = 'http://www.w3.org/2000/svg';
  function s(tag, at) { var e = document.createElementNS(SVG, tag); Object.keys(at || {}).forEach(function (k) { e.setAttribute(k, at[k]); }); return e; }
  function etiquetaMes(m, corta) { var i = Number(m.slice(5, 7)) - 1; return corta ? MESES[i] + (i === 0 ? ' ' + m.slice(2, 4) : '') : MESES_LARGO[i] + ' ' + m.slice(0, 4); }
  function cantidad(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function techo(max) {                                  // un máximo "redondo" para el eje
    if (!(max > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(max))), x = max / p;
    var pasos = [1, 2, 3, 4, 5, 6, 8, 10];               // con mitad exacta (sin "12,5" escrito como "13")
    for (var i = 0; i < pasos.length; i++) if (x <= pasos[i] + 1e-9) return pasos[i] * p;
    return 10 * p;
  }
  function compacto(n, plata) {
    var t = n >= 1e6 ? (Math.round(n / 1e5) / 10).toString().replace('.', ',') + ' M' : n >= 1e4 ? Math.round(n / 1e3) + ' mil' : cantidad(n);
    return (plata ? '$ ' : '') + t;
  }

  /**
   * Columnas de una sola serie (meses o años).
   * o: { h, titulo, nota, datos: [{ etiqueta, corta, valor, tip }], plata (bool), formato (valor → texto) }
   */
  function columnas(o) {
    var h = o.h, fmt = o.formato || cantidad;
    var caja = h('div', { class: 'tab-grafico' }), tip = h('div', { class: 'tab-tip', role: 'status', hidden: true });
    var lienzo = h('div', { class: 'tab-lienzo' });
    caja.appendChild(h('div', { class: 'tab-titulo' }, h('b', { text: o.titulo }), o.nota ? h('span', { text: o.nota }) : null));
    caja.appendChild(lienzo);
    lienzo.appendChild(tip);
    var tabla = h('table', { class: 'tab-tabla' }, h('thead', null, h('tr', null, h('th', { text: o.columna || 'Mes' }), h('th', { text: o.titulo }))),
      h('tbody', null, o.datos.map(function (d) { return h('tr', null, h('td', { text: d.etiqueta }), h('td', { text: fmt(d.valor) })); })));
    caja.appendChild(h('details', { class: 'tab-ver-tabla' }, h('summary', { text: 'Ver tabla' }), tabla));
    // Se dibuja cuando ya está en pantalla, con el ancho real (en el teléfono el texto no se achica).
    caja.dibujar = function () {
      var W = Math.max(280, lienzo.clientWidth || 320), H = 170, arriba = 22, abajo = 24, izq = 4, der = 4;
      var n = o.datos.length, banda = (W - izq - der) / n, ancho = Math.min(24, Math.max(6, banda * 0.62));
      var max = techo(Math.max.apply(null, o.datos.map(function (d) { return d.valor; }).concat([0])));
      var y = function (v) { return arriba + (H - arriba - abajo) * (1 - v / max); }, base = y(0);
      var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.titulo });
      [0.5, 1].forEach(function (k) {
        if (!o.plata && max * k !== Math.round(max * k)) return;   // en cantidades, la línea del medio solo si es un número entero
        svg.appendChild(s('line', { x1: izq, x2: W - der, y1: y(max * k), y2: y(max * k), class: 'tab-grilla' }));
        var t = s('text', { x: izq, y: y(max * k) - 4, class: 'tab-eje' }); t.textContent = compacto(max * k, o.plata); svg.appendChild(t);
      });
      svg.appendChild(s('line', { x1: izq, x2: W - der, y1: base, y2: base, class: 'tab-base' }));
      var iMax = 0;
      o.datos.forEach(function (d, i) { if (d.valor > o.datos[iMax].valor) iMax = i; });
      o.datos.forEach(function (d, i) {
        var x = izq + banda * i + (banda - ancho) / 2, top = y(d.valor), alto = base - top, r = Math.min(4, alto);
        if (d.valor > 0) {
          svg.appendChild(s('path', { class: 'tab-barra', d: 'M' + x + ',' + base + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
            'H' + (x + ancho - r) + 'Q' + (x + ancho) + ',' + top + ' ' + (x + ancho) + ',' + (top + r) + 'V' + base + 'Z' }));
        }
        if ((i === iMax || i === n - 1) && d.valor > 0) {     // solo dos números escritos: el más alto y el último
          var v = s('text', { x: x + ancho / 2, y: top - 5, class: 'tab-valor', 'text-anchor': 'middle' }); v.textContent = compacto(d.valor, o.plata); svg.appendChild(v);
        }
        if (banda >= 40 || (n - 1 - i) % 2 === 0) {          // angosto (teléfono): un mes sí y uno no, siempre con el último
          var e = s('text', { x: x + ancho / 2, y: H - 7, class: 'tab-eje', 'text-anchor': 'middle' }); e.textContent = d.corta; svg.appendChild(e);
        }
        var zona = s('rect', { x: izq + banda * i, y: 0, width: banda, height: H, class: 'tab-zona', tabindex: '0', 'aria-label': d.etiqueta + ': ' + fmt(d.valor) });
        var mostrar = function () {
          tip.textContent = d.etiqueta + ': ' + fmt(d.valor) + (d.tip ? ' · ' + d.tip : '');
          tip.hidden = false;
          var izqTip = Math.min(Math.max(0, x + ancho / 2 - 90), W - 180);
          tip.style.left = izqTip + 'px'; tip.style.top = Math.max(0, top - 52) + 'px';
        };
        zona.addEventListener('pointerenter', mostrar); zona.addEventListener('click', mostrar); zona.addEventListener('focus', mostrar);
        zona.addEventListener('pointerleave', function () { tip.hidden = true; }); zona.addEventListener('blur', function () { tip.hidden = true; });
        svg.appendChild(zona);
      });
      Array.prototype.slice.call(lienzo.querySelectorAll('svg')).forEach(function (x) { x.remove(); });
      lienzo.appendChild(svg);
    };
    return caja;
  }

  /** Barras horizontales con el número al lado (estados, modos de pago, tramos). datos: [{ etiqueta, valor, texto }] */
  function barras(o) {
    var h = o.h, max = Math.max.apply(null, o.datos.map(function (d) { return d.valor; }).concat([1]));
    return h('div', { class: 'tab-grafico' },
      h('div', { class: 'tab-titulo' }, h('b', { text: o.titulo }), o.nota ? h('span', { text: o.nota }) : null),
      h('div', { class: 'tab-barras', role: 'list' }, o.datos.map(function (d) {
        return h('div', { class: 'tab-fila', role: 'listitem' },
          h('span', { class: 'tab-etq', text: d.etiqueta }),
          h('span', { class: 'tab-pista' }, h('span', { class: 'tab-relleno', style: 'width:' + Math.max(d.valor > 0 ? 1.5 : 0, d.valor / max * 100) + '%' })),
          h('span', { class: 'tab-num', text: d.texto }));
      })));
  }

  function tarjetas(h, lista) {
    return h('div', { class: 'tab-tiles' }, lista.map(function (t) {
      return h('div', { class: 'tab-tile' }, h('div', { class: 'tab-tile-num', text: t.numero }), h('div', { class: 'tab-tile-etq', text: t.etiqueta }),
        t.sub ? h('div', { class: 'tab-tile-sub', text: t.sub }) : null);
    }));
  }

  /**
   * ctx: { h, filas, hoy 'aaaa-mm-dd', generado (fecha de los datos), hon (estadísticas de honorarios o null),
   *        honPendiente (total por cobrar), importe (n → '$ …'), irAHonorarios () }
   */
  function pintar(cont, ctx) {
    var h = ctx.h, J = juicios(ctx.filas, ctx.hoy, 12), graficos = [];
    cont.textContent = '';
    var mesesDe = function (campo, tipTxt) {
      return J.porMes.map(function (x) { return { etiqueta: etiquetaMes(x.mes), corta: etiquetaMes(x.mes, true), valor: x[campo], tip: tipTxt ? tipTxt(x) : '' }; });
    };
    var add = function (g) { graficos.push(g); return g; };

    cont.appendChild(h('div', { class: 'anio' }, 'Juicios', h('small', { text: 'según el MAESTRO' + (ctx.generado ? ' · datos del ' + new Date(ctx.generado).toLocaleDateString('es-AR') : '') })));
    cont.appendChild(tarjetas(h, [
      { numero: cantidad(J.total), etiqueta: 'Juicios' },
      { numero: cantidad(J.enTramite), etiqueta: 'En trámite', sub: 'sin cancelar' },
      { numero: cantidad(J.conSentencia), etiqueta: 'Con sentencia' },
      { numero: cantidad(J.enEjecucion), etiqueta: 'En ejecución' },
      { numero: cantidad(J.cancelados), etiqueta: 'Cancelados', sub: 'total o parcial' }
    ]));
    cont.appendChild(add(columnas({ h: h, titulo: 'Escritos por mes', nota: 'últimos 12 meses', datos: mesesDe('escritos', function (x) { return cantidad(x.movimientos) + ' movimientos en total'; }) })));
    cont.appendChild(add(columnas({ h: h, titulo: 'Movimientos por mes', nota: 'todas las líneas fechadas del SEGUIMIENTO', datos: mesesDe('movimientos') })));
    cont.appendChild(add(columnas({ h: h, titulo: 'Sentencias por mes', nota: 'juicios con su primera sentencia en ese mes', datos: mesesDe('sentencias') })));
    cont.appendChild(add(columnas({ h: h, titulo: 'Gestiones de ejecución por mes', nota: 'ejecuto, embargo, mandamiento, orden de pago', datos: mesesDe('ejecuciones') })));
    cont.appendChild(add(columnas({ h: h, titulo: 'Demandas iniciadas por mes', datos: mesesDe('demandas') })));
    cont.appendChild(barras({ h: h, titulo: 'Juicios por estado', datos: J.porEstado.map(function (x) { return { etiqueta: x.estado, valor: x.cantidad, texto: cantidad(x.cantidad) }; }) }));
    cont.appendChild(add(columnas({ h: h, titulo: 'Juicios por año del expediente', columna: 'Año', nota: J.sinNumero ? J.sinNumero + ' sin número de expediente' : '',
      datos: J.porAnio.map(function (x) { return { etiqueta: String(x.anio), corta: "'" + String(x.anio).slice(2), valor: x.cantidad }; }) })));

    cont.appendChild(h('div', { class: 'anio' }, 'Honorarios', h('small', { text: 'según la planilla HONORARIOS' })));
    var E = ctx.hon;
    if (!E) {
      cont.appendChild(h('div', { class: 'panel' }, h('p', { class: 'ayuda', text: 'Los números de honorarios se ven después de entrar con el PIN en la pestaña Honorarios.' }),
        h('button', { class: 'btn primario', type: 'button', onclick: ctx.irAHonorarios }, 'Ir a Honorarios')));
    } else {
      var pm = E.porMes, ult = pm[pm.length - 1], ant = pm[pm.length - 2];
      var cobros12 = pm.reduce(function (t, x) { return t + x.cobros; }, 0), total12 = pm.reduce(function (t, x) { return t + x.total; }, 0);
      var antAnt = pm[pm.length - 3];
      var variacion = antAnt && antAnt.total > 0 ? (ant.total >= antAnt.total ? '+' : '−') + Math.round(Math.abs(ant.total - antAnt.total) / antAnt.total * 100) + '% contra ' + etiquetaMes(antAnt.mes) : '';
      var pesos = function (n) { return '$ ' + cantidad(n); };   // en las tarjetas, sin centavos (entran en una línea en el teléfono)
      cont.appendChild(tarjetas(h, [
        { numero: pesos(E.anio.total), etiqueta: 'Cobrado en ' + E.anio.anio, sub: E.anio.cobros + (E.anio.cobros === 1 ? ' cobro' : ' cobros') },
        { numero: pesos(ant.total), etiqueta: 'Cobrado en ' + etiquetaMes(ant.mes), sub: variacion },
        { numero: pesos(ult.total), etiqueta: 'Cobrado en ' + etiquetaMes(ult.mes), sub: 'mes en curso' },
        { numero: pesos(ctx.honPendiente || 0), etiqueta: 'Por cobrar' },
        { numero: cobros12 ? pesos(total12 / cobros12) : '—', etiqueta: 'Promedio por cobro', sub: 'últimos 12 meses' }
      ]));
      cont.appendChild(add(columnas({ h: h, titulo: 'Cobrado por mes', nota: 'con FECHA DE PAGO (las cuotas, en el mes en que se cobraron)', plata: true, formato: ctx.importe,
        datos: pm.map(function (x, i) {
          var prev = pm[i - 1], dif = prev ? x.total - prev.total : null;
          return { etiqueta: etiquetaMes(x.mes), corta: etiquetaMes(x.mes, true), valor: x.total,
                   tip: x.cobros + (x.cobros === 1 ? ' cobro' : ' cobros') + (dif !== null ? ' · ' + (dif >= 0 ? '+' : '−') + ctx.importe(Math.abs(dif)) + ' contra el mes anterior' : '') };
        }) })));
      cont.appendChild(add(columnas({ h: h, titulo: 'Cantidad de cobros por mes', datos: pm.map(function (x) { return { etiqueta: etiquetaMes(x.mes), corta: etiquetaMes(x.mes, true), valor: x.cobros }; }) })));
      if (E.modos.length) cont.appendChild(barras({ h: h, titulo: 'Por modo de pago', nota: 'últimos 12 meses',
        datos: E.modos.map(function (m) { return { etiqueta: m.modo, valor: m.total, texto: ctx.importe(m.total) + ' · ' + m.cobros }; }) }));
      cont.appendChild(barras({ h: h, titulo: 'Pendientes por monto', nota: E.sinMonto ? E.sinMonto + ' pendientes sin monto cargado no entran' : '',
        datos: E.tramos.map(function (t) { return { etiqueta: t.tramo, valor: t.cantidad, texto: t.cantidad + ' · ' + ctx.importe(t.total) }; }) }));
    }
    cont.appendChild(h('p', { class: 'ayuda chica', text: 'Cómo se cuenta: cada línea con fecha del SEGUIMIENTO es un movimiento. Es escrito si empieza con PIDO, PRESENTO, SOLICITO, DEVUELVO, ACOMPAÑO, ADJUNTO, COMUNICO, EJECUTO, PLANTEO, CONTESTO, ACTUALIZO, REITERO o INICIO DEMANDA ("IDEM" cuenta como la línea anterior). Sentencia: "SALIÓ SENTENCIA", "SE NOTIFICÓ SENTENCIA"… Con sentencia: tiene esa línea o su ESTADO es SENTENCIA, EJECUCIÓN, HONORARIOS PENDIENTES o PLANILLA FISCAL. Tocá una barra para ver el número.' }));
    graficos.forEach(function (g) { g.dibujar(); });
  }

  return { clasificar: clasificar, ultimosMeses: ultimosMeses, juicios: juicios, techo: techo, pintar: pintar };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Tablero;
