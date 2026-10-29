/*
 * imprimir.js — Impresión de lo que muestra la app (formatos validados por Carlos el 29/10/2026).
 * Cada tipo de documento tiene su propio formato. Todos en A4 (vertical u horizontal según el tipo),
 * con pie "Dr. Carlos E. Arias · Apoderado Fiscal DGR · Mat. 4831 · fecha".
 * En el iPhone, "Imprimir" abre el menú del sistema: impresora AirPrint o "Guardar como PDF".
 * Los escritos NO pasan por acá: se imprime su PDF tal cual (formato judicial).
 */
var Impresion = (function () {
  'use strict';

  var PIE = 'Dr. Carlos E. Arias · Apoderado Fiscal DGR · Mat. 4831';

  // ───────── Utilidades ─────────
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v);
    });
    function agregar(x) {
      if (x == null || x === false) return;
      if (Array.isArray(x)) return x.forEach(agregar);                   // listas anidadas (p. ej. un bloque por año)
      el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
    }
    for (var i = 2; i < arguments.length; i++) agregar(arguments[i]);
    return el;
  }
  function pesos(v) {
    if (v == null || v === '' || isNaN(Number(v))) return '—';
    return '$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function fIso(i) { return i ? i.slice(8, 10) + '/' + i.slice(5, 7) + '/' + i.slice(0, 4) : ''; }
  function cuit(c) { c = String(c || ''); return c.length === 11 ? c.slice(0, 2) + '-' + c.slice(2, 10) + '-' + c.slice(10) : c; }
  function ahora() { var d = new Date(); return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }

  /** Número a letras (pesos): 1039519.69 → "UN MILLÓN TREINTA Y NUEVE MIL QUINIENTOS DIECINUEVE CON 69/100". */
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
  function enLetras(v) {
    var n = Math.round(Number(v) * 100), ent = Math.floor(n / 100), cent = n % 100, partes = [];
    var mill = Math.floor(ent / 1000000), miles = Math.floor((ent % 1000000) / 1000), resto = ent % 1000;
    if (mill) partes.push(mill === 1 ? 'UN MILLÓN' : (mill >= 1000 ? enLetras(mill).replace(/ CON .*$/, '') : hasta999(mill)) + ' MILLONES');
    if (miles) partes.push(miles === 1 ? 'MIL' : hasta999(miles) + ' MIL');
    if (resto) partes.push(hasta999(resto));
    return (partes.length ? partes.join(' ') : 'CERO') + ' CON ' + ('0' + cent).slice(-2) + '/100';
  }

  function tabla(cols, filas, pie) {
    return h('table', { class: 'imp-tabla' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: c.num ? 'num' : (c.chk ? 'chk' : null), text: c.t }); }))),
      h('tbody', null, filas.map(function (f) { return h('tr', null, f.map(function (v, i) { return h('td', { class: cols[i].num ? 'num' : (cols[i].chk ? 'chk' : null) }, v == null ? '' : v); })); })),
      pie ? h('tfoot', null, h('tr', null, pie.map(function (v, i) { return h('td', { class: cols[i] && cols[i].num ? 'num' : null }, v == null ? '' : v); }))) : null);
  }

  // ───────── Motor de impresión ─────────
  function imprimir(doc) {
    var cont = document.getElementById('impresion');
    if (!cont) { cont = h('div', { id: 'impresion' }); document.body.appendChild(cont); }
    cont.textContent = '';
    var estilo = document.getElementById('imp-pagina');
    if (!estilo) { estilo = h('style', { id: 'imp-pagina' }); document.head.appendChild(estilo); }
    estilo.textContent = '@page { size: A4 ' + (doc.horizontal ? 'landscape' : 'portrait') + '; margin: 14mm 14mm 18mm; }';
    cont.className = 'imp-' + doc.tipo + (doc.horizontal ? ' imp-horizontal' : '');
    cont.appendChild(h('header', { class: 'imp-cab' },
      doc.marca ? h('div', { class: 'imp-marca', text: doc.marca }) : null,
      h('h1', { text: doc.titulo }),
      (doc.lineas || []).filter(Boolean).map(function (l) { return h('div', { class: 'imp-linea', text: l }); })));
    cont.appendChild(h('section', { class: 'imp-cuerpo' }, doc.cuerpo));
    cont.appendChild(h('footer', { class: 'imp-pie', text: PIE + ' · Impreso el ' + ahora() }));
    setTimeout(function () { window.print(); }, 50);
  }

  // ───────── 1. Detalle de deuda (para entregar al demandado) ─────────
  function deuda(d, f) {
    var filas = d.boletas.map(function (b) {
      return [b.numero, [b.impuesto, b.detalle].filter(Boolean).join(' — ') +
              (b.original != null ? ' (original ' + pesos(b.original) + ' + intereses ' + pesos(b.intereses) + (b.al ? ' al ' + b.al : '') + ')' : ''),
              b.padron.replace(/^(Padrón|Dominio) /, ''), b.periodos, b.importe != null ? pesos(b.importe) : '—'];
    });
    imprimir({
      tipo: 'deuda', titulo: 'DETALLE DE LA DEUDA',
      lineas: [d.caratula || ('PROVINCIA DE TUCUMÁN –D.G.R.– C/ ' + f.d + ' S/ EJECUCIÓN FISCAL'), 'Expte. N° ' + f.e + (d.juzgado ? ' · ' + d.juzgado : ''),
               'Demandado: ' + (d.demandado || f.d) + (d.cuit ? ' · CUIT ' + cuit(d.cuit) : ''), d.domicilio ? 'Domicilio: ' + d.domicilio : '',
               'Demanda presentada el ' + (d.fechaDemanda || '—') + (d.exptesAdm && d.exptesAdm.length ? ' · Expte. administrativo ' + d.exptesAdm.join(', ') : '')],
      cuerpo: [
        tabla([{ t: 'Boleta de deuda' }, { t: 'Impuesto / concepto' }, { t: 'Padrón / dominio' }, { t: 'Períodos' }, { t: 'Importe', num: true }], filas,
              ['', 'TOTAL RECLAMADO EN LA DEMANDA', '', '', pesos(d.total)]),
        d.total != null ? h('p', { class: 'imp-letras', text: 'Son PESOS ' + enLetras(d.total) + '.' }) : null,
        h('p', { class: 'imp-nota', text: 'Importes a la fecha de emisión de las boletas de deuda. Se adicionan los intereses resarcitorios y punitorios hasta la fecha de efectivo pago, más las costas del juicio. Documento informativo: no constituye liquidación ni libre deuda.' })]
    });
  }

  // ───────── 2. Estado del juicio (la ficha de Buscar; uso interno) ─────────
  function ficha(f, seguimiento, sae, deudaJ) {
    var ult = f.k ? fIso(f.k) : (seguimiento[0] && seguimiento[0].fecha) || '—';
    var datos = [['Deudor', f.d], ['CUIT', cuit(f.c) || '—'], ['Expediente', f.e + (f.n ? ' · Nominación ' + f.n : '')],
                 ['Juzgado (SAE)', sae && sae.juzgado ? sae.juzgado : '—'], ['Importe demandado', pesos(f.i)],
                 ['Último movimiento', ult], ['Fila del MAESTRO', String(f.r)]];
    var cuerpo = [h('div', { class: 'imp-estado' }, h('span', { text: 'ESTADO' }), h('b', { text: f.g || 'SIN ESTADO' })),
                  h('table', { class: 'imp-datos' }, h('tbody', null, datos.map(function (x) { return h('tr', null, h('th', { text: x[0] }), h('td', { text: x[1] })); }))),
                  h('h2', { text: 'Seguimiento (MAESTRO)' }),
                  seguimiento.length ? tabla([{ t: 'Fecha' }, { t: 'Movimiento' }], seguimiento.map(function (l) { return [l.fecha || '—', l.texto]; })) : h('p', { text: 'Sin seguimiento cargado.' })];
    if (sae && sae.movs && sae.movs.length) {
      cuerpo.push(h('h2', { text: 'Movimientos en el SAE' + (sae.total ? ' (últimos ' + sae.movs.length + ' de ' + sae.total + ')' : '') }));
      cuerpo.push(tabla([{ t: 'Fecha' }, { t: 'Movimiento' }], sae.movs.map(function (m) { return [m.fecha, m.desc]; })));
    } else cuerpo.push(h('p', { class: 'imp-nota', text: 'Movimientos del SAE: no consultados.' }));
    if (deudaJ && deudaJ.encontrado) {
      cuerpo.push(h('h2', { text: 'Deuda reclamada (boletas de la demanda)' }));
      cuerpo.push(tabla([{ t: 'Boleta' }, { t: 'Impuesto' }, { t: 'Padrón / dominio' }, { t: 'Importe', num: true }],
                        deudaJ.boletas.map(function (b) { return [b.numero, b.impuesto, b.padron.replace(/^(Padrón|Dominio) /, ''), b.importe != null ? pesos(b.importe) : '—']; }),
                        ['', 'TOTAL RECLAMADO', '', pesos(deudaJ.total)]));
    }
    imprimir({ tipo: 'ficha', marca: 'USO INTERNO', titulo: 'ESTADO DEL JUICIO', lineas: [sae && sae.caratula ? sae.caratula : f.d, 'Expte. N° ' + f.e], cuerpo: cuerpo });
  }

  // ───────── 4. Lista "Para firmar" (hoja de control, horizontal) ─────────
  function paraFirmar(lista) {
    var anios = {};
    lista.forEach(function (x) { (anios[x.anio] = anios[x.anio] || []).push(x); });
    var cuerpo = Object.keys(anios).sort(function (a, b) { return b - a; }).map(function (a) {
      return [h('h2', { text: 'Juicios ' + a + ' (' + anios[a].length + ')' }),
              tabla([{ t: '✓', chk: true }, { t: 'Expte.' }, { t: 'Deudor' }, { t: 'Escrito' }, { t: 'Motivo' }, { t: 'Adjunto' }],
                    anios[a].map(function (x) { return ['☐', x.e, x.d, x.tipo, x.motivo + (x.aviso ? ' — ⚠ ' + x.aviso : ''), x.arca ? (x.adjunto ? 'IVP' : 'ARCA') : 'falta'] }))];
    });
    imprimir({ tipo: 'firmar', horizontal: true, marca: 'USO INTERNO', titulo: 'ESCRITOS PARA FIRMAR', lineas: [lista.length + ' escritos · tildá cada uno al firmarlo y subirlo al SAE'], cuerpo: cuerpo });
  }

  // ───────── 5. Revisión manual / ya con sentencia ─────────
  function revision(titulo, lista) {
    imprimir({ tipo: 'revision', marca: 'USO INTERNO', titulo: titulo.toUpperCase(), lineas: [lista.length + ' juicios'],
      cuerpo: tabla([{ t: 'Expte.' }, { t: 'Deudor' }, { t: 'Estado (MAESTRO)' }, { t: 'Motivo' }],
                    lista.map(function (x) { return [x.e, x.d, x.g || '', (x.motivo || '') + (x.detalle ? ' — ' + x.detalle : '') + (x.sentencia ? ' (sentencia del ' + x.sentencia + ')' : '')]; })) });
  }

  // ───────── 6. Proveído / documento leído del SAE ─────────
  function documentoSae(titulo, texto, f) {
    imprimir({ tipo: 'doc', titulo: 'DOCUMENTO DEL SAE', lineas: [f ? f.d + ' · Expte. N° ' + f.e : '', titulo],
      cuerpo: h('div', { class: 'imp-texto', text: texto }) });
  }

  // ───────── 7. Reporte mensual de honorarios cobrados ─────────
  function cobrosMes(m) {
    var cuerpo = [tabla([{ t: 'Fecha' }, { t: 'Demandado' }, { t: 'Expte.' }, { t: 'Modo de pago' }, { t: 'Factura / recibo' }, { t: 'Monto', num: true }],
                        m.registrados.map(function (x) { return [fIso(x.pago), x.d, x.e, x.modo || '', x.factura || '', pesos(x.monto)]; }),
                        ['', 'TOTAL (' + m.registrados.length + (m.registrados.length === 1 ? ' cobro)' : ' cobros)'), '', '', '', pesos(m.total)])];
    if (m.enTexto.length) {
      cuerpo.push(h('h2', { text: 'Para verificar: cobros mencionados en el seguimiento sin FECHA DE PAGO del mes' }));
      cuerpo.push(tabla([{ t: 'Fecha' }, { t: 'Demandado' }, { t: 'Expte.' }, { t: 'Movimiento' }], m.enTexto.map(function (x) { return [fIso(x.fecha), x.d, x.e, x.texto]; })));
    }
    var F = m.facturas;
    if (F && !F.error) {
      cuerpo.push(h('h2', { text: 'Facturas emitidas en el mes (' + F.cantidad + ') · neto ' + pesos(F.neto) + ' · IVA ' + pesos(F.iva) + ' · total ' + pesos(F.total) }));
      if (F.facturas.length) cuerpo.push(tabla([{ t: 'Fecha' }, { t: 'Factura' }, { t: 'Cliente' }, { t: 'Expte.' }, { t: 'Neto', num: true }, { t: 'IVA', num: true }, { t: 'Total', num: true }],
        F.facturas.map(function (f) { return [fIso(f.fecha), f.tipo + ' ' + f.numero, f.receptor, (f.exptes || []).join(', '), pesos(f.neto), pesos(f.iva), pesos(f.total)]; })));
      if (F.sinFactura.length) { cuerpo.push(h('h2', { text: 'Cobros sin factura en la carpeta (' + F.sinFactura.length + ')' }));
        cuerpo.push(tabla([{ t: 'Fecha' }, { t: 'Demandado' }, { t: 'Expte.' }, { t: 'Monto', num: true }, { t: 'Factura cargada' }], F.sinFactura.map(function (x) { return [fIso(x.pago), x.d, x.e, pesos(x.monto), x.factura]; }))); }
      if (F.sinCobro.length) { cuerpo.push(h('h2', { text: 'Facturas sin cobro registrado en HONORARIOS (' + F.sinCobro.length + ')' }));
        cuerpo.push(tabla([{ t: 'Fecha' }, { t: 'Factura' }, { t: 'Cliente' }, { t: 'Neto', num: true }], F.sinCobro.map(function (f) { return [fIso(f.fecha), f.numero, f.receptor, pesos(f.neto)]; }))); }
      if (F.diferencias.length) { cuerpo.push(h('h2', { text: 'Montos que no coinciden (' + F.diferencias.length + ')' }));
        cuerpo.push(tabla([{ t: 'Demandado' }, { t: 'Expte.' }, { t: 'HONORARIOS', num: true }, { t: 'Factura' }, { t: 'Neto', num: true }], F.diferencias.map(function (x) { return [x.cobro.d, x.cobro.e, pesos(x.cobro.monto), x.factura.numero, pesos(x.factura.neto)]; }))); }
    }
    imprimir({ tipo: 'cobros', marca: 'CONFIDENCIAL', titulo: 'HONORARIOS COBRADOS · ' + m.nombre + ' ' + m.anio, lineas: ['Del ' + fIso(m.desde) + ' al ' + fIso(m.hasta)], cuerpo: cuerpo });
  }

  // ───────── 8. Honorarios tramitados (semana o período) ─────────
  function tramitados(per, etiqueta) {
    var cuerpo = per.lista.map(function (x) {
      var estado = x.pago ? 'COBRADO ' + fIso(x.pago) : (x.color === '#ffff00' ? 'COBRADO (sin fecha)' : 'PENDIENTE');
      return h('div', { class: 'imp-bloque' },
        h('div', { class: 'imp-bloque-cab' }, h('b', { text: x.d }), h('span', { text: 'Expte. ' + x.e + (x.n ? ' · ' + x.n : '') + ' · ' + pesos(x.monto) + ' · ' + estado })),
        tabla([{ t: 'Fecha' }, { t: 'Movimiento' }], (x.movs || []).map(function (l) { return [fIso(l.fecha), l.texto]; })));
    });
    if (!per.lista.length) cuerpo = h('p', { text: 'Sin movimientos en el período.' });
    imprimir({ tipo: 'tramitados', marca: 'CONFIDENCIAL', titulo: 'HONORARIOS TRAMITADOS',
      lineas: [etiqueta + ' · del ' + fIso(per.desde) + ' al ' + fIso(per.hasta), per.lista.length + ' juicios'], cuerpo: cuerpo });
  }

  // ───────── 9. Cartera de honorarios pendientes (horizontal) ─────────
  function cartera(p, hoy) {
    function filas(lista) {
      return lista.map(function (x) {
        var dias = x.ult ? Math.round((Date.parse(hoy) - Date.parse(x.ult.fecha)) / 86400000) : '';
        return [x.d, x.e, pesos(x.monto), x.ult ? fIso(x.ult.fecha) + ' · ' + x.ult.texto : '—', String(dias), x.colorNombre || ''];
      });
    }
    function suma(l) { return l.reduce(function (s, x) { return s + (x.monto || 0); }, 0); }
    var cols = [{ t: 'Demandado' }, { t: 'Expte.' }, { t: 'Monto', num: true }, { t: 'Último movimiento' }, { t: 'Días', num: true }, { t: 'Color' }];
    imprimir({ tipo: 'cartera', horizontal: true, marca: 'CONFIDENCIAL', titulo: 'HONORARIOS PENDIENTES DE COBRO',
      lineas: ['Total: ' + pesos(p.total) + ' · ' + (p.activos.length + p.dormidos.length) + ' tramos'],
      cuerpo: [h('h2', { text: 'Con movimiento desde el ' + fIso(p.desde) + ' (' + p.activos.length + ')' }),
               tabla(cols, filas(p.activos), ['SUBTOTAL', '', pesos(suma(p.activos)), '', '', '']),
               h('h2', { text: 'Sin movimiento desde antes del ' + fIso(p.desde) + ' (' + p.dormidos.length + ')' }),
               tabla(cols, filas(p.dormidos), ['SUBTOTAL', '', pesos(suma(p.dormidos)), '', '', ''])] });
  }

  // ───────── 9b. Listado semanal de honorarios (horizontal, con ☐ para trabajar en papel) ─────────
  function semanal(L, filtro) {
    filtro = filtro || function () { return true; };
    var cols = [{ t: '✓', chk: true }, { t: 'Demandado' }, { t: 'Expte.' }, { t: 'Saldo', num: true }, { t: 'Motivo / próximo paso' }, { t: 'Último movimiento' }];
    var cuerpo = [];
    [['CUOTA', 'Cuotas que vencen'], ['PRIORIDAD', 'Prioridad: fondos embargados, orden de pago, fechas anotadas'], ['RESTO', 'Resto de los pendientes']].forEach(function (g) {
      var lista = L.grupos[g[0]].filter(filtro);
      if (!lista.length) return;
      cuerpo.push(h('h2', { text: g[1] + ' (' + lista.length + ')' }));
      cuerpo.push(tabla(cols, lista.map(function (x) {
        return [x.tramitado ? '✓' : '☐', x.d, x.e, pesos(x.saldo != null ? x.saldo : x.monto), [x.motivo, x.paso ? '→ ' + x.paso.texto : ''].filter(Boolean).join(' · '),
                x.ult ? fIso(x.ult.fecha) + ' · ' + x.ult.texto : '—'];
      })));
    });
    imprimir({ tipo: 'semanal', horizontal: true, marca: 'CONFIDENCIAL', titulo: 'HONORARIOS · LISTADO SEMANAL',
      lineas: ['Semana del ' + fIso(L.lunes) + ' al ' + fIso(L.domingo) + ' · ' + L.cantidad + ' pendientes · saldo ' + pesos(L.total), 'Tramitados: ' + L.tramitados + ' · cobrados esta semana: ' + L.cobrados.length], cuerpo: cuerpo });
  }

  // ───────── 10. Para revisar (honorarios) ─────────
  function paraRevisar(cruces, tipos) {
    var cuerpo = [];
    Object.keys(tipos).forEach(function (t) {
      var g = cruces.filter(function (x) { return x.tipo === t; });
      if (!g.length) return;
      cuerpo.push(h('h2', { text: tipos[t] + ' (' + g.length + ')' }));
      cuerpo.push(tabla([{ t: '✓', chk: true }, { t: 'Demandado' }, { t: 'Expte.' }, { t: 'Detalle' }], g.map(function (x) { return ['☐', x.d, x.e, x.texto]; })));
    });
    imprimir({ tipo: 'revisar', marca: 'CONFIDENCIAL', titulo: 'HONORARIOS · PARA REVISAR', lineas: [cruces.length + ' avisos (HONORARIOS × MAESTRO × SAE)'], cuerpo: cuerpo });
  }

  // ───────── 11. Resultados de búsqueda / listados (horizontal) ─────────
  function listado(titulo, filas) {
    imprimir({ tipo: 'listado', horizontal: true, marca: 'USO INTERNO', titulo: 'JUICIOS · ' + titulo, lineas: [filas.length + ' juicios'],
      cuerpo: tabla([{ t: 'Deudor' }, { t: 'Expte.' }, { t: 'Nom.' }, { t: 'Estado' }, { t: 'Importe', num: true }, { t: 'Último mov.' }],
                    filas.map(function (f) { return [f.d, f.e, f.n || '', f.g || '', pesos(f.i), f.k ? fIso(f.k) : '']; })) });
  }

  return { enLetras: enLetras, deuda: deuda, ficha: ficha, paraFirmar: paraFirmar, revision: revision, documentoSae: documentoSae,
           cobrosMes: cobrosMes, tramitados: tramitados, cartera: cartera, semanal: semanal, paraRevisar: paraRevisar, listado: listado };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Impresion;
