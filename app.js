/*
 * Juicios DGR — app del buscador (Fase 1).
 * Datos: MAESTRO_SEGUIMIENTO_SAE vía Apps Script (solo lectura), con copia local
 * para que funcione sin señal. SAE: a través del mismo Apps Script.
 */
(function () {
  'use strict';

  var LS = { cfg: 'jdgr.cfg', datos: 'jdgr.datos', recientes: 'jdgr.recientes', agenda: 'jdgr.agenda', firmar: 'jdgr.firmar', cola: 'jdgr.cola', drive: 'jdgr.subirDrive' };
  var PORTAL_SAE = 'https://consultaexpedientes.justucuman.gov.ar/';
  var REFRESCO_MS = 5 * 60 * 1000;

  var estado = { cfg: null, filas: [], indice: [], generado: null, ultimaCarga: 0, abierto: null, sync: '' };
  var $ = function (id) { return document.getElementById(id); };
  var q = $('q'), contenido = $('contenido');

  // ───────── Almacenamiento local (puede fallar en modo privado) ─────────
  function leer(clave) { try { return JSON.parse(localStorage.getItem(clave)); } catch (e) { return null; } }
  function guardar(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) { return false; } }

  // ───────── DOM ─────────
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) {
        if (x != null && x !== false) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
    }
    return el;
  }

  var avisoTimer;
  function aviso(texto) {
    var a = $('aviso');
    a.textContent = texto; a.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { a.hidden = true; }, 2400);
  }

  // ───────── Estados y formatos ─────────
  var COLOR_ESTADO = {
    'DEMANDA': '', 'INTIMACION': 'verde', 'CON EXCEPCIONES': 'verde', 'ABIERTO A PRUEBA': 'verde',
    'AUTOS P/RESOLVER': 'verde', 'PLANILLA FISCAL': 'verde', 'RECURSO': 'verde',
    'SENTENCIA': 'naranja', 'EJECUCION': 'naranja', 'HONORARIOS PENDIENTES': 'rojo',
    'CANCELADO PARCIAL': 'azul', 'CANCELADO TOTAL': 'amarillo',
    'DEUDA REGULARIZADA': 'celeste', 'PLAN DE PAGOS ACTIVO': 'celeste', 'PLAN DE PAGOS CADUCO': 'rojo',
    'EDICTOS': 'verde', 'SIN BIENES / INHIBICIÓN': 'violeta'
  };
  var pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

  function importe(v) {
    if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) v = Number(v);
    return typeof v === 'number' ? pesos.format(v) : (v || '—');
  }

  // Fecha del último movimiento: col. K; si está vacía, la última línea fechada del seguimiento.
  function ultimoMovIso(f) {
    if (f.k) return f.k;
    var l = Buscador.seguimiento(f.f).filter(function (x) { return x.fecha; })[0];
    return l ? l.fecha.split('/').reverse().join('-') : '';
  }
  function cuit(c) { return c && c.length === 11 ? c.slice(0, 2) + '-' + c.slice(2, 10) + '-' + c.slice(10) : (c || '—'); }
  function diasTexto(d) {
    if (d == null) return '';
    if (d <= 0) return 'hoy';
    if (d === 1) return 'hace 1 día';
    if (d < 60) return 'hace ' + d + ' días';
    if (d < 730) return 'hace ' + Math.round(d / 30.4) + ' meses';
    return 'hace ' + (d / 365).toFixed(1).replace('.', ',') + ' años';
  }
  function haceCuanto(iso) {
    if (!iso) return '';
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'recién';
    if (m < 60) return 'hace ' + m + ' min';
    if (m < 1440) return 'hace ' + Math.round(m / 60) + ' h';
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  // ───────── API (Apps Script) ─────────
  /** fetch falló sin respuesta del servidor: no hay señal (o no se llega a Google). */
  function errorDeRed(e) { var x = new Error((e && e.message) || 'Sin conexión'); x.red = true; throw x; }

  function api(params) {
    var cfg = estado.cfg;
    if (!cfg) return Promise.reject(new Error('Falta configurar la app'));
    var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(cfg.u + '?' + qs + '&k=' + encodeURIComponent(cfg.k), { redirect: 'follow' }).catch(errorDeRed)
      .then(function (r) { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Error del servidor'); return j; });
  }

  function cargarDatos(datos) {
    estado.filas = datos.filas || [];
    estado.indice = Buscador.indexar(estado.filas);
    estado.generado = datos.generado;
    estado.maestro = datos.maestro || null;
    var b = $('btn-maestro');
    if (estado.maestro && estado.maestro.url) { b.href = estado.maestro.url; b.hidden = false; }
    actualizarBtnHon();
  }

  /** Enlace al MAESTRO posicionado en la fila del juicio (para editarlo directo). */
  function urlFilaMaestro(f) {
    var m = estado.maestro;
    if (!m || !m.url) return '';
    return m.url.replace(/[?#].*$/, '') + '#gid=' + m.gid + '&range=A' + f.r;
  }

  function sync(texto, clase) {
    var b = $('estado-sync');
    b.textContent = texto;
    b.className = 'pildora ' + (clase || '');
  }

  function refrescar(forzado) {
    if (!estado.cfg) { sync('Sin configurar', 'error'); return Promise.resolve(); }
    if (!forzado && Date.now() - estado.ultimaCarga < REFRESCO_MS) return Promise.resolve();
    if (!navigator.onLine) { sync('Sin conexión · ' + haceCuanto(estado.generado), 'offline'); return Promise.resolve(); }
    sync('Actualizando…', 'cargando');
    return api({ a: 'datos' }).then(function (d) {
      cargarDatos(d);
      estado.ultimaCarga = Date.now();
      if (!guardar(LS.datos, d)) console.warn('No se pudo guardar la copia local');
      sync(estado.filas.length + ' juicios · ' + haceCuanto(d.generado));
      render();
      if (estado.vista === 'tablero') pintarTablero();
    }).catch(function (e) {
      sync(estado.filas.length ? 'Copia local · ' + haceCuanto(estado.generado) : 'Sin datos', 'error');
      if (forzado || !estado.filas.length) aviso('No se pudo actualizar: ' + e.message);
    });
  }

  // ───────── Render ─────────
  // setTimeout (y no requestAnimationFrame): rAF se pausa con la ventana en segundo plano.
  var renderPendiente;
  function render() {
    clearTimeout(renderPendiente);
    renderPendiente = setTimeout(pintar, 0);
  }

  function pintar() {
    var texto = q.value.trim();
    $('btn-limpiar').hidden = !texto;
    contenido.textContent = '';

    if (!estado.cfg && !estado.filas.length) {
      contenido.appendChild(h('div', { class: 'vacio' },
        h('h2', { text: 'Conectá la app con tu planilla' }),
        h('p', { text: 'Tocá el engranaje y pegá el código de configuración del Apps Script.' }),
        h('div', { class: 'ejemplos' }, h('button', { class: 'btn primario', type: 'button', onclick: abrirConfig, text: 'Configurar' }))));
      return;
    }
    if (!texto) return pintarInicio();

    var res = Buscador.buscar(estado.indice, texto, 60);
    if (!res.length) {
      contenido.appendChild(h('div', { class: 'vacio' },
        h('h2', { text: 'Sin resultados' }),
        h('p', { text: 'Probá con otra parte del nombre, el número sin el año o el CUIT.' })));
      return;
    }
    contenido.appendChild(h('p', { class: 'resumen' }, res.length === 1 ? '1 juicio' : res.length + (res.length === 60 ? '+' : '') + ' juicios',
      res.length > 1 ? h('a', { href: '#', class: 'imp-link', onclick: function (ev) { ev.preventDefault(); Impresion.listado('Búsqueda "' + texto + '"', res.map(function (r) { return estado.filas[r.i]; })); }, text: 'Imprimir lista' }) : null));
    res.forEach(function (r) { contenido.appendChild(tarjeta(estado.filas[r.i], res.length === 1)); });
  }

  function pintarInicio() {
    var recientes = (leer(LS.recientes) || []).map(function (r) {
      return estado.filas.filter(function (f) { return f.e === r; })[0];
    }).filter(Boolean);
    var activos = estado.filas.filter(function (f) { return f.g !== 'CANCELADO TOTAL'; }).length;
    contenido.appendChild(h('div', { class: 'vacio' },
      h('h2', { text: 'Buscá un juicio' }),
      h('p', { text: 'Por deudor, número de expediente o CUIT. Podés dictarlo.' }),
      h('p', { class: 'ayuda chica', text: estado.filas.length + ' juicios en la planilla · ' + activos + ' activos' })));
    if (recientes.length) {
      contenido.appendChild(h('div', { class: 'seccion-titulo', text: 'Consultados recientemente' }));
      recientes.forEach(function (f) { contenido.appendChild(tarjeta(f, false)); });
    }
  }

  function tarjeta(f, abrir) {
    var nom = Buscador.nominacion(f.n);
    var ult = Buscador.ultimaLinea(f.f);
    var dias = Buscador.diasDesde(ultimoMovIso(f));
    var sem = Buscador.semaforo(dias, f.g);
    var det = h('div', { class: 'detalle', hidden: true });
    var cab = h('button', { class: 'tarjeta-cab', type: 'button', 'aria-expanded': 'false' },
      h('div', { class: 'fila1' },
        h('div', { class: 'deudor', text: f.d }),
        h('span', { class: 'estado ' + (COLOR_ESTADO[f.g] || ''), text: f.g || 'SIN ESTADO' })),
      h('div', { class: 'fila2' },
        h('span', { class: 'expte', text: 'Expte. ' + f.e }),
        h('span', { text: nom.texto }),
        dias != null ? h('span', { class: 'dias ' + sem, text: diasTexto(dias) }) : null),
      ult.texto ? h('div', { class: 'ultimo' },
        ult.fecha ? h('span', { class: 'fecha', text: ult.fecha + ' · ' }) : null, ult.texto) : null);
    var card = h('article', { class: 'tarjeta' }, cab, det);
    cab.addEventListener('click', function () {
      var abierta = det.hidden;
      det.hidden = !abierta;
      cab.setAttribute('aria-expanded', String(abierta));
      if (abierta && !det.firstChild) pintarDetalle(det, f);
      if (abierta) recordar(f.e);
    });
    if (abrir) { det.hidden = false; cab.setAttribute('aria-expanded', 'true'); pintarDetalle(det, f); recordar(f.e); }
    return card;
  }

  function recordar(expte) {
    var r = (leer(LS.recientes) || []).filter(function (x) { return x !== expte; });
    r.unshift(expte);
    guardar(LS.recientes, r.slice(0, 6));
  }

  function pintarDetalle(det, f) {
    var lineas = Buscador.seguimiento(f.f);
    var saeCaja = h('div', { class: 'sae', hidden: true });
    var btnSae = h('button', { class: 'btn primario', type: 'button' }, iconoSae(), 'Ver en SAE');
    btnSae.addEventListener('click', function () { verSae(f, saeCaja, btnSae, false); });

    det.appendChild(h('dl', { class: 'datos' },
      dato('Importe', importe(f.i)),
      dato('CUIT', cuit(f.c)),
      dato('Último mov.', ultimoMovIso(f) ? ultimoMovIso(f).split('-').reverse().join('/') : '—'),
      dato('Fila MAESTRO', String(f.r))));
    det.appendChild(cajaEstado(f));
    if (urlFilaMaestro(f)) det.appendChild(h('div', { class: 'ayuda chica', style: 'margin:2px 0 4px' },
      h('a', { href: urlFilaMaestro(f), target: '_blank', rel: 'noopener', text: 'Abrir en el MAESTRO (fila ' + f.r + ') ↗' })));

    // Imprimir el estado del juicio: si todavía no se consultó el SAE, primero trae los movimientos
    // (y después pide un segundo toque: el iPhone solo deja imprimir desde un toque directo).
    var btnImp = h('button', { class: 'btn', type: 'button' }, iconoImpresora(), f._sae ? 'Imprimir estado del juicio' : 'Imprimir estado del juicio (con SAE)');
    btnImp.addEventListener('click', function () {
      if (f._sae || btnImp.dataset.sinSae) { Impresion.ficha(f, lineas, f._sae, f._deuda); return; }
      btnImp.disabled = true; btnImp.lastChild.textContent = 'Trayendo los movimientos del SAE…';
      api({ a: 'sae', e: f.e, d: f.d, f: '0' }).then(function (r) {
        if (r.texto) { f._sae = parsearSae(r.texto); f.p = r.procid; f.j = r.jurisdiction; }
        else btnImp.dataset.sinSae = '1';
        btnImp.disabled = false; btnImp.classList.add('primario'); btnImp.lastChild.textContent = 'Listo: tocá para imprimir';
      }).catch(function () {
        btnImp.dataset.sinSae = '1';
        btnImp.disabled = false; btnImp.lastChild.textContent = 'SAE sin respuesta: imprimir sin movimientos';
      });
    });
    det.appendChild(h('div', { class: 'botones', style: 'margin:4px 0 8px' }, btnImp,
      h('button', { class: 'btn', type: 'button', onclick: function () { nuevoAgenda({ e: f.e, d: f.d }); } }, 'Agendar')));

    // 1) SEGUIMIENTO del MAESTRO, completo (lo que anotó Carlos), la línea más reciente primero.
    var ul = h('ul', { class: 'lista-seg' });
    lineas.forEach(function (l) {
      ul.appendChild(h('li', null, h('span', { class: 'f', text: l.fecha || '—' }), h('span', { text: l.texto })));
    });
    det.appendChild(h('section', { class: 'seccion' },
      h('h3', { text: 'Seguimiento · MAESTRO' + (lineas.length ? ' (' + lineas.length + ')' : '') }),
      lineas.length ? ul : h('p', { class: 'ayuda chica', text: 'Sin seguimiento cargado en la planilla.' })));

    // 2) EXPEDIENTE en el SAE (lo que dice el juzgado), a pedido.
    det.appendChild(h('section', { class: 'seccion' },
      h('h3', { text: 'Expediente · SAE' }),
      h('div', { class: 'botones' },
        btnSae,
        h('button', { class: 'btn', type: 'button', onclick: function () { copiar(f.e, 'Expediente copiado'); } }, 'Copiar Nº'),
        h('a', { class: 'btn', href: PORTAL_SAE, target: '_blank', rel: 'noopener',
                 onclick: function () { copiar(f.e); } }, 'Portal SAE ↗')),
      f.s === 'DUDOSO' ? h('div', { class: 'alerta', text: 'Ojo: la carátula del SAE no coincide del todo con el deudor. Verificala.' }) : null,
      saeCaja));

    // 3) DETALLE DE DEUDA: boletas de la demanda (repositorio temporal, 30 días). No toca el MAESTRO.
    var deudaCaja = h('div', { class: 'deuda', hidden: true });
    var btnDeuda = h('button', { class: 'btn', type: 'button' }, 'Detalle de deuda');
    btnDeuda.addEventListener('click', function () { verDeuda(f, deudaCaja, btnDeuda, false); });
    det.appendChild(h('section', { class: 'seccion' }, h('h3', { text: 'Deuda · boletas de la demanda' }), h('div', { class: 'botones' }, btnDeuda), deudaCaja));
  }

  function iconoImpresora() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<path d="M7 9V3.5h10V9M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><rect x="7" y="13.5" width="10" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="12" r="1" fill="currentColor"/>';
    return s;
  }

  function verDeuda(f, caja, btn, forzar) {
    caja.hidden = false; btn.disabled = true;
    caja.textContent = '';
    caja.appendChild(h('div', { class: 'cargando-txt', text: forzar ? 'Leyendo la demanda en el SAE…' : 'Buscando la demanda en el SAE…' }));
    api({ a: 'deuda', e: f.e, f: forzar ? '1' : '0' }).then(function (d) {
      btn.disabled = false; caja.textContent = '';
      if (!d.encontrado) { caja.appendChild(h('p', { class: 'ayuda', text: d.motivo || 'No se encontró la demanda.' })); return; }
      f._deuda = d;                                                  // también sale en "Imprimir estado del juicio"
      var t = h('table', { class: 'tabla-deuda' }, h('thead', null, h('tr', null, h('th', { text: 'Boleta · impuesto · padrón · períodos' }), h('th', { class: 'num', text: 'Importe' }))));
      var tb = h('tbody');
      d.boletas.forEach(function (b) {
        tb.appendChild(h('tr', null,
          h('td', null, h('div', { class: 'nro-boleta', text: b.numero }), h('b', { text: b.impuesto || '—' }), b.detalle ? h('div', { class: 'ayuda chica', text: b.detalle }) : null,
            h('div', { class: 'ayuda chica', text: [b.padron, b.periodos].filter(Boolean).join(' · ') }),
            b.original != null ? h('div', { class: 'ayuda chica', text: 'Original ' + importe(b.original) + ' + intereses ' + importe(b.intereses) + (b.al ? ' (al ' + b.al + ')' : '') }) : null),
          h('td', { class: 'num', text: b.importe != null ? importe(b.importe) : '—' })));
      });
      t.appendChild(tb);
      t.appendChild(h('tfoot', null, h('tr', null, h('td', { text: 'Total reclamado en la demanda' }), h('td', { class: 'num', text: d.total != null ? importe(d.total) : '—' }))));
      caja.appendChild(h('div', { class: 'ayuda chica', text: 'Demanda del ' + (d.fechaDemanda || '—') + (d.exptesAdm && d.exptesAdm.length ? ' · Expte. adm. ' + d.exptesAdm.join(', ') : '') }));
      caja.appendChild(t);
      if (d.verificado) caja.appendChild(h('div', { class: 'ok-deuda', text: '✓ La suma de las boletas coincide con el total de la demanda.' }));
      (d.avisos || []).forEach(function (a) { caja.appendChild(h('div', { class: 'alerta', text: a })); });
      caja.appendChild(h('p', { class: 'ayuda chica', text: 'Importes a la fecha de emisión de las boletas; se agregan intereses hasta el pago. Consulta guardada temporalmente (30 días): no se incorpora al MAESTRO.' }));
      var nombre = 'Detalle de deuda ' + f.e.replace(/\//g, '-');
      caja.appendChild(h('div', { class: 'botones' },
        h('button', { class: 'btn primario', type: 'button', onclick: function () { Impresion.deuda(d, f); } }, 'Imprimir'),
        h('button', { class: 'btn', type: 'button', onclick: function () { exportarArchivo(d.csv, nombre + '.csv', 'text/csv'); } }, 'Exportar (Excel)'),
        h('button', { class: 'btn', type: 'button', onclick: function () { compartirTexto(textoDeuda(d, f), nombre); } }, 'Compartir / copiar'),
        h('button', { class: 'btn', type: 'button', onclick: function () { verDeuda(f, caja, btn, true); } }, 'Volver a leer del SAE')));
      if (d.guardado) caja.appendChild(h('div', { class: 'ayuda chica', text: 'Datos guardados el ' + new Date(d.consultado).toLocaleDateString('es-AR') + '.' }));
    }).catch(function (e) {
      btn.disabled = false; caja.textContent = '';
      caja.appendChild(h('p', { class: 'error', text: 'No se pudo: ' + traducirError(e) }));
    });
  }

  function textoDeuda(d, f) {
    var l = ['DETALLE DE LA DEUDA', d.caratula || f.d, 'Expte. ' + f.e + (d.juzgado ? ' · ' + d.juzgado : ''), ''];
    d.boletas.forEach(function (b) {
      l.push('• Boleta ' + b.numero + ' · ' + (b.impuesto || '') + (b.padron ? ' · ' + b.padron : '') + (b.periodos ? ' · ' + b.periodos : '') + (b.importe != null ? ' · ' + importe(b.importe) : ''));
    });
    l.push('', 'Total reclamado en la demanda: ' + (d.total != null ? importe(d.total) : '—'));
    l.push('Importes a la fecha de emisión de las boletas; se agregan los intereses hasta la fecha de pago.');
    return l.join('\n');
  }

  /** En el iPhone abre el menú de compartir con el archivo (guardar en Archivos, WhatsApp, Mail); en la compu lo descarga. */
  function exportarArchivo(contenido, nombre, tipo) {
    var archivo = typeof File === 'function' ? new File([contenido], nombre, { type: tipo }) : null;
    if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      navigator.share({ files: [archivo], title: nombre }).catch(function () {});
      return;
    }
    var a = h('a', { href: URL.createObjectURL(new Blob([contenido], { type: tipo })), download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
  }

  function compartirTexto(texto, titulo) {
    if (navigator.share) navigator.share({ title: titulo, text: texto }).catch(function () {});
    else copiar(texto, 'Detalle copiado');
  }

  // Estados del MAESTRO (los 12 originales + los agregados el 28/10/2026). "OTROS" lleva subestado libre.
  var ESTADOS = ['DEMANDA', 'INTIMACION', 'CON EXCEPCIONES', 'ABIERTO A PRUEBA', 'AUTOS P/RESOLVER', 'PLANILLA FISCAL', 'EDICTOS',
                 'SENTENCIA', 'EJECUCION', 'SIN BIENES / INHIBICIÓN', 'HONORARIOS PENDIENTES', 'DEUDA REGULARIZADA',
                 'PLAN DE PAGOS ACTIVO', 'PLAN DE PAGOS CADUCO', 'CANCELADO PARCIAL', 'CANCELADO TOTAL', 'RECURSO', 'OTROS'];

  /** "Estado: X  [Cambiar estado]" → lista + subestado libre para OTROS → escribe en el MAESTRO con confirmación. */
  function cajaEstado(f) {
    var caja = h('div', { class: 'cambiar-estado' });
    var pintar = function (editando) {
      caja.textContent = '';
      if (!editando) {
        caja.appendChild(h('span', { class: 'ayuda chica', text: 'Estado en el MAESTRO: ' }));
        caja.appendChild(h('b', { text: f.g || 'SIN ESTADO' }));
        caja.appendChild(h('button', { class: 'leer', type: 'button', onclick: function () { pintar(true); } }, 'Cambiar estado'));
        return;
      }
      var actual = /^OTROS/i.test(f.g || '') ? 'OTROS' : f.g;
      var sel = h('select', { class: 'campo-form' });
      ESTADOS.forEach(function (e) { var o = h('option', { value: e, text: e }); if (e === actual) o.selected = true; sel.appendChild(o); });
      var sub = h('input', { class: 'campo-form', type: 'text', placeholder: 'Subestado (ej. ESPERANDO INFORME DEL BANCO)',
                             value: /^OTROS:/i.test(f.g || '') ? f.g.replace(/^OTROS:\s*/i, '') : '' });
      var verSub = function () { sub.hidden = sel.value !== 'OTROS'; };
      sel.addEventListener('change', verSub);
      var guardar = h('button', { class: 'btn primario', type: 'button' }, 'Guardar');
      guardar.addEventListener('click', function () {
        var nuevo = sel.value === 'OTROS' ? 'OTROS: ' + sub.value.trim().toUpperCase() : sel.value;
        if (sel.value === 'OTROS' && !sub.value.trim()) { aviso('Escribí el subestado'); return; }
        if (!confirm('¿Cambiar el ESTADO de ' + f.d + ' (' + f.e + ') en el MAESTRO?\n\n' + (f.g || 'SIN ESTADO') + '  →  ' + nuevo)) return;
        guardar.disabled = true;
        apiPost({ a: 'cambiarEstado', e: f.e, estado: sel.value, sub: sub.value }).then(function (r) {
          f.g = r.estado; aviso('ESTADO actualizado: ' + r.estado); pintar(false); refrescar(true);
        }).catch(function (e) { guardar.disabled = false; aviso('No se pudo: ' + traducirError(e)); });
      });
      caja.appendChild(h('div', { class: 'ayuda chica', text: 'Nuevo estado:' }));
      caja.appendChild(sel); caja.appendChild(sub);
      caja.appendChild(h('div', { class: 'botones', style: 'margin-top:8px' }, guardar,
        h('button', { class: 'btn', type: 'button', onclick: function () { pintar(false); } }, 'Cancelar')));
      verSub();
    };
    pintar(false);
    return caja;
  }

  function dato(t, v) { return h('div', null, h('dt', { text: t }), h('dd', { text: v })); }

  function iconoSae() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.innerHTML = '<path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    return s;
  }

  function copiar(texto, msg) {
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(function () { if (msg) aviso(msg); }, function () {});
  }

  // ───────── Panel SAE ─────────
  function parsearSae(texto) {
    var out = { caratula: '', juzgado: '', movs: [], total: '' };
    texto.split(/\r?\n/).forEach(function (l) {
      var m;
      if ((m = l.match(/^Carátula:\s*(.+)/))) out.caratula = m[1].replace(/\s+/g, ' ');
      else if ((m = l.match(/^Juzgado:\s*(.+)/))) out.juzgado = m[1];
      else if ((m = l.match(/^Movimientos \((\d+) en total/))) out.total = m[1];
      else if ((m = l.match(/^- #(\d+) · (\d{2}\/\d{2}\/\d{4}) · (.*?)(?:\s*\[([^\]]*)\])?\s*$/))) {
        out.movs.push({ histid: m[1], fecha: m[2], desc: m[3], marcas: m[4] || '' });
      }
    });
    return out;
  }

  function verSae(f, caja, btn, forzar) {
    caja.hidden = false;
    caja.textContent = '';
    caja.appendChild(h('div', { class: 'cargando-txt', text: f.p ? 'Consultando el SAE…' : 'Buscando el expediente en el SAE (la primera vez tarda unos 10 segundos)…' }));
    btn.disabled = true;
    api({ a: 'sae', e: f.e, d: f.d, f: forzar ? '1' : '0' }).then(function (r) {
      btn.disabled = false;
      caja.textContent = '';
      if (!r.texto) {
        caja.appendChild(h('div', { class: 'alerta', text: r.estado === 'FORMATO'
          ? 'Este número de expediente tiene un formato antiguo y no se puede buscar en el SAE.'
          : 'No encontré este expediente en el fuero de Apremios del SAE.' }));
        if (r.estado !== 'FORMATO') caja.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { verSae(f, caja, btn, true); } }, 'Buscar de nuevo'));
        return;
      }
      f.p = r.procid; f.j = r.jurisdiction; f.s = r.estado;
      var s = parsearSae(r.texto);
      f._sae = s;                                                    // para "Imprimir ficha"
      caja.appendChild(h('div', { class: 'sae-cab' },
        h('b', { text: 'SAE · ' + (s.total ? s.total + ' movimientos' : 'expediente') }),
        h('button', { class: 'leer', type: 'button', onclick: function () { leerDoc(f, 'ultimo', 'Último proveído'); } }, 'Último proveído')));
      if (r.estado === 'DUDOSO') caja.appendChild(h('div', { class: 'alerta', text: 'La carátula del SAE no coincide del todo con el deudor de la planilla. Verificala.' }));
      if (s.caratula) caja.appendChild(h('div', { class: 'caratula', text: s.caratula }));
      if (s.juzgado) caja.appendChild(h('div', { class: 'juzgado', text: s.juzgado }));
      var ul = h('ul', { class: 'movs' });
      s.movs.forEach(function (m) {
        var legible = /texto|adjunto/.test(m.marcas);
        ul.appendChild(h('li', null,
          h('span', { class: 'f', text: m.fecha }),
          h('span', { text: m.desc }),
          legible ? h('button', { class: 'leer', type: 'button', onclick: function () { leerDoc(f, m.histid, m.fecha + ' · ' + m.desc); } }, 'Leer') : h('span')));
      });
      caja.appendChild(ul);
      if (!s.movs.length) caja.appendChild(h('pre', { class: 'doc-texto', text: r.texto }));
    }).catch(function (e) {
      btn.disabled = false;
      caja.textContent = '';
      caja.appendChild(h('p', { class: 'error', text: 'No se pudo consultar el SAE: ' + e.message }));
    });
  }

  function leerDoc(f, histid, titulo) {
    var dlg = $('dlg-doc');
    $('doc-titulo').textContent = titulo;
    var t = $('doc-texto');
    t.textContent = '';
    t.appendChild(h('div', { class: 'cargando-txt', text: 'Trayendo el texto del SAE…' }));
    if (!dlg.open) dlg.showModal();
    estado.doc = null;
    api({ a: 'doc', p: f.p, j: f.j, h: histid }).then(function (r) {
      t.textContent = r.texto;
      estado.doc = { titulo: titulo, texto: r.texto, f: f };
    }).catch(function (e) {
      t.textContent = 'No se pudo traer el texto: ' + e.message;
    });
  }

  // ───────── Voz ─────────
  // En iPhone/iPad el reconocimiento de voz del navegador se cuelga cuando la app está
  // instalada en la pantalla de inicio (probado el 22/10/2026). Ahí el botón abre el teclado
  // para usar el dictado de Apple (micrófono del teclado), que es el más confiable.
  var ES_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function iniciarVoz() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btn = $('btn-voz');
    if (ES_IOS) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        q.focus();
        q.select();
        aviso('Tocá el 🎤 del teclado y decí el nombre o el número');
      });
      return;
    }
    if (!SR) return;   // queda el micrófono del teclado
    btn.hidden = false;
    var rec = null, vigia = null;
    function terminar() {
      clearTimeout(vigia);
      btn.classList.remove('escuchando');
      if (rec) { try { rec.abort(); } catch (e) { /* ya terminado */ } }
      rec = null;
    }
    btn.addEventListener('click', function () {
      if (rec) { terminar(); return; }
      rec = new SR();
      rec.lang = 'es-AR';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = function (ev) {
        var txt = '';
        for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        q.value = txt.replace(/\.$/, '');
        render();
      };
      rec.onerror = function (ev) {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') aviso('Permití el micrófono para buscar por voz');
        else if (ev.error !== 'aborted' && ev.error !== 'no-speech') aviso('No te escuché bien, probá de nuevo');
        terminar();
      };
      rec.onend = terminar;
      btn.classList.add('escuchando');
      vigia = setTimeout(terminar, 10000);   // nunca quedar escuchando para siempre
      try { rec.start(); } catch (e) { terminar(); }
    });
  }

  // ───────── Para firmar (motor de escritos) ─────────
  var firmar = { datos: null, sel: {}, cargando: false, lote: null, grupo: null };   // grupo: tarjeta abierta (null = las tarjetas)

  // Una tarjeta por tipo de escrito; al tocarla se abren sus escritos (como los botones del portal del SAE).
  var GRUPOS_FIRMAR = [
    { id: 'sentencia', nombre: 'Pedidos de sentencia', es: function (x) { return /SENTENCIA/.test(x.tipo) && !/^COMUNICO/.test(x.tipo); } },
    { id: 'ivp', nombre: 'Cancelaciones (IVP)', es: function (x) { return /^COMUNICO/.test(x.tipo); } },
    { id: 'otros', nombre: 'Honorarios y otros', es: function () { return true; } }
  ];
  function grupoFirmar(x) { return GRUPOS_FIRMAR.filter(function (g) { return g.es(x); })[0].id; }

  // Tarjeta grande que abre una sección (Para firmar y Agenda), como los botones del portal del SAE.
  function tarjetaGrupo(o) {
    var b = h('button', { type: 'button', class: 'tarjeta-grupo' + (o.abierta ? ' abierta' : '') + (o.numero === 0 ? ' vacia' : '') + (o.grave ? ' grave' : ''),
                          'aria-expanded': o.abierta ? 'true' : 'false' },
      h('span', { class: 'tg-nombre', text: o.nombre }),
      o.numero == null ? null : h('span', { class: 'tg-cuenta' + (typeof o.numero === 'string' ? ' monto' : '') }, h('b', { text: String(o.numero) }), o.unidad ? ' ' + o.unidad : ''),
      (o.info || []).map(function (t) { return t ? h('span', { class: 'tg-info', text: t }) : null; }),
      o.alerta ? h('span', { class: 'tg-info tg-alerta', text: o.alerta }) : null,
      h('span', { class: 'tg-abrir', text: o.abierta ? 'Cerrar ▴' : o.entrar ? 'Abrir ›' : 'Abrir ▾' }));
    b.addEventListener('click', o.onclick);
    return b;
  }

  // Una tarjeta abierta ocupa toda la pestaña: arriba "← Tarjetas" y el nombre; abajo, "← Volver a las tarjetas".
  function cabeceraGrupo(nombre, volver) {
    return h('div', { class: 'cabecera-grupo' }, h('button', { class: 'btn', type: 'button', onclick: volver }, '← Tarjetas'), h('h2', { text: nombre }));
  }
  function pieGrupo(volver) {
    return h('div', { class: 'pie-grupo' }, h('button', { class: 'btn', type: 'button', onclick: volver }, '← Volver a las tarjetas'));
  }

  // Al cambiar de tarjeta se destilda todo: así nunca se marca como presentado un escrito que no está a la vista.
  function abrirGrupoFirmar(id) {
    firmar.grupo = id;
    firmar.sel = {};
    pintarFirmar();
    window.scrollTo(0, 0);
  }

  function imprimirLote() {
    var ids = Object.keys(firmar.sel);
    if (!ids.length) return;
    $('btn-imprimir-lote').disabled = true;
    apiPost({ a: 'lote', ids: ids }).then(function (r) {
      $('btn-imprimir-lote').disabled = false;
      firmar.lote = { job: r.job, ids: ids, estado: 'EN_COLA', desde: Date.now() };
      aviso('Armando el PDF para imprimir: 1 o 2 minutos');
      pintarFirmar(); seguirLote();
    }).catch(function (e) { $('btn-imprimir-lote').disabled = false; aviso('No se pudo: ' + traducirError(e)); });
  }
  // Pregunta cada 5 s si el PDF está listo. El iPhone frena los relojes con la app en segundo plano:
  // al volver a la app se pregunta en el acto.
  function seguirLote(ya) {
    var L = firmar.lote;
    if (!L || L.estado !== 'EN_COLA') return;
    clearTimeout(L.timer);
    L.timer = setTimeout(function () {
      api({ a: 'lote', j: L.job }).then(function (r) {
        if (firmar.lote !== L) return;
        Object.assign(L, r);
        if (estado.vista === 'firmar') pintarFirmar();
        if (L.estado === 'LISTO') aviso('PDF para imprimir listo'); else seguirLote();
      }).catch(function () { seguirLote(); });
    }, ya ? 0 : 5000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) seguirLote(true); });

  function apiPost(cuerpo) {
    var cfg = estado.cfg;
    if (!cfg) return Promise.reject(new Error('Falta configurar la app'));
    // Texto plano: así el navegador no hace el control previo de CORS que Apps Script no responde.
    return fetch(cfg.u, { method: 'POST', body: JSON.stringify(Object.assign({ k: cfg.k }, cuerpo)), redirect: 'follow' }).catch(errorDeRed)
      .then(function (r) { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Error del servidor'); return j; });
  }

  // ───────── Sin conexión: los cambios quedan en una cola y se mandan solos, en orden, al volver la señal ─────────
  // Solo lo que se puede hacer sin respuesta del servidor: Agenda (agregar, editar, cumplido, borrar) y Para firmar (Presentado, Descartar).
  // Honorarios no: el PIN lo controla el servidor y esos datos no se guardan en el teléfono.
  var cola = { items: leer(LS.cola) || [], enviando: false };

  function hayRed() { return navigator.onLine !== false; }
  function esDeRed(e) { return !!(e && (e.red || /Failed to fetch|NetworkError|Load failed/i.test(String(e.message)))); }

  function encolar(cuerpo, desc) {
    cola.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cuerpo: cuerpo, desc: desc, creado: Date.now() });
    guardar(LS.cola, cola.items);
    mostrarCola();
  }

  /** Manda al servidor. Sin señal (o si ya hay cambios esperando, para no desordenarlos) queda en la cola y devuelve null. */
  function mandar(cuerpo, desc) {
    if (!hayRed() || cola.items.length) { encolar(cuerpo, desc); enviarCola(); return Promise.resolve(null); }
    return apiPost(cuerpo).catch(function (e) { if (!esDeRed(e)) throw e; encolar(cuerpo, desc); return null; });
  }

  function enviarCola() {
    if (cola.enviando || !cola.items.length || !hayRed() || !estado.cfg) return Promise.resolve();
    cola.enviando = true;
    var enviados = 0, rechazados = [], agendaResp = null, firmarCambio = false;
    var sacar = function (x) { cola.items = cola.items.filter(function (y) { return y.id !== x.id; }); guardar(LS.cola, cola.items); };
    var paso = function () {
      var x = cola.items[0];
      if (!x) return Promise.resolve();
      return apiPost(x.cuerpo).then(function (r) {
        sacar(x); enviados++;
        if (r && r.items) agendaResp = r;
        if (x.cuerpo.a === 'presentado' || x.cuerpo.a === 'descartar') firmarCambio = true;
        return paso();
      }, function (e) {
        if (esDeRed(e)) throw e;                                   // sigue sin señal: se reintenta después
        sacar(x); rechazados.push(x.desc + ': ' + traducirError(e));   // el servidor no lo aceptó (por ejemplo, ya no existe)
        return paso();
      });
    };
    return paso().catch(function () {}).then(function () {
      cola.enviando = false;
      mostrarCola();
      if (enviados) aviso(enviados === 1 ? 'Se envió 1 cambio hecho sin conexión' : 'Se enviaron ' + enviados + ' cambios hechos sin conexión');
      if (rechazados.length) alert('No se pudieron enviar estos cambios hechos sin conexión:\n\n' + rechazados.join('\n'));
      if (agendaResp && !cola.items.some(function (x) { return /^agenda/.test(x.cuerpo.a); })) {
        recibirAgenda(agendaResp);
        if (estado.vista === 'agenda' && !agenda.form) pintarAgenda();
      }
      if (firmarCambio) { refrescar(true); if (estado.vista === 'firmar') cargarFirmar(); }
    });
  }

  function mostrarCola() {
    var b = $('aviso-cola'), n = cola.items.length;
    if (!b) return;
    b.hidden = !n;
    b.textContent = '⏳ ' + (n === 1 ? '1 cambio hecho sin conexión: se envía solo' : n + ' cambios hechos sin conexión: se envían solos') + ' al volver la señal';
  }

  /** Ids de escritos marcados sin conexión (todavía no llegaron al servidor). */
  function escritosEnCola() {
    var ids = {};
    cola.items.forEach(function (x) { if (x.cuerpo.a === 'presentado' || x.cuerpo.a === 'descartar') x.cuerpo.ids.forEach(function (i) { ids[i] = true; }); });
    return ids;
  }

  function cambiarVista(v) {
    estado.vista = v;
    document.querySelectorAll('.pestana').forEach(function (b) { b.classList.toggle('activa', b.dataset.vista === v); });
    $('barra-buscar').hidden = v !== 'buscar';
    contenido.hidden = v !== 'buscar';
    $('firmar').hidden = v !== 'firmar';
    $('escritos').hidden = v !== 'escritos';
    $('honorarios').hidden = v !== 'honorarios';
    $('agenda').hidden = v !== 'agenda';
    $('tablero').hidden = v !== 'tablero';
    actualizarBarraAcciones();
    actualizarAlertasAgenda();
    if (v === 'firmar') cargarFirmar();
    else if (v === 'escritos') pintarEscritos();
    else if (v === 'honorarios') cargarHonorarios();
    else if (v === 'agenda') { pintarAgenda(); cargarAgenda(); }
    else if (v === 'tablero') pintarTablero();
    else render();
    window.scrollTo(0, 0);
    var pest = document.querySelector('.pestana.activa');
    if (pest && pest.scrollIntoView) pest.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  // Tablero (app/tablero.js): juicios con los datos del MAESTRO; honorarios solo si la pestaña Honorarios está abierta con el PIN.
  function pintarTablero() {
    Tablero.pintar($('tablero'), {
      h: h, filas: estado.filas, hoy: hoyInput(), generado: estado.generado, importe: importe,
      hon: hon.datos && hon.datos.estadisticas, honPendiente: hon.datos && hon.datos.pendientes && hon.datos.pendientes.total,
      irAHonorarios: function () { cambiarVista('honorarios'); }
    });
  }

  function verJuicio(expte) {
    q.value = expte;
    cambiarVista('buscar');
  }

  function cargarFirmar() {
    if (!estado.cfg || firmar.cargando) return;
    firmar.cargando = true;
    if (!firmar.datos) pintarFirmar();
    api({ a: 'escritos' }).then(function (d) {
      d.guardado = Date.now();
      guardar(LS.firmar, d);
      quitarEnCola(d);
      firmar.datos = d; firmar.sinRed = false;
      Object.keys(firmar.sel).forEach(function (id) { if (!d.porFirmar.some(function (x) { return x.id === id; })) delete firmar.sel[id]; });
      firmar.cargando = false;
      pintarFirmar();
      if (d.enCurso || d.uniendoArca || d.revisandoIvp) setTimeout(function () { if (estado.vista === 'firmar') cargarFirmar(); }, 20000);
    }).catch(function (e) {
      firmar.cargando = false;
      var copia = esDeRed(e) && (firmar.datos || leer(LS.firmar));
      if (copia) { quitarEnCola(copia); firmar.datos = copia; firmar.sinRed = true; pintarFirmar(); return; }
      $('firmar').textContent = '';
      $('firmar').appendChild(h('p', { class: 'error', text: 'No se pudo cargar: ' + traducirError(e) }));
    });
  }

  /** Los escritos ya marcados sin conexión no se muestran como pendientes. */
  function quitarEnCola(d) {
    var ids = escritosEnCola();
    if (d && d.porFirmar) d.porFirmar = d.porFirmar.filter(function (x) { return !ids[x.id]; });
  }

  function contarFirmar(n) {
    var c = $('cuenta-firmar');
    c.textContent = String(n);
    c.hidden = !n;
  }

  function porAnio(lista) {
    var g = {};
    lista.forEach(function (x) { (g[x.anio] = g[x.anio] || []).push(x); });
    return Object.keys(g).sort(function (a, b) { return b - a; }).map(function (a) { return { anio: a, items: g[a] }; });
  }

  function pintarFirmar() {
    var cont = $('firmar'), d = firmar.datos;
    cont.textContent = '';
    if (!d) { cont.appendChild(h('div', { class: 'cargando-txt', text: 'Cargando escritos…' })); return; }
    if (!d.instalado) {
      cont.appendChild(h('div', { class: 'vacio' }, h('h2', { text: 'El motor todavía no está instalado' }),
        h('p', { text: 'En Apps Script, ejecutá la función instalarMotor (una sola vez).' })));
      return;
    }
    contarFirmar(d.porFirmar.length);
    if (firmar.sinRed) cont.appendChild(h('div', { class: 'panel caja-aviso' }, h('b', { text: 'Sin conexión' }),
      h('div', { class: 'ayuda chica', style: 'color:inherit', text: 'Es la lista guardada' + (d.guardado ? ' el ' + new Date(d.guardado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') +
        '. Podés tildar y marcar "Presentado" o "Descartar": se anota en el MAESTRO, con la fecha de hoy, al volver la señal. Los PDF necesitan conexión para abrirse.' })));

    // Errores del motor en los últimos 7 días (para enterarse sin mirar Google)
    if (d.errores && d.errores.length) {
      var pe = h('div', { class: 'panel caja-peligro' }, h('b', { text: '⚠ El motor tuvo ' + (d.errores.length === 1 ? 'un error' : d.errores.length + ' errores') + ' en los últimos días' }));
      d.errores.forEach(function (x) { pe.appendChild(h('div', { class: 'ayuda chica', style: 'color:inherit', text: x.fecha + ' · ' + x.origen + ': ' + x.error })); });
      pe.appendChild(h('div', { class: 'ayuda chica', style: 'color:inherit', text: 'Si se repite, avisale a Claude con esta captura. El detalle está en la pestaña ERRORES de la planilla de control.' }));
      cont.appendChild(pe);
    }

    // "Imprimir juntos": PDF único con los escritos seleccionados
    if (firmar.lote) {
      var L = firmar.lote;
      cont.appendChild(h('div', { class: 'panel ' + (L.estado === 'LISTO' ? 'caja-ok' : L.estado === 'ERROR' ? 'caja-peligro' : 'caja-aviso') },
        L.estado === 'LISTO' ? [h('b', { text: '🖨 PDF para imprimir listo (' + L.ids.length + ' escritos)' }), ' ',
                                 h('a', { class: 'btn primario', href: L.url, target: '_blank', rel: 'noopener', style: 'margin-left:8px' }, 'Abrir PDF'),
                                 L.faltan && L.faltan.length ? h('div', { class: 'ayuda chica', style: 'color:inherit', text: 'No se encontró el PDF de: ' + L.faltan.join(', ') }) : null]
        : L.estado === 'ERROR' ? 'No se pudo armar el PDF: ' + L.error
        : ['Armando un PDF con ' + L.ids.length + ' escritos para imprimir… (menos de 1 minuto; aparece acá con el botón "Abrir PDF")',
           Date.now() - L.desde > 180000 && L.carpeta ? h('div', null, h('a', { href: L.carpeta, target: '_blank', rel: 'noopener', text: 'Tarda más de lo normal: abrir la carpeta PARA IMPRIMIR en el Drive ↗' })) : null]));
    }

    // Tarjetas: una por tipo de escrito
    var grupos = {};
    GRUPOS_FIRMAR.forEach(function (g) { grupos[g.id] = []; });
    d.porFirmar.forEach(function (x) { grupos[grupoFirmar(x)].push(x); });
    var abierto = firmar.grupo && (firmar.grupo !== 'otros' || grupos.otros.length) ? firmar.grupo : null;
    if (abierto) {
      var volver = function () { abrirGrupoFirmar(null); };
      cont.appendChild(cabeceraGrupo(GRUPOS_FIRMAR.filter(function (g) { return g.id === abierto; })[0].nombre, volver));
      if (abierto === 'sentencia') seccionSentencia(cont, d, grupos.sentencia);
      else if (abierto === 'ivp') seccionIvp(cont, d, grupos.ivp);
      else seccionOtrosFirmar(cont, d, grupos.otros);
      cont.appendChild(pieGrupo(volver));
      actualizarBarraAcciones();
      return;
    }
    var cuando = function (iso) { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); };
    var info = {
      sentencia: d.enCurso ? 'Analizando…' : d.ultimaCorrida ? 'Análisis del ' + cuando(d.ultimaCorrida) : 'Sin analizar',
      ivp: d.revisandoIvp ? 'Revisando Gmail…' : d.ultimoIvp ? 'Gmail revisado el ' + cuando(d.ultimoIvp) : 'Sin revisar',
      otros: 'Desde Honorarios'
    };
    var tarjetas = h('div', { class: 'tarjetas-grupo' });
    GRUPOS_FIRMAR.forEach(function (g) {
      if (g.id === 'otros' && !grupos.otros.length) return;
      var sinArca = g.id === 'sentencia' && d.arca && !d.arca.alDia;
      tarjetas.appendChild(tarjetaGrupo({
        nombre: g.nombre, numero: grupos[g.id].length, unidad: 'para firmar', entrar: true,
        info: [info[g.id], g.id === 'sentencia' && !sinArca && d.revision.length ? d.revision.length + ' en revisión manual' : ''],
        alerta: sinArca ? '⚠ Falta la constancia de ARCA' : '',
        onclick: function () { abrirGrupoFirmar(g.id); }
      }));
    });
    cont.appendChild(tarjetas);
    actualizarBarraAcciones();
  }

  // Escritos de una tarjeta, por año del juicio, con "Tildar todos".
  function escritosPorAnio(cont, lista, vacio) {
    if (!lista.length) {
      cont.appendChild(h('div', { class: 'vacio' }, h('h2', { text: 'No hay escritos para firmar' }), h('p', { text: vacio })));
      return;
    }
    var todos = lista.every(function (x) { return firmar.sel[x.id]; });
    cont.appendChild(h('div', { class: 'botones', style: 'margin:4px 0 0' },
      h('button', { class: 'btn', type: 'button', onclick: function () {
        lista.forEach(function (x) { if (todos) delete firmar.sel[x.id]; else firmar.sel[x.id] = true; });
        pintarFirmar();
      } }, todos ? 'Destildar todos' : 'Tildar todos (' + lista.length + ')'),
      h('button', { class: 'btn', type: 'button', onclick: function () { Impresion.paraFirmar(lista); } }, 'Imprimir lista para firmar')));
    porAnio(lista).forEach(function (g) {
      cont.appendChild(h('div', { class: 'anio' }, 'Juicios ' + g.anio, h('small', { text: g.items.length + (g.items.length === 1 ? ' escrito' : ' escritos') })));
      g.items.forEach(function (x) { cont.appendChild(tarjetaEscrito(x)); });
    });
  }

  function seccionSentencia(cont, d, lista) {
    var info = d.enCurso ? 'Analizando la cartera…' + (d.quedan ? ' quedan ' + d.quedan + ' juicios' : '')
                         : (d.ultimaCorrida ? 'Último análisis: ' + new Date(d.ultimaCorrida).toLocaleDateString('es-AR') + ' · se repite todos los domingos' : 'Todavía no se analizó la cartera');
    var btnAnalizar = h('button', { class: 'btn', type: 'button', disabled: d.enCurso }, d.enCurso ? 'Analizando…' : 'Analizar ahora');
    btnAnalizar.addEventListener('click', function () {
      btnAnalizar.disabled = true;
      api({ a: 'analizar' }).then(function () { aviso('Análisis en marcha: tarda unos minutos'); setTimeout(cargarFirmar, 3000); })
        .catch(function (e) { btnAnalizar.disabled = false; aviso('No se pudo: ' + traducirError(e)); });
    });
    cont.appendChild(h('div', { class: 'panel' }, h('div', { class: 'fila-panel' },
      h('div', null, h('h2', { text: 'Pedidos de sentencia (todos los domingos)' }), h('div', { class: 'ayuda chica', text: info })),
      btnAnalizar),
      h('div', { class: 'ayuda chica' }, h('a', { href: d.carpeta, target: '_blank', rel: 'noopener', text: 'Abrir la carpeta de escritos ↗' }))));

    // Constancia de ARCA del mes
    if (d.arca && !d.arca.alDia) {
      cont.appendChild(h('div', { class: 'panel aviso-arca' },
        h('b', { text: '⚠ Falta la constancia de ARCA de ' + d.arca.mes.toLowerCase() }),
        h('div', { text: 'Bajala de ARCA y guardala en la carpeta CONSTANCIA ARCA: cada pedido de sentencia se sube junto con ella.' }),
        h('div', { style: 'margin-top:6px' }, h('a', { href: d.arca.carpeta, target: '_blank', rel: 'noopener', text: 'Abrir carpeta CONSTANCIA ARCA ↗' }))));
    } else if (d.arca && d.arca.archivo) {
      var sinArca = d.porFirmar.filter(function (x) { return !x.arca && grupoFirmar(x) !== 'ivp'; }).length;
      var panelArca = h('div', { class: 'panel ok-arca' }, '✓ Constancia de ARCA de ' + d.arca.mes.toLowerCase() + ': ',
        h('a', { href: d.arca.archivo.url, target: '_blank', rel: 'noopener', text: d.arca.archivo.nombre }));
      if (d.uniendoArca) panelArca.appendChild(h('div', { class: 'ayuda chica', text: 'Uniendo la constancia a los escritos… (unos minutos)' }));
      else if (sinArca) {
        var btnArca = h('button', { class: 'btn', type: 'button', style: 'margin-top:8px' }, 'Unir la constancia a ' + sinArca + (sinArca === 1 ? ' escrito' : ' escritos'));
        btnArca.addEventListener('click', function () {
          btnArca.disabled = true;
          api({ a: 'adjuntarArca' }).then(function () { aviso('Uniendo la constancia: tarda unos minutos'); setTimeout(cargarFirmar, 5000); })
            .catch(function (e) { btnArca.disabled = false; aviso('No se pudo: ' + traducirError(e)); });
        });
        panelArca.appendChild(h('div', null, btnArca));
      }
      cont.appendChild(panelArca);
    }

    escritosPorAnio(cont, lista, d.enCurso ? 'Esperá a que termine el análisis.' : 'El próximo análisis los va a generar si corresponde.');

    // Revisión manual
    if (d.revision.length) {
      var det = h('details', { class: 'grupo' }, h('summary', { text: 'Revisión manual (' + d.revision.length + ')' }),
        h('p', { class: 'ayuda chica', text: 'El motor no genera escritos para estos juicios: necesitan tu criterio. Tocá uno para ver su ficha.' }),
        h('button', { class: 'btn', type: 'button', onclick: function () { Impresion.revision('Revisión manual', d.revision); } }, 'Imprimir'));
      porAnio(d.revision).forEach(function (g) {
        det.appendChild(h('div', { class: 'anio' }, 'Juicios ' + g.anio, h('small', { text: String(g.items.length) })));
        g.items.forEach(function (x) {
          det.appendChild(h('div', { class: 'item-rev', onclick: function () { verJuicio(x.e); } },
            h('b', { text: x.d }), h('div', { class: 'meta', text: 'Expte. ' + x.e + ' · ' + x.g }),
            h('div', { class: 'motivo', text: x.motivo + (x.detalle ? ' — ' + x.detalle : '') })));
        });
      });
      cont.appendChild(det);
    }

    // Juicios que ya tienen sentencia en el SAE: cambiar el ESTADO del MAESTRO (con aprobación)
    if (d.sentenciaYa.length) {
      var marcados = {};
      d.sentenciaYa.forEach(function (x) { marcados[x.e] = true; });
      var btn = h('button', { class: 'btn primario', type: 'button' });
      var refrescarBtn = function () { var n = Object.keys(marcados).length; btn.textContent = 'Cambiar ESTADO a SENTENCIA (' + n + ')'; btn.disabled = !n; };
      var det2 = h('details', { class: 'grupo' }, h('summary', { text: 'Ya tienen sentencia en el SAE (' + d.sentenciaYa.length + ')' }),
        h('p', { class: 'ayuda chica', text: 'En el MAESTRO figuran como INTIMACION / AUTOS P/RESOLVER, pero el SAE ya muestra la sentencia. Destildá los que no quieras cambiar.' }),
        h('button', { class: 'btn', type: 'button', onclick: function () { Impresion.revision('Ya tienen sentencia en el SAE', d.sentenciaYa); } }, 'Imprimir'));
      d.sentenciaYa.forEach(function (x) {
        var chk = h('input', { type: 'checkbox', checked: true });
        chk.addEventListener('change', function () { if (chk.checked) marcados[x.e] = true; else delete marcados[x.e]; refrescarBtn(); });
        det2.appendChild(h('div', { class: 'item-rev' }, h('label', null, chk,
          h('span', null, h('b', { text: x.d }), h('div', { class: 'meta', text: 'Expte. ' + x.e + ' · ' + x.g + ' → SENTENCIA' + (x.sentencia ? ' (del ' + x.sentencia + ')' : '') })))));
      });
      btn.addEventListener('click', function () {
        var lista = Object.keys(marcados);
        if (!confirm('Se va a cambiar el ESTADO a SENTENCIA en el MAESTRO para ' + lista.length + ' juicio(s). ¿Confirmás?')) return;
        btn.disabled = true;
        apiPost({ a: 'aprobarSentencia', exptes: lista }).then(function (r) {
          aviso('ESTADO actualizado en ' + r.actualizados.length + ' juicio(s)');
          refrescar(true); cargarFirmar();
        }).catch(function (e) { btn.disabled = false; aviso('No se pudo: ' + traducirError(e)); });
      });
      refrescarBtn();
      det2.appendChild(h('div', { class: 'botones' }, btn));
      cont.appendChild(det2);
    }
  }

  // IVP de Gmail → comunicaciones de cancelación
  function seccionIvp(cont, d, lista) {
    var infoIvp = d.revisandoIvp ? 'Revisando los IVP de Gmail…'
                 : (d.ultimoIvp ? 'Última revisión: ' + new Date(d.ultimoIvp).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · todos los días'
                                : 'Todavía no se revisaron los IVP');
    var btnIvp = h('button', { class: 'btn', type: 'button', disabled: d.revisandoIvp }, d.revisandoIvp ? 'Revisando…' : 'Revisar IVP ahora');
    btnIvp.addEventListener('click', function () {
      btnIvp.disabled = true;
      api({ a: 'revisarIvp' }).then(function () { aviso('Revisando los IVP: tarda unos minutos'); setTimeout(cargarFirmar, 5000); })
        .catch(function (e) { btnIvp.disabled = false; aviso('No se pudo: ' + traducirError(e)); });
    });
    cont.appendChild(h('div', { class: 'panel' }, h('div', { class: 'fila-panel' },
      h('div', null, h('h2', { text: 'Cancelaciones (IVP)' }), h('div', { class: 'ayuda chica', text: infoIvp })), btnIvp)));
    escritosPorAnio(cont, lista, 'Cuando llegue un IVP a Gmail, la comunicación aparece acá.');
  }

  function seccionOtrosFirmar(cont, d, lista) {
    cont.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Honorarios y otros' }),
      h('div', { class: 'ayuda chica', text: 'Escritos generados desde la pestaña Honorarios.' })));
    escritosPorAnio(cont, lista, 'No hay escritos de este tipo.');
  }

  function tarjetaEscrito(x) {
    var chk = h('input', { type: 'checkbox', checked: !!firmar.sel[x.id], 'aria-label': 'Seleccionar ' + x.d });
    var card = h('div', { class: 'escrito' + (firmar.sel[x.id] ? ' marcado' : '') },
      chk,
      h('div', { class: 'deudor', text: x.d }),
      h('div', { class: 'meta' },
        h('span', { class: 'expte', text: 'Expte. ' + x.e }),
        h('span', { class: 'chip-tipo' + (/REITERO/.test(x.tipo) ? ' reitero' : /^COMUNICO/.test(x.tipo) ? ' cancela' : ''),
                    text: /REITERO/.test(x.tipo) ? 'REITERO' : /^COMUNICO/.test(x.tipo) ? x.tipo.replace(/ DE LA DEUDA/, '') : /SENTENCIA/.test(x.tipo) ? 'PIDO SENTENCIA' : x.tipo }),
        h('span', { class: 'chip-arca' + (x.arca ? '' : ' falta'), text: x.arca ? (x.adjunto ? '📎 con IVP' : '📎 con ARCA') : (x.adjunto ? 'uniendo IVP…' : 'sin ARCA') }),
        x.nuevoEstado ? h('span', { class: 'ayuda chica', text: 'Al presentar: ESTADO → ' + x.nuevoEstado }) : null,
        h('span', { text: x.motivo })),
      x.aviso ? h('div', { class: 'alerta', text: '⚠ ' + x.aviso }) : null,
      h('div', { class: 'botones' },
        h('a', { class: 'btn primario', href: x.url, target: '_blank', rel: 'noopener' }, 'Abrir PDF'),
        h('button', { class: 'btn', type: 'button', onclick: function () { verJuicio(x.e); } }, 'Ver juicio'),
        h('button', { class: 'btn', type: 'button', onclick: function () { descartar(x); } }, 'Descartar')));
    chk.addEventListener('change', function () {
      if (chk.checked) firmar.sel[x.id] = true; else delete firmar.sel[x.id];
      card.classList.toggle('marcado', chk.checked);
      actualizarBarraAcciones();
    });
    return card;
  }

  function actualizarBarraAcciones() {
    var n = Object.keys(firmar.sel).length;
    $('barra-acciones').hidden = !(estado.vista === 'firmar' && n);
    $('acciones-texto').textContent = n + (n === 1 ? ' seleccionado' : ' seleccionados');
  }

  function marcarPresentados() {
    var ids = Object.keys(firmar.sel);
    if (!ids.length) return;
    var conEstado = (firmar.datos && firmar.datos.porFirmar || []).filter(function (x) { return firmar.sel[x.id] && x.nuevoEstado; }).length;
    if (!confirm('¿Ya firmaste y subiste al SAE ' + (ids.length === 1 ? 'este escrito' : 'estos ' + ids.length + ' escritos') +
                 '?\n\nSe va a anotar en el seguimiento del MAESTRO, con la fecha de hoy, lo que corresponde a cada uno (PIDO SENTENCIA, COMUNICO CANCELACIÓN…).' +
                 (conEstado ? '\nEn ' + conEstado + ' también se actualiza el ESTADO (CANCELADO TOTAL / PARCIAL).' : ''))) return;
    $('btn-presentados').disabled = true;
    mandar({ a: 'presentado', ids: ids, fecha: hoyInput() }, 'Presentado: ' + ids.length + (ids.length === 1 ? ' escrito' : ' escritos')).then(function (r) {
      $('btn-presentados').disabled = false;
      firmar.sel = {};
      if (!r) { sacarDeFirmar(ids); aviso('Sin conexión: se anota en el MAESTRO al volver la señal'); return; }
      aviso('Anotado en el MAESTRO: ' + r.presentados.length + ' juicio(s)' + (r.noEncontrados.length ? ' · no encontrados: ' + r.noEncontrados.join(', ') : ''));
      refrescar(true); cargarFirmar();
    }).catch(function (e) { $('btn-presentados').disabled = false; aviso('No se pudo: ' + traducirError(e)); });
  }

  function descartar(x) {
    if (!confirm('¿Descartar el escrito de ' + x.d + ' (' + x.e + ')? El PDF va a la papelera de Drive.')) return;
    mandar({ a: 'descartar', ids: [x.id] }, 'Descartar: ' + x.d).then(function (r) {
      delete firmar.sel[x.id];
      if (!r) { sacarDeFirmar([x.id]); aviso('Sin conexión: se descarta al volver la señal'); return; }
      aviso('Escrito descartado');
      cargarFirmar();
    }).catch(function (e) { aviso('No se pudo: ' + traducirError(e)); });
  }

  /** Sin conexión: saca los escritos de la lista (y de la copia guardada) hasta que el servidor los procese. */
  function sacarDeFirmar(ids) {
    if (!firmar.datos) return;
    firmar.datos.porFirmar = firmar.datos.porFirmar.filter(function (x) { return ids.indexOf(x.id) < 0; });
    var copia = leer(LS.firmar);
    if (copia && copia.porFirmar) { copia.porFirmar = copia.porFirmar.filter(function (x) { return ids.indexOf(x.id) < 0; }); guardar(LS.firmar, copia); }
    pintarFirmar();
  }

  // ───────── Honorarios: tablero de cobro (la planilla HONORARIOS es el archivo principal; la app solo la lee) ─────────
  // PIN: lo verifica el servidor; acá vive solo en memoria (no se guarda en el teléfono) y se borra al bloquear.
  var hon = { datos: null, cargando: false, periodo: 'semana', soloColor: '', pin: null, pinEstado: null, msgPin: '', ultimoUso: 0, oculto: 0,
              grupo: null,       // tarjeta abierta (null = las tarjetas); se recuerda mientras la app está abierta
              generados: [] };   // escritos generados desde esta pestaña (los formularios RH vienen del servidor: hon.datos.formularios)
  var HON_INACTIVO_MS = 10 * 60 * 1000, HON_FUERA_MS = 2 * 60 * 1000;

  function bloquearHon(msg) {
    hon.pin = null; hon.datos = null; hon.msgPin = msg || '';
    actualizarBtnHon();
    if (estado.vista === 'honorarios') pintarPin();
  }

  // Botón $ del encabezado: la dirección de HONORARIOS llega recién con el PIN; bloqueado, lleva a la pantalla del PIN.
  function actualizarBtnHon() {
    var b = $('btn-honorarios'), u = hon.pin && hon.datos && hon.datos.planilla && hon.datos.planilla.url;
    b.hidden = !estado.cfg;
    if (u) b.href = u; else b.removeAttribute('href');
  }
  function usoHon() { hon.ultimoUso = Date.now(); }
  setInterval(function () { if (hon.pin && Date.now() - hon.ultimoUso > HON_INACTIVO_MS) bloquearHon('Se bloqueó por 10 minutos sin uso.'); }, 30000);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hon.oculto = Date.now();
    else if (hon.pin && hon.oculto && Date.now() - hon.oculto > HON_FUERA_MS) bloquearHon('Se bloqueó porque saliste de la app.');
  });

  function pintarPin() {
    if (!hayRed()) return honSinRed();
    var cont = $('honorarios');
    cont.textContent = '';
    if (hon.pinEstado === null) {
      cont.appendChild(h('div', { class: 'cargando-txt', text: 'Un momento…' }));
      apiPost({ a: 'honPinEstado' }).then(function (r) { hon.pinEstado = r.configurado; pintarPin(); })
        .catch(function (e) { cont.textContent = ''; cont.appendChild(h('p', { class: 'error', text: 'No se pudo: ' + traducirError(e) })); });
      return;
    }
    var crear = !hon.pinEstado;
    var p1 = h('input', { class: 'campo-form campo-pin', type: 'password', inputmode: 'numeric', autocomplete: crear ? 'new-password' : 'current-password', maxlength: '8', placeholder: crear ? 'PIN nuevo (4 a 8 números)' : 'PIN', 'aria-label': 'PIN' });
    var p2 = crear ? h('input', { class: 'campo-form campo-pin', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', maxlength: '8', placeholder: 'Repetilo', 'aria-label': 'Repetir PIN' }) : null;
    var msg = h('p', { class: 'ayuda chica pin-msg', text: hon.msgPin });
    var btn = h('button', { class: 'btn primario', type: 'submit' }, crear ? 'Crear PIN y entrar' : 'Entrar');
    var form = h('form', { class: 'panel caja-pin' },
      h('div', { class: 'candado', text: '🔒' }),
      h('h2', { text: crear ? 'Creá un PIN para Honorarios' : 'Honorarios' }),
      h('p', { class: 'ayuda chica', text: crear ? 'Protege tus honorarios aunque alguien use la app en tu teléfono o en la computadora del trabajo. No se guarda en el dispositivo: se pide cada vez que entrás.'
                                             : 'Ingresá tu PIN. Se vuelve a pedir después de 10 minutos sin uso o si salís de la app.' }),
      p1, p2, msg, btn);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var a = p1.value.trim();
      if (!/^\d{4,8}$/.test(a)) { msg.textContent = 'El PIN tiene que tener entre 4 y 8 números.'; return; }
      if (crear && a !== p2.value.trim()) { msg.textContent = 'Los dos PIN no coinciden.'; return; }
      btn.disabled = true;
      (crear ? apiPost({ a: 'honPin', nuevo: a }) : Promise.resolve()).then(function () {
        hon.pinEstado = true; hon.pin = a; hon.msgPin = ''; usoHon();
        cargarHonorarios();
      }).catch(function (e) { btn.disabled = false; msg.textContent = traducirError(e); });
    });
    cont.appendChild(form);
    setTimeout(function () { p1.focus(); }, 50);
  }

  function cambiarPin() {
    var actual = prompt('PIN actual:');
    if (actual === null) return;
    var nuevo = prompt('PIN nuevo (4 a 8 números):');
    if (nuevo === null) return;
    if (!/^\d{4,8}$/.test(nuevo.trim())) { aviso('El PIN tiene que tener entre 4 y 8 números'); return; }
    if (prompt('Repetí el PIN nuevo:') !== nuevo) { aviso('Los PIN no coinciden'); return; }
    apiPost({ a: 'honPin', actual: actual.trim(), nuevo: nuevo.trim() }).then(function () { hon.pin = nuevo.trim(); aviso('PIN cambiado'); })
      .catch(function (e) { aviso(traducirError(e)); });
  }
  var TIPOS_CRUCE = {
    DUPLICADO: 'Posibles filas repetidas (inflan el total por cobrar)',
    AMARILLO_SIN_FECHA: 'En amarillo (cobrado) pero sin FECHA DE PAGO',
    PAGO_EN_FUCSIA: 'Con FECHA DE PAGO pero todavía en fucsia',
    COBRO_SIN_FECHA: 'Dice que se cobró, pero falta la FECHA DE PAGO',
    COBRADO_MAESTRO: 'Ya cobrados: falta cambiar el ESTADO en el MAESTRO',
    SAE_NUEVO: 'Movimientos del SAE que no están en HONORARIOS',
    MAESTRO_NUEVO: 'Movimientos del MAESTRO que no están en HONORARIOS',
    FALTA_EN_HONORARIOS: 'En HONORARIOS PENDIENTES (MAESTRO) pero no en la planilla HONORARIOS',
    POSIBLE_FALTA: 'Con sentencia y deuda cancelada: ¿falta cargarlos en HONORARIOS?'
  };

  function fechaIso(i) { return i ? i.slice(8, 10) + '/' + i.slice(5, 7) + '/' + i.slice(0, 4) : ''; }
  function fechaIsoCorta(i) { return i ? i.slice(8, 10) + '/' + i.slice(5, 7) : ''; }
  function diasDesdeIso(i) { return i ? Math.round((Date.now() - Date.parse(i + 'T12:00:00')) / 86400000) : null; }

  /** Enlace a la planilla HONORARIOS posicionado en la fila. */
  function urlFilaHon(r) {
    var p = hon.datos && hon.datos.planilla;
    return p && p.url ? p.url.replace(/[?#].*$/, '') + '#gid=' + p.gid + '&range=A' + r : '';
  }

  /** Hay un formulario abierto en Honorarios (Anotar, Escrito, Formulario RH…): una recarga automática no lo borra. */
  function honEditando() { return !!$('honorarios').querySelector('.area-accion form, .area-accion .form-hon'); }

  function honSinRed() {
    var c = $('honorarios');
    c.textContent = '';
    c.appendChild(h('div', { class: 'vacio' }, h('h2', { text: 'Honorarios necesita conexión' }),
      h('p', { text: 'El PIN lo controla el servidor y los datos de honorarios no se guardan en el teléfono. Volvé a entrar cuando tengas señal.' })));
  }

  function cargarHonorarios(silencioso) {
    if (!estado.cfg || hon.cargando) return;
    if (!hayRed() && !hon.datos) { honSinRed(); return; }
    if (!hon.pin) { pintarPin(); return; }
    hon.cargando = true;
    if (!hon.datos) pintarHonorarios();
    apiPost({ a: 'honorarios', pin: hon.pin }).then(function (d) {
      hon.cargando = false;
      if (!hon.pin) return;                                    // se bloqueó mientras cargaba
      // Un formulario recién pedido puede no estar todavía en lo que llegó: no se pierde.
      d.formularios = d.formularios || [];
      ((hon.datos && hon.datos.formularios) || []).forEach(function (x) { if (!d.formularios.some(function (y) { return y.job === x.job; })) d.formularios.push(x); });
      hon.datos = d;
      actualizarBtnHon();
      if (estado.vista === 'honorarios' && !(silencioso && honEditando())) pintarHonorarios();
      else refrescarGenerados();
      seguirFormRH();
      if (d.sae && d.sae.enCurso) setTimeout(function () { if (estado.vista === 'honorarios' && hon.pin) cargarHonorarios(true); }, 30000);
    }).catch(function (e) {
      hon.cargando = false;
      var m = String(e.message || e);
      if (/^SIN_PIN/.test(m)) { hon.pinEstado = false; return bloquearHon(''); }
      if (/^PIN_(INCORRECTO|BLOQUEADO)/.test(m)) return bloquearHon(m.replace(/^PIN_INCORRECTO: /, 'PIN incorrecto: ').replace(/^PIN_BLOQUEADO: /, 'Bloqueado: '));
      $('honorarios').textContent = '';
      $('honorarios').appendChild(h('p', { class: 'error', text: 'No se pudo cargar: ' + traducirError(e) }));
    });
  }

  function linkHon(r, texto) {
    var u = urlFilaHon(r);
    return u ? h('a', { class: 'btn', href: u, target: '_blank', rel: 'noopener', onclick: function (ev) { ev.stopPropagation(); } }, texto || 'Abrir en HONORARIOS ↗') : null;
  }

  function enMaestro(e) { return estado.filas.some(function (f) { return Buscador.exptesDe(f.e)[0] && Buscador.exptesDe(f.e)[0] === Buscador.exptesDe(e)[0]; }); }

  function pintarHonorarios() {
    var cont = $('honorarios'), d = hon.datos;
    if (!hon.pin) return pintarPin();
    cont.textContent = '';
    if (!d) { cont.appendChild(h('div', { class: 'cargando-txt', text: 'Leyendo la planilla HONORARIOS…' })); return; }

    if (d.errores && d.errores.length) {
      var pe = h('div', { class: 'panel caja-peligro' }, h('b', { text: '⚠ Hubo un error en el tablero de honorarios' }));
      d.errores.forEach(function (x) { pe.appendChild(h('div', { class: 'ayuda chica', style: 'color:inherit', text: x.fecha + ' · ' + x.origen + ': ' + x.error })); });
      cont.appendChild(pe);
    }

    // Tarjetas: una por sección (como en Para firmar y Agenda). Al abrir una, se ve solo esa sección.
    var L = d.listado, m = d.mes, F = m.facturas, per = hon.periodo === 'primer' ? d.primer : d.semana;
    var nombres = { semana: 'Listado de la semana', escritos: 'Escritos y Formulario RH', cobrado: 'Cobrado en ' + m.nombre.toLowerCase(), tramitados: 'Tramitados', revisar: 'Para revisar', alta: 'Agregar un juicio' };
    if (hon.grupo && nombres[hon.grupo]) {
      cont.appendChild(cabeceraGrupo(nombres[hon.grupo], function () { abrirGrupoHon(null); }));
      if (hon.grupo === 'semana') pintarListadoSemanal(cont, d);
      else if (hon.grupo === 'escritos') { cont.appendChild(panelEscritoHon()); cont.appendChild(h('div', { id: 'hon-generados' })); refrescarGenerados(); }
      else if (hon.grupo === 'cobrado') pintarCobradoMes(cont, m);
      else if (hon.grupo === 'tramitados') pintarTramitados(cont, d, per);
      else if (hon.grupo === 'revisar') pintarParaRevisar(cont, d);
      else if (hon.grupo === 'alta') pintarAltaHon(cont, d);
      cont.appendChild(pieGrupo(function () { abrirGrupoHon(null); }));
      return;
    }

    // Resumen + SAE
    var p = d.pendientes;
    var infoSae = d.sae.enCurso ? 'Consultando el SAE…' + (d.sae.quedan ? ' quedan ' + d.sae.quedan : '')
                : d.sae.ultima ? 'SAE consultado el ' + new Date(d.sae.ultima).toLocaleDateString('es-AR') + ' · se repite cada 7 días'
                : 'Todavía no se consultó el SAE';
    var btnSae = h('button', { class: 'btn', type: 'button', disabled: d.sae.enCurso }, d.sae.enCurso ? 'Consultando…' : 'Consultar SAE ahora');
    btnSae.addEventListener('click', function () {
      btnSae.disabled = true;
      apiPost({ a: 'honSae', pin: hon.pin }).then(function () { aviso('Consultando el SAE: tarda unos minutos'); setTimeout(cargarHonorarios, 30000); })
        .catch(function (e) { btnSae.disabled = false; aviso('No se pudo: ' + traducirError(e)); });
    });
    cont.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'fila-panel' },
        h('div', null, h('h2', { text: 'Honorarios por cobrar' }), h('div', { class: 'monto-grande', text: importe(p.total) }),
          h('div', { class: 'ayuda chica', text: (p.activos.length + p.dormidos.length) + ' pendientes · ' + p.activos.length + ' con movimiento desde el ' + fechaIso(p.desde) + ' (' + importe(p.totalActivos) + ')' })),
        h('a', { class: 'btn', href: d.planilla.url, target: '_blank', rel: 'noopener' }, 'Abrir HONORARIOS ↗')),
      h('div', { class: 'fila-panel', style: 'margin-top:8px' }, h('div', { class: 'ayuda chica', text: infoSae }), btnSae),
      h('div', { class: 'botones-hon' },
        h('button', { class: 'btn', type: 'button', onclick: function () { bloquearHon('Bloqueado.'); } }, '🔒 Bloquear'),
        h('button', { class: 'btn', type: 'button', onclick: cambiarPin }, 'Cambiar PIN'),
        h('button', { class: 'btn', type: 'button', onclick: function () { hon.verDatosPago = !hon.verDatosPago; pintarHonorarios(); } }, 'Datos para transferencia')),
      hon.verDatosPago ? formDatosPago(d.datosPago || {}) : null));

    var problemasFact = F && !F.error && (F.sinFactura.length || F.sinCobro.length || F.diferencias.length);
    var forms = d.formularios || [], armando = forms.filter(function (x) { return x.estado === 'EN_COLA'; }).length;
    var sinAnotar = forms.filter(function (x) { return x.estado === 'LISTO' && !anotadoTodo(x); }).length + hon.generados.filter(function (x) { return !anotadoTodo(x); }).length;
    var faltan = crucesFaltan(d);
    var datosTarjeta = {
      semana: { numero: L ? L.cantidad : 0, unidad: 'pendientes', info: L ? [importe(L.total), 'Tramitados: ' + L.tramitados + ' de ' + L.cantidad] : ['Se arma el domingo a la noche'] },
      escritos: { info: ['Orden de pago, embargo, planilla y regulación', 'Formulario del Registro (Res. 546)', forms.length ? 'Formularios de la semana: ' + forms.length : ''],
                  alerta: armando ? 'Armando ' + (armando === 1 ? '1 formulario…' : armando + ' formularios…') : sinAnotar ? sinAnotar + ' para anotar en las planillas' : '' },
      cobrado: { numero: importe(m.total), unidad: '', info: [m.registrados.length + (m.registrados.length === 1 ? ' cobro' : ' cobros')],
                 alerta: problemasFact || m.enTexto.length ? '⚠ Hay algo para verificar' : '' },
      tramitados: { numero: d.semana.lista.length, unidad: 'la semana pasada', info: ['Agosto – octubre: ' + d.primer.lista.length] },
      revisar: { numero: d.cruces.length, unidad: 'diferencias', info: ['HONORARIOS, MAESTRO y SAE'] },
      alta: { info: ['Un juicio del MAESTRO que no está en la planilla', 'Fila nueva en orden alfabético'],
              alerta: faltan.length ? (faltan.length === 1 ? '1 juicio' : faltan.length + ' juicios') + ' para revisar si falta' : '' }
    };
    var tarjetas = h('div', { class: 'tarjetas-grupo cuatro' });
    Object.keys(nombres).forEach(function (id) {
      tarjetas.appendChild(tarjetaGrupo(Object.assign({ nombre: nombres[id], abierta: false, entrar: true, onclick: function () { abrirGrupoHon(id); } }, datosTarjeta[id])));
    });
    cont.appendChild(tarjetas);
  }

  function abrirGrupoHon(id) { hon.grupo = id; pintarHonorarios(); window.scrollTo(0, 0); }

  // Cobrado el mes anterior (reporte mensual) y facturas del mes
  function pintarCobradoMes(cont, m) {
    var pm = h('div', { class: 'panel caja-ok' },
      h('div', { class: 'fila-panel' }, h('h2', { text: 'Cobrado en ' + m.nombre.toLowerCase() + ' ' + m.anio }), h('b', { class: 'monto-grande', text: importe(m.total) })),
      h('div', { class: 'ayuda chica', style: 'color:inherit', text: m.registrados.length ? m.registrados.length + (m.registrados.length === 1 ? ' cobro' : ' cobros') + ' con FECHA DE PAGO en la planilla' : 'No hay cobros con FECHA DE PAGO en ese mes' }));
    m.registrados.forEach(function (x) {
      var area = h('div', { class: 'area-accion' });
      pm.appendChild(h('div', { class: 'linea-cobro' }, h('span', { text: fechaIsoCorta(x.pago) }), h('span', { text: x.d + ' · ' + x.e }), h('b', { text: importe(x.monto) })));
      pm.appendChild(h('div', { class: 'comprobantes-cobro' }, enlacesComprobantes(x),
        h('button', { class: 'btn chico', type: 'button', onclick: function () { accion(area, 'comprobante', x, hon.datos); } }, (x.comprobantes || []).length ? '+ Comprobante' : '📎 Adjuntar comprobante')));
      pm.appendChild(area);
    });
    pm.appendChild(h('div', { class: 'ayuda chica', style: 'color:inherit;margin-top:8px;display:flex;gap:14px;flex-wrap:wrap' },
      m.pdf ? h('a', { href: m.pdf.url, target: '_blank', rel: 'noopener', text: 'Reporte en PDF ↗' }) : h('span', { text: 'El PDF se genera solo el primer día hábil del mes.' }),
      h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); Impresion.cobrosMes(m); }, text: 'Imprimir' })));
    cont.appendChild(pm);
    // Facturas emitidas del mes (carpeta FACTURAS <año> del Drive) contra los cobros
    var F = m.facturas;
    if (F && !F.error) {
      var hayProblemas = F.sinFactura.length || F.sinCobro.length || F.diferencias.length;
      var pf = h('div', { class: 'panel ' + (hayProblemas ? 'caja-aviso' : 'caja-ok') },
        h('div', { class: 'fila-panel' }, h('b', { text: '🧾 Facturas de ' + m.nombre.toLowerCase() + ': ' + F.cantidad }),
          F.carpeta ? h('a', { href: F.carpeta, target: '_blank', rel: 'noopener', text: 'Carpeta de facturas ↗' }) : null),
        h('div', { class: 'ayuda chica', style: 'color:inherit', text: 'Neto ' + importe(F.neto) + ' · IVA ' + importe(F.iva) + ' · total ' + importe(F.total) + ' · ' + F.conFactura + ' cobros con su factura' + (F.cartaPago.length ? ' · ' + F.cartaPago.length + ' con carta de pago' : '') }));
      var lista = function (titulo, items, txt) {
        if (!items.length) return;
        pf.appendChild(h('div', { class: 'ayuda chica', style: 'color:inherit;margin-top:6px;font-weight:700', text: titulo + ' (' + items.length + ')' }));
        items.forEach(function (x) { pf.appendChild(h('div', { class: 'ayuda chica', style: 'color:inherit', text: '· ' + txt(x) })); });
      };
      lista('Cobros sin factura en la carpeta', F.sinFactura, function (x) { return fechaIsoCorta(x.pago) + ' · ' + x.d + ' (' + x.e + ') · ' + importe(x.monto) + (x.factura ? ' · cargada: ' + x.factura : ''); });
      lista('Facturas sin cobro registrado en HONORARIOS', F.sinCobro, function (f) { return fechaIsoCorta(f.fecha) + ' · ' + f.numero + ' · ' + f.receptor + ' · neto ' + importe(f.neto); });
      lista('Montos que no coinciden', F.diferencias, function (x) { return x.cobro.d + ' (' + x.cobro.e + '): HONORARIOS ' + importe(x.cobro.monto) + ' / factura neto ' + importe(x.factura.neto); });
      if (F.ilegibles && F.ilegibles.length) lista('Facturas que no se pudieron leer', F.ilegibles, function (n) { return n; });
      cont.appendChild(pf);
    }
    if (m.enTexto.length) {
      var pt = h('div', { class: 'panel caja-aviso' }, h('b', { text: 'Para verificar: el seguimiento menciona ' + (m.enTexto.length === 1 ? 'un cobro' : m.enTexto.length + ' cobros') + ' de ' + m.nombre.toLowerCase() + ' sin FECHA DE PAGO en ese mes' }));
      m.enTexto.forEach(function (x) { pt.appendChild(h('div', { class: 'ayuda chica', style: 'color:inherit' }, fechaIsoCorta(x.fecha) + ' · ' + x.d + ' (' + x.e + '): ' + x.texto + ' ', linkHon(x.r, 'Abrir fila ↗'))); });
      cont.appendChild(pt);
    }
  }

  // Tramitados: semana pasada o primer reporte (agosto–octubre)
  function pintarTramitados(cont, d, per) {
    var seg = h('div', { class: 'seg' },
      h('button', { type: 'button', class: hon.periodo === 'semana' ? 'activo' : '', onclick: function () { hon.periodo = 'semana'; pintarHonorarios(); } },
        'Semana pasada (' + fechaIsoCorta(d.semana.desde) + ' – ' + fechaIsoCorta(d.semana.hasta) + ')'),
      h('button', { type: 'button', class: hon.periodo === 'primer' ? 'activo' : '', onclick: function () { hon.periodo = 'primer'; pintarHonorarios(); } },
        'Agosto – octubre'));
    cont.appendChild(h('div', { class: 'anio' }, 'Honorarios tramitados', h('small', { text: per.lista.length + ' juicios pendientes · los cobrados salen de la lista' })));
    seg.appendChild(h('button', { type: 'button', onclick: function () { Impresion.tramitados(per, hon.periodo === 'primer' ? 'Primer reporte (agosto – octubre)' : 'Semana anterior'); } }, '🖨 Imprimir'));
    cont.appendChild(seg);
    if (!per.lista.length) cont.appendChild(h('p', { class: 'ayuda', text: 'No hay juicios pendientes con movimientos en el TRAMITE PENDIENTE de HONORARIOS en ese período.' }));
    per.lista.forEach(function (x) { cont.appendChild(tarjetaHon(x, x.movs)); });
  }

  // Para revisar: cruce HONORARIOS × MAESTRO × SAE
  function pintarParaRevisar(cont, d) {
    var dr = h('div', null,
      h('p', { class: 'ayuda chica', text: 'Diferencias entre HONORARIOS, el MAESTRO y el SAE. Corregí la planilla y el aviso desaparece solo; si no corresponde, tocá "No corresponde".' }),
      d.cruces.length ? h('button', { class: 'btn', type: 'button', onclick: function () { Impresion.paraRevisar(d.cruces, TIPOS_CRUCE); } }, '🖨 Imprimir') : h('p', { class: 'ayuda', text: 'No hay diferencias para revisar.' }));
    var grupos = {};
    d.cruces.forEach(function (x) { (grupos[x.tipo] = grupos[x.tipo] || []).push(x); });
    Object.keys(TIPOS_CRUCE).forEach(function (t) {
      if (!grupos[t]) return;
      dr.appendChild(h('div', { class: 'anio' }, TIPOS_CRUCE[t], h('small', { text: String(grupos[t].length) })));
      grupos[t].forEach(function (x) {
        var item = h('div', { class: 'item-rev' }, h('b', { text: x.d }), h('div', { class: 'meta', text: 'Expte. ' + x.e }),
          h('div', { class: 'motivo', text: x.texto }));
        var area = h('div', { class: 'area-accion' }), fm = filaMaestro(x);
        var botones = h('div', { class: 'botones-hon' },
          x.r ? linkHon(x.r) : null,
          fm && !x.r ? h('button', { class: 'btn primario', type: 'button', onclick: function () { formAltaHon(area, fm, d); } }, 'Agregar a HONORARIOS') : null,
          enMaestro(x.e) ? h('button', { class: 'btn', type: 'button', onclick: function () { verJuicio(x.e); } }, 'Ver juicio') : null,
          h('button', { class: 'btn', type: 'button', onclick: function () {
            if (!confirm('¿Sacar este aviso de la lista? (' + x.d + ')')) return;
            apiPost({ a: 'honIgnorar', id: x.id, pin: hon.pin }).then(function () {
              hon.datos.cruces = hon.datos.cruces.filter(function (y) { return y.id !== x.id; });
              pintarHonorarios(); aviso('Aviso descartado');
            }).catch(function (e) { aviso('No se pudo: ' + traducirError(e)); });
          } }, 'No corresponde'));
        item.appendChild(botones);
        item.appendChild(area);
        dr.appendChild(item);
      });
    });
    cont.appendChild(dr);
  }

  // ───────── Agregar a HONORARIOS un juicio del MAESTRO que no está (pedido de Carlos, 04/11/2026) ─────────
  function crucesFaltan(d) { return (d.cruces || []).filter(function (x) { return x.tipo === 'FALTA_EN_HONORARIOS' || x.tipo === 'POSIBLE_FALTA'; }); }

  /** La fila del MAESTRO de un aviso (por número de fila; si cambió, por expediente). */
  function filaMaestro(x) {
    var clave = Buscador.exptesDe(x.e)[0];
    return estado.filas.filter(function (f) { return f.r === x.m && Buscador.exptesDe(f.e)[0] === clave; })[0] ||
           estado.filas.filter(function (f) { return clave && Buscador.exptesDe(f.e)[0] === clave; })[0] || null;
  }

  function filasEnHon(d, e) { var k = Buscador.exptesDe(e)[0]; return (k && d.enPlanilla && d.enPlanilla[k]) || []; }

  function pintarAltaHon(cont, d) {
    var caja = h('div'), lista = h('div', { class: 'man-lista' });
    var inp = h('input', { class: 'campo-form', type: 'search', autocomplete: 'off', placeholder: 'Expediente o deudor', 'aria-label': 'Expediente o deudor' });
    var elegir = function (f) {
      inp.value = f.e; lista.textContent = ''; caja.textContent = '';
      var area = h('div', { class: 'area-accion' });
      caja.appendChild(area);
      formAltaHon(area, f, d);
    };
    inp.addEventListener('input', function () {
      lista.textContent = ''; caja.textContent = '';
      var t = inp.value.trim();
      if (!t) return;
      Buscador.buscar(estado.indice, t, 6).forEach(function (r) {
        var f = estado.filas[r.i], ya = filasEnHon(d, f.e);
        lista.appendChild(h('button', { class: 'man-item', type: 'button', onclick: function () { elegir(f); } },
          h('b', { text: f.d }), h('span', { text: 'Expte. ' + f.e + ' · ' + (f.g || '') + (ya.length ? ' · ya está en HONORARIOS (fila ' + ya.join(', ') + ')' : '') })));
      });
    });
    cont.appendChild(h('div', { class: 'panel' },
      h('p', { class: 'ayuda chica', text: 'Buscá el juicio en el MAESTRO por expediente o deudor. Se agrega una fila nueva en HONORARIOS, en orden alfabético, con el deudor, la nominación, el expediente, el monto del juicio y el CUIT. Vos cargás el monto de honorarios (si ya lo sabés) y la primera línea del TRAMITE PENDIENTE.' }),
      inp, lista, caja));
    var faltan = crucesFaltan(d);
    if (!faltan.length) return;
    cont.appendChild(h('div', { class: 'anio' }, 'Sugeridos: en el MAESTRO y no en HONORARIOS', h('small', { text: String(faltan.length) })));
    faltan.forEach(function (x) {
      var area = h('div', { class: 'area-accion' }), fm = filaMaestro(x);
      cont.appendChild(h('div', { class: 'item-rev' }, h('b', { text: x.d }), h('div', { class: 'meta', text: 'Expte. ' + x.e }), h('div', { class: 'motivo', text: x.texto }),
        h('div', { class: 'botones-hon' },
          fm ? h('button', { class: 'btn primario', type: 'button', onclick: function () { formAltaHon(area, fm, d); } }, 'Agregar a HONORARIOS') : null,
          fm ? h('button', { class: 'btn', type: 'button', onclick: function () { verJuicio(x.e); } }, 'Ver juicio') : null),
        area));
    });
  }

  /** Datos del MAESTRO para revisar + monto de honorarios y primera línea del trámite; escribe con confirmación y PIN. */
  function formAltaHon(area, f, d) {
    if (area.dataset.tipo === 'alta') { area.textContent = ''; area.dataset.tipo = ''; return; }
    area.textContent = ''; area.dataset.tipo = 'alta';
    var ya = filasEnHon(d, f.e);
    var ult = Buscador.seguimiento(f.f).filter(function (x) { return x.fecha; })[0];
    var monto = h('input', { class: 'campo-form', inputmode: 'decimal', placeholder: 'Monto de honorarios (opcional)', 'aria-label': 'Monto de honorarios' });
    var texto = h('textarea', { class: 'campo-form', rows: '3', 'aria-label': 'Primera línea del TRAMITE PENDIENTE' });
    texto.value = 'SE CARGA EN HONORARIOS.' + (ult ? ' ÚLTIMO MOVIMIENTO (' + ult.fecha + '): ' + ult.texto.slice(0, 200) : '');
    var repetir = h('input', { type: 'checkbox' });
    var dato = function (k, v) { return h('div', { class: 'meta' }, h('b', { text: k + ': ' }), String(v || '—')); };
    var fo = h('form', { class: 'form-hon' },
      h('div', { class: 'ayuda chica', text: 'Datos del MAESTRO (fila ' + f.r + '):' }),
      dato('Demandado', f.d), dato('Nominación', Buscador.nominacion(f.n).texto), dato('Expediente', f.e), dato('Monto del juicio', importe(f.i)), dato('CUIT', cuit(f.c)), dato('Estado', f.g),
      ya.length ? h('div', { class: 'alerta' }, 'Este expediente ya está en HONORARIOS (fila ' + ya.join(', ') + '). ',
        h('label', null, repetir, ' Es otra regulación: agregar otra fila')) : null,
      h('label', { class: 'etiqueta', text: 'Monto de honorarios' }), monto,
      h('label', { class: 'etiqueta', text: 'TRAMITE PENDIENTE (se anota con la fecha de hoy)' }), texto,
      h('button', { class: 'btn primario', type: 'submit' }, 'Agregar a HONORARIOS'));
    fo.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (ya.length && !repetir.checked) { aviso('Ya está en HONORARIOS: si es otra regulación, marcá "agregar otra fila"'); return; }
      var t = texto.value.trim(), mh = monto.value.trim(), n = mh ? numeroAr(mh) : null;
      if (t.length < 3) { aviso('Escribí la primera línea del TRAMITE PENDIENTE'); return; }
      if (mh && !n) { aviso('El monto de honorarios no es válido'); return; }
      escribirHon({ a: 'honAlta', e: f.e, m: f.r, monto: n ? n.toFixed(2) : '', texto: t, repetir: repetir.checked },
        'Se agrega una fila nueva en HONORARIOS, en orden alfabético:\n\n' + f.d + '\nExpte. ' + f.e + ' · ' + Buscador.nominacion(f.n).texto +
        '\nMonto del juicio: ' + importe(f.i) + '\nHonorarios: ' + (n ? importe(n) : '(sin cargar)') + '\nCUIT: ' + cuit(f.c) +
        '\n\nTRAMITE PENDIENTE:\n- ' + isoADmy(hoyInput()) + ': ' + t.toUpperCase() + '\n\n¿Confirmás?', 'Agregado en HONORARIOS')
        .then(function (ok) { if (ok) { area.textContent = ''; area.dataset.tipo = ''; } });
    });
    area.appendChild(fo);
    monto.focus();
  }

  function formDatosPago(dp) {
    var campos = [['titular', 'Titular'], ['cuit', 'CUIT'], ['banco', 'Banco'], ['cuenta', 'Cuenta (Ej.: Cte. Cte. en $ N° …)'], ['cbu', 'CBU / CVU (22 números)'], ['alias', 'Alias']];
    var inputs = {};
    var f = h('form', { class: 'form-hon' }, h('div', { class: 'ayuda chica', text: 'Van en los mensajes de reclamo y en los pedidos de orden de pago. Se guardan en tu Google (protegidos por el PIN).' }),
      campos.map(function (c) { inputs[c[0]] = h('input', { class: 'campo-form', value: dp[c[0]] || '', placeholder: c[1], 'aria-label': c[1] }); return inputs[c[0]]; }),
      h('button', { class: 'btn primario', type: 'submit' }, 'Guardar datos'));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var b = { a: 'honDatosPago', pin: hon.pin };
      Object.keys(inputs).forEach(function (k) { b[k] = inputs[k].value; });
      apiPost(b).then(function () { hon.verDatosPago = false; aviso('Datos guardados'); cargarHonorarios(); }).catch(function (e) { aviso(traducirError(e)); });
    });
    return f;
  }

  var GRUPOS_SEMANA = [['CUOTA', 'Cuotas que vencen', true], ['PRIORIDAD', 'Prioridad: fondos embargados, orden de pago, fechas anotadas', true], ['RESTO', 'Resto de los pendientes (por monto)', false]];

  function pintarListadoSemanal(cont, d) {
    var L = d.listado;
    if (!L) return;
    var ant = L.anteriores || [];
    var inicio = ant.filter(function (a) { return a.lunes === L.lunes; })[0];
    var previa = ant.filter(function (a) { return a.lunes < L.lunes; })[0];
    var montoCobrado = L.cobrados.reduce(function (t, x) { return t + (x.cuota ? x.cuota.monto : (x.monto || 0)); }, 0);
    var pct = L.cantidad ? Math.round(L.tramitados / L.cantidad * 100) : 0;
    var cab = h('div', { class: 'panel panel-semana' },
      h('div', { class: 'fila-panel' }, h('h2', { text: 'Semana del ' + fechaIsoCorta(L.lunes) + ' al ' + fechaIsoCorta(L.domingo) }), h('b', { class: 'monto-grande', text: importe(L.total) })),
      h('div', { class: 'ayuda chica', text: L.cantidad + ' honorarios pendientes · salen de la lista solo cuando se cobran' }),
      h('div', { class: 'progreso', title: pct + '%' }, h('span', { style: 'width:' + pct + '%' })),
      h('div', { class: 'ayuda chica', text: 'Tramitados esta semana: ' + L.tramitados + ' de ' + L.cantidad + ' · Cobrados: ' + L.cobrados.length + (L.cobrados.length ? ' (' + importe(montoCobrado) + ')' : '') }),
      inicio || previa ? h('div', { class: 'ayuda chica', text: (inicio ? 'Al empezar la semana: ' + inicio.pendientes + ' (' + importe(inicio.saldo) + '). ' : '') +
        (previa ? 'Semana anterior: ' + previa.pendientes + ' pendientes' + (inicio ? (inicio.pendientes < previa.pendientes ? ' → la lista se achicó en ' + (previa.pendientes - inicio.pendientes) + '.' : ' → la lista NO se achicó.') : '.') : '') }) : null,
      h('div', { class: 'botones-hon' },
        h('button', { class: 'btn', type: 'button', onclick: function () { Impresion.semanal(L, filtro); } }, iconoImpresora(), 'Imprimir listado'),
        ant[0] && ant[0].pdf ? h('a', { class: 'btn', href: ant[0].pdf, target: '_blank', rel: 'noopener' }, 'PDF del domingo ↗') : null));
    cont.appendChild(cab);

    // Filtro por color de la planilla (fucsia = trámite reciente)
    var todos = [].concat(L.grupos.CUOTA, L.grupos.PRIORIDAD, L.grupos.RESTO), colores = {};
    todos.forEach(function (x) { if (x.color) colores[x.color] = (colores[x.color] || 0) + 1; });
    var filtro = function (x) { return !hon.soloColor || x.color === hon.soloColor; };
    var lc = Object.keys(colores).sort(function (a, b) { return colores[b] - colores[a]; });
    if (lc.length) {
      var segC = h('div', { class: 'seg' }, h('button', { type: 'button', class: hon.soloColor ? '' : 'activo', onclick: function () { hon.soloColor = ''; pintarHonorarios(); } }, 'Todos (' + todos.length + ')'));
      lc.forEach(function (c) {
        var nom = (todos.filter(function (x) { return x.color === c; })[0] || {}).colorNombre || 'color';
        segC.appendChild(h('button', { type: 'button', class: hon.soloColor === c ? 'activo' : '', onclick: function () { hon.soloColor = c; pintarHonorarios(); } },
          h('span', { class: 'punto', style: 'background:' + c }), ' ' + nom + ' (' + colores[c] + ')'));
      });
      cont.appendChild(segC);
    }
    GRUPOS_SEMANA.forEach(function (g) {
      var lista = L.grupos[g[0]].filter(filtro);
      if (!lista.length) return;
      hon.abiertos = hon.abiertos || {};
      var abierto = g[0] in hon.abiertos ? hon.abiertos[g[0]] : g[2];
      var det = h('details', { class: 'grupo', open: abierto }, h('summary', { text: g[1] + ' (' + lista.length + ' · ' + importe(lista.reduce(function (t, x) { return t + (x.saldo || 0); }, 0)) + ')' }));
      det.addEventListener('toggle', function () { hon.abiertos[g[0]] = det.open; });
      lista.forEach(function (x) { det.appendChild(tarjetaSemana(x, d)); });
      cont.appendChild(det);
    });
    if (L.cobrados.length) {
      var dc = h('details', { class: 'grupo' }, h('summary', { text: 'Cobrados esta semana (' + L.cobrados.length + ')' }));
      L.cobrados.forEach(function (x) {
        dc.appendChild(h('div', { class: 'item-rev cobrado-sem' }, h('b', { text: '✓ ' + x.d }),
          h('div', { class: 'meta', text: 'Expte. ' + x.e + ' · ' + (x.cuota ? 'cuota ' + x.cuota.n + '/' + x.cuota.de + ' · ' + importe(x.cuota.monto) : importe(x.monto)) })));
      });
      cont.appendChild(dc);
    }
  }

  function tarjetaSemana(x, d) {
    var area = h('div', { class: 'area-accion' });
    var card = h('div', { class: 'item-rev' + (x.tramitado ? ' tramitado' : ''), style: x.color ? 'border-left:6px solid ' + x.color : null },
      h('div', { class: 'fila-panel' }, h('b', { text: x.d }), h('span', { class: 'monto', text: importe(x.saldo != null ? x.saldo : x.monto) })),
      h('div', { class: 'meta' }, 'Expte. ' + x.e + (x.n ? ' · ' + x.n : '') + ' ', x.tramitado ? h('span', { class: 'chip-tipo', text: 'TRAMITADO ESTA SEMANA' }) : null),
      x.motivo ? h('div', { class: 'motivo', text: x.motivo }) : null,
      x.plan ? h('div', { class: 'meta', text: 'Plan: ' + x.plan.cantidad + ' cuotas de ' + importe(x.plan.monto) + ' · pagadas ' + x.plan.pagadas + (x.plan.proximo ? ' · próxima ' + fechaIso(x.plan.proximo) : '') }) : null,
      h('div', { class: 'motivo tranquilo', text: x.ult ? 'Último: ' + fechaIso(x.ult.fecha) + ' (' + diasTexto(diasDesdeIso(x.ult.fecha)) + ') · ' + x.ult.texto : 'Sin movimientos con fecha' }),
      x.paso ? h('div', { class: 'paso', text: '→ Tu próximo paso: ' + x.paso.texto }) : null,
      (x.comprobantes || []).length ? h('div', { class: 'comprobantes-cobro' }, enlacesComprobantes(x)) : null,
      h('div', { class: 'botones-hon' },
        h('button', { class: 'btn', type: 'button', onclick: function () { accion(area, 'anotar', x, d); } }, 'Anotar'),
        h('button', { class: 'btn', type: 'button', onclick: function () { accion(area, 'reclamar', x, d); } }, 'Reclamar'),
        h('button', { class: 'btn', type: 'button', onclick: function () { accion(area, x.plan ? 'cuota' : 'cobro', x, d); } }, x.plan ? 'Cobrar cuota' : 'Cobro'),
        x.plan ? null : h('button', { class: 'btn', type: 'button', onclick: function () { accion(area, 'plan', x, d); } }, 'Cuotas'),
        h('button', { class: 'btn', type: 'button', onclick: function () { accion(area, 'comprobante', x, d); } }, 'Comprobante'),
        h('button', { class: 'btn', type: 'button', onclick: function () { accion(area, 'formulario', x, d); } }, 'Formulario RH'),
        h('button', { class: 'btn', type: 'button', onclick: function () { accion(area, 'escrito', x, d); } }, 'Escrito'),
        linkHon(x.r, 'Fila ↗')),
      area);
    return card;
  }

  function hoyInput() { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function isoADmy(i) { return i ? i.slice(8, 10) + '/' + i.slice(5, 7) + '/' + i.slice(0, 4) : ''; }

  /** Escribe en HONORARIOS (con confirmación) y recarga la pestaña. */
  function escribirHon(cuerpo, pregunta, ok) {
    if (!confirm(pregunta)) return Promise.resolve(false);
    cuerpo.pin = hon.pin;
    return apiPost(cuerpo).then(function (r) { aviso(ok + (r.linea ? ': ' + r.linea : '')); cargarHonorarios(); return true; })
      .catch(function (e) { aviso('No se pudo: ' + traducirError(e)); return false; });
  }

  function mensajeReclamo(x, dp) {
    var l = ['Estimados: me comunico por los honorarios regulados en el juicio "PROVINCIA DE TUCUMÁN –D.G.R.– c/ ' + x.d + ' s/ Ejecución Fiscal", Expte. N° ' + x.e + (x.n ? ' (' + x.n + ')' : '') + '.',
             'El importe a abonar es de ' + importe(x.plan ? x.plan.monto : (x.saldo != null ? x.saldo : x.monto)) + (x.plan ? ' (cuota ' + (x.plan.pagadas + 1) + ' de ' + x.plan.cantidad + ')' : '') + '.'];
    if (dp.cbu || dp.alias) {
      l.push('', 'Datos para la transferencia:');
      if (dp.titular) l.push('Titular: ' + dp.titular);
      if (dp.cuit) l.push('CUIT: ' + dp.cuit);
      if (dp.banco) l.push('Banco: ' + dp.banco);
      if (dp.cbu) l.push('CBU/CVU: ' + dp.cbu);
      if (dp.alias) l.push('Alias: ' + dp.alias);
    }
    l.push('', 'Una vez realizado el pago, les pido que me envíen el comprobante para emitir la factura. Quedo a disposición.', '', 'Dr. Carlos E. Arias', 'Apoderado Fiscal – DGR Tucumán – Mat. 4831');
    return l.join('\n');
  }

  function accion(area, tipo, x, d) {
    if (area.dataset.tipo === tipo) { area.textContent = ''; area.dataset.tipo = ''; return; }
    area.textContent = ''; area.dataset.tipo = tipo;
    var base = { r: x.r, e: x.e };
    function form(hijos, alEnviar) {
      var f = h('form', { class: 'form-hon' }, hijos);
      f.addEventListener('submit', function (ev) { ev.preventDefault(); alEnviar(); });
      area.appendChild(f);
      var primero = f.querySelector('input,textarea,select'); if (primero) setTimeout(function () { primero.focus(); }, 50);
    }
    if (tipo === 'anotar') {
      var ta = h('textarea', { class: 'campo-form', rows: '2', placeholder: 'Qué hiciste hoy (se anota con la fecha de hoy)' });
      var rapidos = ['LE MANDÉ MSJ RECLAMANDO HONORARIOS', 'PIDO ORDEN DE PAGO', 'ACTUALIZO PLANILLA POR HONORARIOS', 'PRESENTO EN EL REGISTRO DE HONORARIOS', 'PIDO EMBARGO POR HONORARIOS'];
      form([ta, h('div', { class: 'seg' }, rapidos.map(function (t) { return h('button', { type: 'button', onclick: function () { ta.value = t; } }, t); })),
            h('button', { class: 'btn primario', type: 'submit' }, 'Anotar en HONORARIOS')], function () {
        escribirHon(Object.assign({ a: 'honAnotar', texto: ta.value }, base), 'Se agrega en HONORARIOS (fila ' + x.r + '):\n\n- ' + isoADmy(hoyInput()) + ': ' + ta.value.toUpperCase(), 'Anotado');
      });
    } else if (tipo === 'reclamar') {
      var dp = d.datosPago || {}, msg = mensajeReclamo(x, dp);
      var mail = (String(x.contacto || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [])[0];
      var wa = 'https://wa.me/' + (x.telefono ? '549' + x.telefono : '') + '?text=' + encodeURIComponent(msg);
      var anotarTras = function (t) {
        area.appendChild(h('div', { class: 'form-hon' }, h('div', { class: 'ayuda chica', text: '¿Lo mandaste? Anotalo en HONORARIOS:' }),
          h('button', { class: 'btn primario', type: 'button', onclick: function () { escribirHon(Object.assign({ a: 'honAnotar', texto: t }, base), 'Se agrega en HONORARIOS:\n\n- ' + isoADmy(hoyInput()) + ': ' + t, 'Anotado'); } }, 'Anotar: ' + t)));
      };
      area.appendChild(h('div', { class: 'form-hon' },
        !dp.cbu && !dp.alias ? h('div', { class: 'alerta', text: 'Todavía no cargaste tus datos para transferencia (botón "Datos para transferencia", arriba).' }) : null,
        h('pre', { class: 'msg-reclamo', text: msg }),
        h('div', { class: 'botones-hon' },
          h('a', { class: 'btn primario', href: wa, target: '_blank', rel: 'noopener', onclick: function () { anotarTras('LE MANDÉ WHATSAPP' + (x.telefono ? ' AL ' + x.telefono : '') + ' RECLAMANDO HONORARIOS: ' + importe(x.saldo != null ? x.saldo : x.monto)); } }, 'WhatsApp' + (x.telefono ? '' : ' (elegís el contacto)')),
          h('a', { class: 'btn', href: 'mailto:' + (mail || '') + '?subject=' + encodeURIComponent('Honorarios – Expte. ' + x.e + ' – ' + x.d) + '&body=' + encodeURIComponent(msg),
                   onclick: function () { anotarTras('LE MANDÉ MAIL' + (mail ? ' A ' + mail : '') + ' RECLAMANDO HONORARIOS: ' + importe(x.saldo != null ? x.saldo : x.monto)); } }, 'Mail' + (mail ? ' a ' + mail : '')),
          h('button', { class: 'btn', type: 'button', onclick: function () { copiar(msg, 'Mensaje copiado'); } }, 'Copiar'))));
    } else if (tipo === 'cobro' || tipo === 'cuota') {
      var fe = h('input', { class: 'campo-form', type: 'date', value: hoyInput(), 'aria-label': 'Fecha de pago' });
      var mo = h('select', { class: 'campo-form', 'aria-label': 'Modo de pago' }, h('option', { value: '', text: 'Modo de pago…' }), (d.modosPago || []).map(function (m) { return h('option', { value: m, text: m }); }));
      var fa = h('input', { class: 'campo-form', placeholder: 'Factura / recibo (opcional)', 'aria-label': 'Factura' });
      var comp = camposComprobante();
      var cuotaTxt = x.plan ? 'cuota ' + (x.plan.pagadas + 1) + ' de ' + x.plan.cantidad + ' (' + importe(x.plan.monto) + ')' : '';
      form([h('div', { class: 'ayuda chica', text: tipo === 'cuota' ? 'Cobro de la ' + cuotaTxt + '.' + (x.plan.pagadas + 1 === x.plan.cantidad ? ' Es la última: la fila queda cobrada (amarilla).' : ' Sale de la lista hasta la semana del próximo vencimiento.')
                                                      : 'Se completa FECHA DE PAGO, MODO y FACTURA, y la fila se pinta de amarillo.' }), fe, mo, fa, comp.nodo,
            h('button', { class: 'btn primario', type: 'submit' }, tipo === 'cuota' ? 'Registrar cobro de la cuota' : 'Registrar cobro')], function () {
        if (!mo.value) { aviso('Elegí el modo de pago'); return; }
        var arch = comp.archivo.files[0];
        escribirHon(Object.assign({ a: tipo === 'cuota' ? 'honCuota' : 'honCobro', fecha: isoADmy(fe.value), modo: mo.value, factura: fa.value }, base),
          (tipo === 'cuota' ? '¿Registrar el cobro de la ' + cuotaTxt : '¿Registrar el cobro de ' + importe(x.saldo != null ? x.saldo : x.monto)) + ' de ' + x.d + ' (' + x.e + ')?\n\nFecha: ' + isoADmy(fe.value) + ' · ' + mo.value + (fa.value ? ' · Factura ' + fa.value : '') +
          (arch ? '\n\nY se guarda el comprobante (' + comp.tipo.options[comp.tipo.selectedIndex].text.toLowerCase() + ') en la columna AGREGAR FACTURA/CARTA DE PAGO.' : ''), 'Cobro registrado')
          .then(function (ok) { if (ok && arch) subirComprobante(x, comp.tipo.value, fa.value, arch); });
      });
    } else if (tipo === 'plan') {
      var n = h('input', { class: 'campo-form', type: 'number', min: '2', max: '36', value: '3', 'aria-label': 'Cantidad de cuotas' });
      var mc = h('input', { class: 'campo-form', type: 'number', step: '0.01', 'aria-label': 'Monto de cada cuota' });
      var pr = h('input', { class: 'campo-form', type: 'date', value: hoyInput(), 'aria-label': 'Vencimiento de la primera cuota' });
      var calc = function () { if (x.saldo) mc.value = (Math.round(x.saldo / Math.max(2, Number(n.value) || 2) * 100) / 100).toFixed(2); };
      n.addEventListener('input', calc); calc();
      form([h('div', { class: 'ayuda chica', text: 'Plan de pago de los honorarios: cantidad de cuotas, monto de cada una y vencimiento de la primera (las demás, el mismo día de cada mes).' }),
            h('label', { class: 'etiqueta', text: 'Cuotas' }), n, h('label', { class: 'etiqueta', text: 'Monto de cada cuota' }), mc, h('label', { class: 'etiqueta', text: '1ª cuota vence' }), pr,
            h('button', { class: 'btn primario', type: 'submit' }, 'Guardar plan de cuotas')], function () {
        escribirHon(Object.assign({ a: 'honPlanCuotas', cantidad: n.value, monto: mc.value, primera: isoADmy(pr.value) }, base),
          'Plan de ' + n.value + ' cuotas de ' + importe(Number(mc.value)) + ', 1ª el ' + isoADmy(pr.value) + ', para ' + x.d + ' (' + x.e + '). ¿Confirmás?', 'Plan guardado');
      });
    } else if (tipo === 'comprobante') {
      var cc = camposComprobante(true);
      form([h('div', { class: 'ayuda chica', text: 'Factura, recibo o carta de pago (PDF o foto). Se guarda en el Drive y queda como enlace en la columna AGREGAR FACTURA/CARTA DE PAGO de HONORARIOS: tocándolo se abre.' }),
            cc.nodo, h('button', { class: 'btn primario', type: 'submit' }, 'Guardar comprobante')], function () {
        var a = cc.archivo.files[0];
        if (!a) { aviso('Elegí el archivo'); return; }
        if (!confirm('¿Guardar ' + cc.tipo.options[cc.tipo.selectedIndex].text.toLowerCase() + (cc.numero.value ? ' ' + cc.numero.value : '') + ' de ' + x.d + ' (' + x.e + ')?\n\nArchivo: ' + a.name)) return;
        area.textContent = ''; area.dataset.tipo = '';
        subirComprobante(x, cc.tipo.value, cc.numero.value, a);
      });
    } else if (tipo === 'formulario') {
      formularioRH(area, x);
    } else if (tipo === 'escrito') {
      area.appendChild(formEscritoHon({ e: x.e, d: x.d, r: x.r, saldo: x.saldo != null ? x.saldo : x.monto }));
    }
  }

  // ───────── Comprobantes de pago: columna AGREGAR FACTURA/CARTA DE PAGO de HONORARIOS ─────────
  var TIPOS_COMPROBANTE = [['FACTURA', 'Factura'], ['RECIBO', 'Recibo'], ['CARTA', 'Carta de pago']];
  var MAX_COMPROBANTE = 15 * 1024 * 1024;

  function enlacesComprobantes(x) {
    return (x.comprobantes || []).map(function (c) { return h('a', { class: 'enlace-comprobante', href: c.url, target: '_blank', rel: 'noopener', text: '📎 ' + (c.texto || 'Comprobante') }); });
  }

  /** Tipo, número y archivo. conNumero: pide también el número (al registrar un cobro ya se carga en "Factura / recibo"). */
  function camposComprobante(conNumero) {
    var tipo = h('select', { class: 'campo-form', 'aria-label': 'Tipo de comprobante' }, TIPOS_COMPROBANTE.map(function (t) { return h('option', { value: t[0], text: t[1] }); }));
    var numero = h('input', { class: 'campo-form', placeholder: 'Número (opcional)', 'aria-label': 'Número del comprobante', maxlength: '30' });
    var archivo = h('input', { class: 'campo-form', type: 'file', accept: 'application/pdf,image/*', 'aria-label': 'Archivo del comprobante' });
    return { tipo: tipo, numero: numero, archivo: archivo,
             nodo: h('div', { class: 'campo-rh' }, h('label', { class: 'etiqueta', text: conNumero ? 'Comprobante' : 'Comprobante (opcional): factura, recibo o carta de pago' }), tipo, conNumero ? numero : null, archivo) };
  }

  /** PDF tal cual; las fotos grandes se achican (el teléfono saca fotos de varios MB). */
  function prepararArchivo(f) {
    var mime = f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '');
    var leerB64 = function (blob) {
      return new Promise(function (ok, mal) {
        var fr = new FileReader();
        fr.onload = function () { ok(String(fr.result).split(',')[1] || ''); };
        fr.onerror = function () { mal(new Error('No se pudo leer el archivo')); };
        fr.readAsDataURL(blob);
      });
    };
    if (!/^image\/(jpeg|png)$/.test(mime) || f.size < 1500000) {
      if (f.size > MAX_COMPROBANTE) return Promise.reject(new Error('El archivo pesa más de 15 MB'));
      return leerB64(f).then(function (d) { return { mime: mime, datos: d }; });
    }
    return new Promise(function (ok) {
      var img = new Image(), u = URL.createObjectURL(f);
      img.onload = function () {
        var k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        ok({ mime: 'image/jpeg', datos: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(u); ok(leerB64(f).then(function (d) { return { mime: mime, datos: d }; })); };
      img.src = u;
    });
  }

  function subirComprobante(x, tipo, numero, archivo) {
    aviso('Subiendo el comprobante…');
    return prepararArchivo(archivo).then(function (a) {
      return apiPost({ a: 'honComprobante', pin: hon.pin, r: x.r, e: x.e, tipo: tipo, numero: numero || '', mime: a.mime, datos: a.datos });
    }).then(function (r) { aviso('Comprobante guardado: ' + r.celda); cargarHonorarios(true); })
      .catch(function (e) { aviso('No se pudo guardar el comprobante: ' + traducirError(e)); });
  }

  // ───────── Escritos para cobrar honorarios (modelos sellados el 30/10/2026; EscritosHon.js) ─────────
  var TIPOS_ESCRITO_HON = [['ORDEN_PAGO', 'Solicito orden de pago'], ['EMBARGO', 'Pido embargo ejecutorio por honorarios'],
                           ['PLANILLA', 'Actualizo planilla por honorarios'], ['REGULACION', 'Solicito regulación de honorarios']];
  function numeroAr(v) {
    var t = String(v || '').replace(/[$\s]/g, '');
    if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/\./g, '');
    var n = Number(t);
    return t && n > 0 ? n : null;
  }
  function campoHon(etiqueta, atributos) {
    var i = h('input', Object.assign({ class: 'campo-form', 'aria-label': etiqueta }, atributos || {}));
    return { input: i, nodo: h('div', { class: 'campo-rh' }, h('label', { class: 'etiqueta', text: etiqueta }), i) };
  }

  /** @param j {e, d, r, saldo} el juicio (r: su fila en HONORARIOS, si se conoce) */
  function formEscritoHon(j) {
    var f = h('form', { class: 'form-hon' });
    var sel = h('select', { class: 'campo-form', 'aria-label': 'Tipo de escrito' }, TIPOS_ESCRITO_HON.map(function (t) { return h('option', { value: t[0], text: t[1] }); }));
    var campos = h('div', { class: 'form-hon-campos' }), resumen = h('div', { class: 'ayuda chica' }), resultado = h('div');
    var boton = h('button', { class: 'btn primario', type: 'submit' }, 'Generar escrito');
    var leer = function () { return {}; };
    var clave = Buscador.exptesDe(j.e)[0], fila = estado.filas.filter(function (x) { return clave && Buscador.exptesDe(x.e)[0] === clave; })[0];
    var dinero = function (e, valor) { return campoHon(e, { inputmode: 'decimal', value: valor ? montoATexto(valor) : '', placeholder: 'Ej.: 350.000 o 60.174,14' }); };
    var fecha = function (e, valor) { return campoHon(e, { type: 'date', value: valor || '' }); };
    function dibujar() {
      campos.textContent = ''; resumen.textContent = ''; resultado.textContent = '';
      var t = sel.value;
      if (t === 'ORDEN_PAGO' || t === 'EMBARGO') {
        var hon_ = dinero('Honorarios', j.saldo);
        var cuentas = function () {
          var n = numeroAr(hon_.input.value);
          if (!n) { resumen.textContent = ''; return; }
          var iva = Math.round(n * 21) / 100, ap = Math.round(n * 10) / 100;
          resumen.textContent = 'IVA 21 %: $ ' + montoATexto(iva) + ' · Aportes 10 %: $ ' + montoATexto(ap) + ' · Total: $ ' + montoATexto(n + iva + ap);
        };
        hon_.input.addEventListener('input', cuentas);
        campos.appendChild(hon_.nodo);
        if (t === 'ORDEN_PAGO') {
          var emb = dinero('Embargado a la orden del Juzgado');
          campos.appendChild(emb.nodo);
          campos.appendChild(h('div', { class: 'ayuda chica', text: 'La cuenta sale de "Datos para transferencia".' }));
          leer = function () { return { honorarios: hon_.input.value, embargado: emb.input.value }; };
        } else {
          var base = h('select', { class: 'campo-form', 'aria-label': 'Qué se ejecuta' }, h('option', { value: 'REGULACION', text: 'Firme la regulación de honorarios' }), h('option', { value: 'PLANILLA', text: 'Firme la planilla de actualización' }));
          var cuit = campoHon('CUIT del demandado', { inputmode: 'numeric', value: fila && fila.c ? String(fila.c).replace(/\D/g, '') : '' });
          var banco = campoHon('Banco', { placeholder: 'Ej.: BANCO DE GALICIA Y BUENOS AIRES SAU' });
          campos.appendChild(base); campos.appendChild(cuit.nodo); campos.appendChild(banco.nodo);
          leer = function () { return { honorarios: hon_.input.value, base: base.value, cuit: cuit.input.value, banco: banco.input.value }; };
        }
        cuentas();
      } else if (t === 'PLANILLA') {
        var fo = fecha('Fecha del oficio de la orden de pago'), pa = dinero('Monto pagado'), fr = fecha('Fecha de la sentencia de regulación'),
            ha = fecha('Actualizado hasta', hoyInput()), ba = dinero('Base de la actualización'), ac = dinero('Monto actualizado (de la planilla)');
        var cu = h('input', { type: 'checkbox', 'aria-label': 'Fue un pago a cuenta' });
        var calc = function () {
          var a = numeroAr(ac.input.value), p = numeroAr(pa.input.value);
          resumen.textContent = a && p ? (a > p ? 'Saldo adeudado: $ ' + montoATexto(a - p) : 'El monto actualizado tiene que ser mayor que lo pagado') : '';
        };
        ac.input.addEventListener('input', calc); pa.input.addEventListener('input', calc);
        [fo, pa, h('label', { class: 'check-hon' }, cu, ' Fue un pago a cuenta'), fr, ha, ba, ac].forEach(function (c) { campos.appendChild(c.nodo || c); });
        campos.appendChild(h('div', { class: 'ayuda chica', text: 'La planilla la sacás de la calculadora de tasa activa; acá cargás el resultado y después agregás el PDF.' }));
        leer = function () { return { fechaOficio: isoADmy(fo.input.value), pagado: pa.input.value, aCuenta: cu.checked, fechaRegulacion: isoADmy(fr.input.value), hasta: isoADmy(ha.input.value), base: ba.input.value, actualizado: ac.input.value }; };
      } else {
        var va = h('select', { class: 'campo-form', 'aria-label': 'Variante' }, h('option', { value: 'SIN_CONTADORES', text: 'Sin intervención del Cuerpo de Contadores' }),
          h('option', { value: 'CON_CONTADORES', text: 'Pido que se remita al Cuerpo de Contadores' }), h('option', { value: 'POST_CONTADORES', text: 'Después de la planilla del Cuerpo de Contadores' }));
        campos.appendChild(va);
        leer = function () { return { variante: va.value }; };
      }
    }
    sel.addEventListener('change', dibujar);
    function enviar(forzar) {
      boton.disabled = true;
      resultado.textContent = '';
      resultado.appendChild(h('div', { class: 'ayuda chica', text: 'Generando el escrito…' }));
      apiPost({ a: 'honEscrito', pin: hon.pin, tipo: sel.value, e: j.e, datos: leer(), forzar: !!forzar }).then(function (r) {
        boton.disabled = false; resultado.textContent = '';
        aviso('Escrito generado');
        var g = { tipo: 'escrito', titulo: sel.options[sel.selectedIndex].text, e: r.escrito.e, d: r.escrito.d, r: j.r, url: r.escrito.url, pdfId: r.escrito.pdfId,
                  texto: r.seguimiento || '', creado: Date.now(), anotado: null };
        hon.generados.unshift(g);
        refrescarGenerados();
        resultado.appendChild(h('div', { class: 'form-hon' }, h('b', { text: '✓ Escrito generado: quedó en Para firmar' }),
          r.arca ? h('div', { class: 'ayuda chica', text: 'En menos de un minuto se le une la constancia de ARCA.' }) : null,
          r.aviso ? h('div', { class: 'alerta', text: r.aviso }) : null,
          h('div', { class: 'botones-hon' }, h('a', { class: 'btn primario', href: r.escrito.url, target: '_blank', rel: 'noopener' }, 'Abrir PDF'),
            h('button', { class: 'btn', type: 'button', onclick: function () { cambiarVista('firmar'); } }, 'Ir a Para firmar')),
          panelActualizar(g)));
      }).catch(function (e) {
        boton.disabled = false; resultado.textContent = '';
        resultado.appendChild(h('div', { class: 'alerta', text: traducirError(e) }));
        if (/escrito igual/.test(String(e.message)) && confirm(String(e.message) + '\n\n¿Generar otro igual?')) enviar(true);
      });
    }
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!confirm('¿Generar "' + sel.options[sel.selectedIndex].text + '" para ' + j.d + ' (' + j.e + ')?\n\nQueda en Para firmar; lo firmás y lo presentás vos.')) return;
      enviar(false);
    });
    f.appendChild(sel); f.appendChild(campos); f.appendChild(resumen); f.appendChild(boton); f.appendChild(resultado);
    dibujar();
    return f;
  }

  /** Escritos de honorarios y Formulario RH para cualquier juicio del MAESTRO (también están en cada juicio del listado semanal). */
  function panelEscritoHon() {
    var caja = h('div'), lista = h('div', { class: 'man-lista' });
    var inp = h('input', { class: 'campo-form', type: 'search', autocomplete: 'off', placeholder: 'Expediente o deudor', 'aria-label': 'Expediente o deudor' });
    var elegir = function (x) {
      inp.value = x.e; lista.textContent = ''; caja.textContent = '';
      var area = h('div', { class: 'area-accion' });
      var saldo = hon.datos && hon.datos.listado && [].concat(hon.datos.listado.grupos.CUOTA, hon.datos.listado.grupos.PRIORIDAD, hon.datos.listado.grupos.RESTO)
        .filter(function (y) { return y.e === x.e; })[0];
      var j = { e: x.e, d: x.d, r: saldo ? saldo.r : null, saldo: saldo ? (saldo.saldo != null ? saldo.saldo : saldo.monto) : null };
      caja.appendChild(h('div', { class: 'item-rev' }, h('b', { text: x.d }), h('div', { class: 'meta', text: 'Expte. ' + x.e + (x.g ? ' · ' + x.g : '') }),
        h('div', { class: 'botones-hon' },
          h('button', { class: 'btn primario', type: 'button', onclick: function () { accion(area, 'escrito', j, hon.datos); } }, 'Escrito'),
          h('button', { class: 'btn primario', type: 'button', onclick: function () { accion(area, 'formulario', j, hon.datos); } }, 'Formulario RH')),
        area));
    };
    inp.addEventListener('input', function () {
      lista.textContent = ''; caja.textContent = '';
      var t = inp.value.trim();
      if (!t) return;
      Buscador.buscar(estado.indice, t, 5).forEach(function (r) {
        var x = estado.filas[r.i];
        lista.appendChild(h('button', { class: 'man-item', type: 'button', onclick: function () { elegir(x); } },
          h('b', { text: x.d }), h('span', { text: 'Expte. ' + x.e + ' · ' + (x.g || '') })));
      });
    });
    return h('div', { class: 'panel' },
      h('p', { class: 'ayuda chica', text: 'Buscá el juicio y elegí: "Escrito" (orden de pago, embargo, planilla o regulación) o "Formulario RH" (Registro de Honorarios, Res. 546). Los escritos quedan en Para firmar → Honorarios y otros; lo generado queda abajo, en "Generados esta semana". También están en cada juicio del listado de la semana.' }),
      inp, lista, caja);
  }

  // ───────── Formulario del Registro de Honorarios (Res. 546): revisar todo, cargar el monto y generar ─────────
  var CAMPOS_RH = [['juicio', 'Juicio', 2], ['expediente', 'Expediente', 1], ['juzgado', 'Juzgado o tribunal', 2],
                   ['regulacion', 'Sentencia de regulación de honorarios', 7], ['documentos', 'Documentos que acreditan la satisfacción', 3],
                   ['fondo', 'Sentencia de fondo', 8], ['observaciones', 'Observaciones', 7]];
  var formRH = { timer: null, vistas: {} };   // vistas[job]: dónde se pidió el formulario (para mostrar ahí el resultado si sigue en pantalla)

  function formularioRH(area, x) {
    area.appendChild(h('div', { class: 'form-hon' }, h('div', { class: 'ayuda chica', text: 'Buscando las sentencias en el SAE y el IVP en tu Gmail: puede tardar hasta un minuto…' })));
    apiPost({ a: 'honFormDatos', pin: hon.pin, e: x.e, d: x.d }).then(function (r) {
      if (area.dataset.tipo !== 'formulario') return;
      area.textContent = '';
      r.r = x.r;
      pintarFormularioRH(area, r);
    }).catch(function (e) {
      if (area.dataset.tipo !== 'formulario') return;
      area.textContent = '';
      area.appendChild(h('div', { class: 'form-hon' }, h('div', { class: 'alerta', text: 'No se pudo: ' + traducirError(e) })));
    });
  }

  function montoATexto(n) {
    var v = Math.round(n * 100) / 100, ent = Math.floor(v), dec = Math.round((v - ent) * 100);
    return String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + ('0' + dec).slice(-2) : '');
  }

  function pintarFormularioRH(area, r) {
    var cajas = {};
    var monto = h('input', { class: 'campo-form', inputmode: 'decimal', placeholder: 'Ej.: 819.272 o 2.444.283,30', 'aria-label': 'Monto a percibir' });
    var valorMonto = function () {
      var t = monto.value.trim().replace(/[$\s]/g, '');
      if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/\./g, '');
      var n = Number(t);
      return t && n > 0 ? n : null;
    };
    var campos = CAMPOS_RH.map(function (c) {
      var caja = cajas[c[0]] = h(c[2] > 1 ? 'textarea' : 'input', { class: 'campo-form', 'aria-label': c[1] });
      if (c[2] > 1) caja.rows = c[2];
      caja.value = r.campos[c[0]] || '';
      return h('div', { class: 'campo-rh' }, h('label', { class: 'etiqueta', text: c[1] }), caja);
    });
    monto.addEventListener('input', function () {
      var n = valorMonto();
      cajas.observaciones.value = cajas.observaciones.value.replace(/(asciende a \$ )(\[MONTO\]|[\d.,]*)/, '$1' + (n ? montoATexto(n) : '[MONTO]'));
    });
    var resultado = h('div');
    var boton = h('button', { class: 'btn primario', type: 'submit' }, 'Generar formulario con firma y sello');
    var f = h('form', { class: 'form-hon' },
      r.avisos.map(function (t) { return h('div', { class: 'alerta', text: t }); }),
      (r.existentes || []).length ? h('div', { class: 'alerta' }, 'Este expediente ya tiene formulario: ',
        r.existentes.map(function (y) { return h('a', { href: y.url, target: '_blank', rel: 'noopener', text: y.nombre + ' ' }); })) : null,
      h('div', { class: 'alerta', text: 'Compará los textos con la sentencia: el SAE a veces pierde palabras al cambiar de página. El formulario es una declaración jurada y sale con tu firma.' }),
      h('label', { class: 'etiqueta', text: 'Monto a percibir (lo cargás siempre vos)' }), monto,
      r.montoRegulado != null ? h('div', { class: 'ayuda chica', text: 'Regulado en la sentencia: ' + importe(r.montoRegulado) + ' (solo como referencia)' }) : null,
      r.ivp.url ? h('div', { class: 'ayuda chica' }, 'IVP N° I ' + r.ivp.nro + ' del ' + r.ivp.fecha + ' · ', h('a', { href: r.ivp.url, target: '_blank', rel: 'noopener', text: 'Ver IVP ↗' })) : null,
      campos, boton, resultado);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = valorMonto();
      if (!n) { aviso('Cargá el monto a percibir'); monto.focus(); return; }
      var datos = {};
      CAMPOS_RH.forEach(function (c) { datos[c[0]] = cajas[c[0]].value.trim(); });
      if (/\[(MONTO|NRO DE IVP|FECHA|ESTADO)\]/.test(datos.observaciones + datos.documentos)) { aviso('Completá lo que está entre corchetes en Observaciones y Documentos'); return; }
      var vacio = CAMPOS_RH.filter(function (c) { return !datos[c[0]]; })[0];
      if (vacio) { aviso('Falta completar: ' + vacio[1]); cajas[vacio[0]].focus(); return; }
      if (!confirm('¿Generar el formulario de ' + r.d + ' (' + r.e + ') con tu firma y sello?\n\nMonto a percibir: $ ' + montoATexto(n) + '\n\nQueda guardado en el Drive; lo presentás vos.')) return;
      boton.disabled = true;
      resultado.textContent = '';
      resultado.appendChild(h('div', { class: 'ayuda chica', text: 'Armando el PDF: 1 o 2 minutos. Podés seguir usando la app: cuando esté listo lo vas a encontrar en Honorarios → Escritos y Formulario RH → "Generados esta semana".' }));
      apiPost({ a: 'honFormPedir', pin: hon.pin, e: r.e, d: r.d, r: r.r || '', campos: datos, ivpPdf: r.ivp.pdf, sae: r.sae || null }).then(function (p) {
        if (hon.datos) (hon.datos.formularios = hon.datos.formularios || []).unshift({ job: p.job, e: r.e, d: r.d, r: r.r || '', creado: Date.now(), estado: 'EN_COLA', anotado: null });
        formRH.vistas[p.job] = { resultado: resultado, boton: boton };
        refrescarGenerados();
        seguirFormRH();
      }).catch(function (e) { boton.disabled = false; resultado.textContent = ''; resultado.appendChild(h('div', { class: 'alerta', text: 'No se pudo: ' + traducirError(e) })); });
    });
    area.appendChild(f);
    // Que los textos largos se lean enteros, sin barra de desplazamiento.
    var ajustar = function (t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
    Object.keys(cajas).forEach(function (k) {
      if (cajas[k].tagName !== 'TEXTAREA') return;
      ajustar(cajas[k]);
      cajas[k].addEventListener('input', function () { ajustar(cajas[k]); });
    });
  }

  /** Pregunta cada 5 segundos por los formularios que se están armando (aunque se haya cambiado de pestaña). */
  function seguirFormRH(ya) {
    clearTimeout(formRH.timer);
    var pend = ((hon.datos && hon.datos.formularios) || []).filter(function (x) { return x.estado === 'EN_COLA'; });
    if (!hon.pin || !pend.length) return;
    formRH.timer = setTimeout(function () {
      Promise.all(pend.map(function (x) {
        return apiPost({ a: 'honFormEstado', pin: hon.pin, j: x.job }).then(function (r) {
          if (r.estado === 'EN_COLA') return;
          Object.assign(x, { estado: r.estado, url: r.url, carpeta: r.carpeta, nombre: r.nombre, ivpCopiado: r.ivpCopiado, sentencias: r.sentencias, error: r.error });
          aviso(r.estado === 'LISTO' ? 'Formulario listo: ' + x.d : 'No se pudo armar el formulario de ' + x.d);
          var v = formRH.vistas[x.job];
          delete formRH.vistas[x.job];
          if (v && document.body.contains(v.resultado)) { v.boton.disabled = false; v.resultado.textContent = ''; v.resultado.appendChild(resultadoFormRH(x)); }
        }).catch(function (e) {
          if (/no encontrado/i.test(String(e.message))) { x.estado = 'ERROR'; x.error = 'El pedido ya no está en el servidor: generalo de nuevo.'; }
        });
      })).then(function () { refrescarGenerados(); seguirFormRH(); });
    }, ya ? 0 : 5000);
  }

  function resultadoFormRH(x) {
    if (x.estado === 'EN_COLA') return h('div', { class: 'ayuda chica', text: 'Armando el PDF… (1 o 2 minutos)' });
    if (x.estado === 'ERROR') return h('div', { class: 'alerta', text: x.error || 'No se pudo armar el formulario.' });
    if (!x.texto) x.texto = 'PRESENTO EN EL REGISTRO DE HONORARIOS.';
    return h('div', { class: 'form-hon' },
      h('b', { text: '✓ ' + x.nombre }),
      h('div', { class: 'botones-hon' },
        h('a', { class: 'btn primario', href: x.url, target: '_blank', rel: 'noopener' }, 'Abrir formulario'),
        h('a', { class: 'btn', href: x.carpeta, target: '_blank', rel: 'noopener' }, 'Abrir carpeta')),
      h('div', { class: 'ayuda chica', text: (x.ivpCopiado ? 'El IVP ya está en la carpeta. ' : 'Agregá el PDF del IVP a la carpeta. ') + textoSentencias(x.sentencias) }),
      panelActualizar(x));
  }

  function textoSentencias(s) {
    var minus = function (l) { return l.map(function (t) { return t.toLowerCase(); }).join(' y la '); };
    if (!s) return 'Falta el PDF de la sentencia: bajalo del portal del SAE y guardalo en la carpeta.';
    return (s.copiadas.length ? 'También quedó la ' + minus(s.copiadas) + ', bajada del SAE. ' : '') +
           (s.faltan.length ? 'No pude bajar del SAE la ' + minus(s.faltan) + (s.motivo ? ' (' + s.motivo + ')' : '') + ': bajala del portal y guardala en la carpeta.' : '');
  }

  // ───────── Generados esta semana: escritos (de esta sesión) y formularios RH (del servidor, 7 días) ─────────
  function anotadoTodo(x) { return !!(x.anotado && x.anotado.maestro && x.anotado.honorarios); }

  function refrescarGenerados() {
    var cont = $('hon-generados');
    if (!cont) return;
    cont.textContent = '';
    var forms = ((hon.datos && hon.datos.formularios) || []).map(function (x) { return { tipo: 'formulario', x: x, creado: x.creado }; });
    var lista = hon.generados.map(function (x) { return { tipo: 'escrito', x: x, creado: x.creado }; }).concat(forms)
      .sort(function (a, b) { return b.creado - a.creado; });
    if (!lista.length) return;
    cont.appendChild(h('div', { class: 'anio' }, 'Generados esta semana', h('small', { text: String(lista.length) })));
    lista.forEach(function (g) {
      var x = g.x, cuando = new Date(x.creado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      var item = h('div', { class: 'item-rev' + (anotadoTodo(x) ? ' tramitado' : '') },
        h('div', { class: 'fila-panel' }, h('b', { text: x.d }), h('span', { class: 'chip-tipo' + (g.tipo === 'formulario' ? ' cancela' : ''), text: g.tipo === 'formulario' ? 'FORMULARIO RH' : x.titulo.toUpperCase() })),
        h('div', { class: 'meta', text: 'Expte. ' + x.e + ' · ' + cuando }),
        g.tipo === 'formulario' ? resultadoFormRH(x)
          : h('div', null, h('div', { class: 'botones-hon' }, h('a', { class: 'btn', href: x.url, target: '_blank', rel: 'noopener' }, 'Abrir PDF'),
              h('button', { class: 'btn', type: 'button', onclick: function () { cambiarVista('firmar'); } }, 'Ir a Para firmar')), panelActualizar(x)));
      cont.appendChild(item);
    });
  }

  /** "¿Actualizar el MAESTRO y HONORARIOS?": una línea con la fecha de hoy en el SEGUIMIENTO y en el TRAMITE PENDIENTE (con confirmación). */
  function panelActualizar(x) {
    var a = x.anotado || {};
    var hecho = function () {
      var l = [];
      if (a.maestro) l.push(h('div', { class: 'ayuda chica', text: '✓ MAESTRO: ' + a.maestro }));
      if (a.honorarios) l.push(h('div', { class: 'ayuda chica', text: '✓ HONORARIOS: ' + a.honorarios }));
      return l;
    };
    if (a.maestro && a.honorarios) return h('div', { class: 'actualizar-hon hecho' }, hecho());
    var ta = h('textarea', { class: 'campo-form', rows: '2', 'aria-label': 'Texto para las planillas' });
    ta.value = x.texto || '';
    var cm = h('input', { type: 'checkbox', checked: !a.maestro, disabled: !!a.maestro, 'aria-label': 'MAESTRO' });
    var ch = h('input', { type: 'checkbox', checked: !a.honorarios, disabled: !!a.honorarios, 'aria-label': 'HONORARIOS' });
    var msg = h('div');
    var boton = h('button', { class: 'btn primario', type: 'button' }, 'Actualizar planillas');
    var caja = h('div', { class: 'actualizar-hon' },
      h('b', { text: '¿Actualizar el MAESTRO y HONORARIOS?' }),
      h('div', { class: 'ayuda chica', text: 'Se agrega una línea con la fecha de hoy. Corregí el texto si hace falta.' + (x.pdfId ? ' Si lo anotás ahora, al marcarlo "Presentado" en Para firmar no se repite en el MAESTRO.' : '') }),
      hecho(), ta,
      h('label', { class: 'check-hon' }, cm, ' MAESTRO (SEGUIMIENTO)' + (a.maestro ? ' · ya anotado' : '')),
      h('label', { class: 'check-hon' }, ch, ' HONORARIOS (TRAMITE PENDIENTE)' + (a.honorarios ? ' · ya anotado' : '')),
      boton, msg);
    boton.addEventListener('click', function () {
      var texto = ta.value.replace(/\s+/g, ' ').trim().toUpperCase(), aM = cm.checked && !a.maestro, aH = ch.checked && !a.honorarios;
      if (texto.length < 3) { aviso('Escribí el texto'); ta.focus(); return; }
      if (!aM && !aH) { aviso('Elegí qué planilla actualizar'); return; }
      if (!confirm('Se agrega en ' + (aM && aH ? 'el MAESTRO y en HONORARIOS' : aM ? 'el MAESTRO' : 'HONORARIOS') + ' (' + x.d + ', ' + x.e + '):\n\n- ' + isoADmy(hoyInput()) + ': ' + texto)) return;
      boton.disabled = true; msg.textContent = '';
      apiPost({ a: 'honActualizar', pin: hon.pin, e: x.e, r: x.r || '', texto: texto, maestro: aM, honorarios: aH, pdfId: x.pdfId || '', job: x.job || '' }).then(function (r) {
        x.texto = texto;
        x.anotado = { maestro: a.maestro || r.maestro, honorarios: a.honorarios || r.honorarios };
        var nuevo = panelActualizar(x);
        caja.replaceWith(nuevo);
        (r.avisos || []).forEach(function (t) { nuevo.appendChild(h('div', { class: 'alerta', text: t })); });
        aviso(r.maestro && r.honorarios ? 'Anotado en el MAESTRO y en HONORARIOS' : r.maestro ? 'Anotado en el MAESTRO' : r.honorarios ? 'Anotado en HONORARIOS' : 'No se anotó');
        if (r.maestro) refrescar(true);
        if (r.honorarios) cargarHonorarios(true);
      }).catch(function (e) { boton.disabled = false; msg.appendChild(h('div', { class: 'alerta', text: 'No se pudo: ' + traducirError(e) })); });
    });
    return caja;
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) seguirFormRH(true); });

  function tarjetaHon(x, movs) {
    var dias = x.ult ? diasDesdeIso(x.ult.fecha) : null;
    var chip = x.pago ? h('span', { class: 'chip-tipo', text: 'COBRADO ' + fechaIsoCorta(x.pago) })
             : x.color === '#ffff00' ? h('span', { class: 'chip-tipo', text: 'COBRADO (sin fecha)' })
                      : h('span', { class: 'chip-tipo cancela', text: 'PENDIENTE' });
    var card = h('div', { class: 'item-rev', style: x.color ? 'border-left:6px solid ' + x.color : null, title: x.colorNombre ? 'Marcado en ' + x.colorNombre + ' en la planilla' : null },
      h('div', { class: 'fila-panel' }, h('b', { text: x.d }), h('span', { class: 'monto', text: importe(x.monto) })),
      h('div', { class: 'meta' }, 'Expte. ' + x.e + (x.n ? ' · ' + x.n : '') + ' ', chip));
    if (movs) {
      var ul = h('ul', { class: 'lista-seg' });
      movs.slice().reverse().forEach(function (l) { ul.appendChild(h('li', null, h('span', { class: 'f', text: fechaIso(l.fecha) }), h('span', { text: l.texto }))); });
      card.appendChild(ul);
    } else if (x.ult) {
      card.appendChild(h('div', { class: 'motivo' + (dias > 30 ? '' : ' tranquilo'), text: 'Último: ' + fechaIso(x.ult.fecha) + ' (' + diasTexto(dias) + ') · ' + x.ult.texto }));
    } else card.appendChild(h('div', { class: 'motivo', text: 'Sin movimientos con fecha en TRAMITE PENDIENTE' }));
    if (x.contacto) card.appendChild(h('div', { class: 'meta', text: 'Contacto: ' + x.contacto }));
    card.appendChild(h('div', { class: 'botones-hon' }, linkHon(x.r)));
    return card;
  }

  // ───────── Escritos a mano (elegir tipo + expediente → generar) ─────────
  var TIPOS_ESCRITO = [{ id: 'PEDIDO_SENTENCIA', nombre: 'Pedido de sentencia' },
                       { id: 'COMUNICO_IVP', nombre: 'Comunicación de cancelación (IVP)' }];
  var manual = { tipo: 'PEDIDO_SENTENCIA', texto: '', fila: null, previa: null, error: '', resultado: null, generando: false };

  var LECTURA_MOTOR = {
    PEDIR: ['ok', 'El motor también pediría sentencia'],
    REITERAR: ['ok', 'Corresponde reiterar el pedido'],
    ESPERAR: ['aviso', 'El motor esperaría'],
    REVISION: ['aviso', 'El motor lo mandaría a revisión manual'],
    NO: ['aviso', 'Según el motor todavía no corresponde'],
    SENTENCIA_DICTADA: ['peligro', 'Ojo: el SAE ya tiene sentencia'],
    COMUNICAR: ['ok', 'Se puede comunicar'],
    YA_COMUNICADO: ['peligro', 'Ojo: ya figura comunicado en el SAE']
  };

  // Los errores técnicos del navegador vienen en inglés: se muestran en castellano.
  function traducirError(e) {
    var m = String((e && e.message) || e || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No hay conexión con el servidor. Revisá la señal e intentá de nuevo.';
    if (/Cannot read|undefined|is not a function|Unexpected token|JSON/i.test(m)) return 'El servidor respondió algo inesperado. Probablemente falte actualizar la versión en Apps Script (Implementar → Administrar implementaciones → Nueva versión).';
    if (/Acción desconocida/i.test(m)) return 'El servidor (Apps Script) todavía no tiene esta función: falta pegar el código nuevo y crear una "Nueva versión".';
    return m;
  }

  // ───────── Agenda de plazos (las reglas están en agenda.js) ─────────
  var agenda = { datos: null, form: null, lugar: 'TODOS', verHechos: false, error: '', grupo: null };   // grupo: tarjeta abierta (null = las tarjetas)

  // Una tarjeta por sección, igual que en Para firmar.
  var GRUPOS_AGENDA = [
    { id: 'vencimientos', nombre: 'Vencimientos', tipo: 'VENCIMIENTO', vacio: 'No hay vencimientos cargados.' },
    { id: 'audiencias', nombre: 'Audiencias y reuniones', tipo: 'AUDIENCIA', vacio: 'No hay audiencias cargadas.' },
    { id: 'tareas', nombre: 'Tareas', tipo: 'TAREA', vacio: 'No hay tareas pendientes.' },
    { id: 'recurrentes', nombre: 'Tareas que se repiten', tipo: 'RECURRENTE', vacio: 'Sirven para lo que hacés cada día, semana o mes. Al empezar el período vuelven solas a pendientes.' }
  ];
  function abrirGrupoAgenda(id) {
    agenda.grupo = id;
    pintarAgenda();
    window.scrollTo(0, 0);
  }

  function inhabilesAgenda() {
    var m = {};
    ((agenda.datos && agenda.datos.inhabiles) || []).forEach(function (k) { m[k] = true; });
    return m;
  }

  function actualizarAlertasAgenda() {
    var a = Agenda.alertas((agenda.datos && agenda.datos.items) || [], hoyInput());
    var c = $('cuenta-agenda'), b = $('aviso-agenda');
    c.textContent = String(a.total);
    c.hidden = !a.total;
    b.textContent = '⚠ Agenda: ' + Agenda.textoAlertas(a);
    b.classList.toggle('grave', !!(a.vencidos || a.hoy));
    b.hidden = !a.total || estado.vista === 'agenda';
    avisoSubirDrive();
  }

  // ───────── Recordatorio semanal: subir al Drive lo guardado en la PC del trabajo (ahí no se puede sincronizar el Drive) ─────────
  // Es una tarea de la Agenda que se repite todas las semanas: "Ya lo subí" la marca cumplida y queda igual en la PC y en el teléfono.
  var SUBIR_DRIVE = { id: 'subir-drive', desdeDia: 4,   // días después del lunes: 4 = viernes
    item: { tipo: 'RECURRENTE', frecuencia: 'SEMANAL', titulo: 'Subir al Drive los archivos de la PC del trabajo',
            notas: 'Facturas, escritos hechos en Word y guardados en la PC, y PDF firmados.' } };

  function itemSubirDrive() {
    return ((agenda.datos && agenda.datos.items) || []).filter(function (x) { return x.id === SUBIR_DRIVE.id && x.estado !== 'BORRADO'; })[0] || null;
  }

  /** Lo agrega a la Agenda la primera vez. Si Carlos lo borra, no vuelve a aparecer. */
  function asegurarSubirDrive() {
    if (itemSubirDrive() || leer(LS.drive)) return;
    guardar(LS.drive, hoyInput());
    mandar({ a: 'agendaGuardar', item: Object.assign({ id: SUBIR_DRIVE.id }, SUBIR_DRIVE.item), nuevo: true, creado: hoyInput() }, 'Recordatorio semanal del Drive')
      .then(function (d) {
        if (d) recibirAgenda(d);
        else agendaLocal(function (items) { return items.concat([Object.assign({ id: SUBIR_DRIVE.id, estado: 'PENDIENTE', creado: hoyInput(), ultHecho: '' }, SUBIR_DRIVE.item)]); });
        if (estado.vista === 'agenda' && !agenda.form) pintarAgenda();
      }).catch(function () { localStorage.removeItem(LS.drive); });
  }

  /** Aparece desde el viernes si esta semana no se marcó; si la semana pasada tampoco, aparece todos los días. */
  function subirDrivePendiente(it, hoy) {
    if (!it) return null;
    var lunes = Agenda.periodo('SEMANAL', hoy), ult = it.ultHecho || '';
    if (ult >= lunes) return null;
    if (!ult || ult < Agenda.sumarDias(lunes, -7)) return { atrasado: !!ult };
    return Agenda.diasEntre(lunes, hoy) >= SUBIR_DRIVE.desdeDia ? { atrasado: false } : null;
  }

  function avisoSubirDrive() {
    var b = $('aviso-drive');
    if (!b) return;
    var it = itemSubirDrive(), p = subirDrivePendiente(it, hoyInput());
    b.hidden = !p;
    b.textContent = '';
    if (!p) return;
    b.appendChild(h('div', { class: 'aviso-drive-texto' },
      h('b', { text: p.atrasado ? '📤 Quedó pendiente de la semana pasada: ' : '📤 Recordatorio semanal: ' }),
      'subí al Drive lo guardado en la PC del trabajo: facturas, escritos en Word y PDF firmados.' + (it.ultHecho ? ' Última vez: ' + Agenda.dmy(it.ultHecho) + '.' : '')));
    b.appendChild(h('div', { class: 'aviso-drive-botones' },
      h('button', { class: 'btn chico primario', type: 'button', onclick: function () { marcarAgenda(it, 'HECHO', 'Anotado: archivos subidos al Drive'); } }, 'Ya lo subí'),
      h('a', { class: 'btn chico', href: 'https://drive.google.com/drive/my-drive', target: '_blank', rel: 'noopener' }, 'Abrir Drive ↗')));
  }

  function recibirAgenda(d) {
    agenda.datos = d;
    agenda.error = '';
    guardar(LS.agenda, d);
    actualizarAlertasAgenda();
  }

  function cargarAgenda() {
    if (!estado.cfg) return Promise.resolve();
    return enviarCola().then(function () {
      // Con cambios todavía sin enviar, la copia del teléfono es la que está al día.
      if (cola.items.some(function (x) { return /^agenda/.test(x.cuerpo.a); })) { var e = new Error('Sin conexión'); e.red = true; throw e; }
      return api({ a: 'agenda' });
    }).then(function (d) {
      if (!d.items) throw new Error('El servidor (Apps Script) todavía no tiene la Agenda: falta pegar el código nuevo y crear una "Nueva versión".');
      recibirAgenda(d);
      asegurarSubirDrive();
    }).catch(function (e) { agenda.error = esDeRed(e) && agenda.datos ? 'Sin conexión: podés seguir usando la agenda; los cambios se envían solos al volver la señal.' : traducirError(e); }).then(function () {
      if (estado.vista === 'agenda' && !agenda.form) pintarAgenda();      // no le borra lo que está escribiendo
    });
  }

  function nuevoAgenda(datos) {
    agenda.form = Object.assign({ tipo: 'VENCIMIENTO', titulo: '', e: '', d: '', fecha: '', hora: '', fatal: false, lugar: 'DESPACHO', frecuencia: 'MENSUAL', notas: '' }, datos || {});
    if (estado.vista === 'agenda') pintarAgenda(); else cambiarVista('agenda');
  }

  function marcarAgenda(it, accion, texto) {
    mandar({ a: 'agendaMarcar', id: it.id, accion: accion, fecha: hoyInput() }, texto + ': ' + it.titulo).then(function (d) {
      if (d) recibirAgenda(d);
      else agendaLocal(function (items) {
        var x = items.filter(function (y) { return y.id === it.id; })[0];
        if (!x) return items;
        if (accion === 'BORRAR') return items.filter(function (y) { return y !== x; });
        if (accion === 'HECHO') { if (x.tipo !== 'RECURRENTE') x.estado = 'HECHO'; x.ultHecho = hoyInput(); }
        if (accion === 'REABRIR') { x.estado = 'PENDIENTE'; x.ultHecho = ''; }
        return items;
      });
      pintarAgenda();
      aviso(texto + (d ? '' : ' (sin conexión: se envía al volver la señal)'));
    }).catch(function (e) { aviso(traducirError(e)); });
  }

  /** Cambio hecho sin conexión: se aplica a la copia del teléfono (el servidor lo recibe después, desde la cola). */
  function agendaLocal(cambiar) {
    var d = agenda.datos || { ok: true, items: [], inhabiles: [] };
    d.items = cambiar(d.items.slice());
    recibirAgenda(d);
  }

  function tarjetaAgenda(it, hoy, inh) {
    var n = Agenda.nivel(it, hoy), hecho = n === 'hecho';
    return h('div', { class: 'item-agenda nivel-' + n },
      h('div', { class: 'agenda-chips' },
        it.fatal ? h('span', { class: 'chip-fatal', text: 'PLAZO FATAL' }) : null,
        it.lugar ? h('span', { class: 'chip-tipo', text: Agenda.LUGARES[it.lugar] }) : null),
      h('div', { class: 'agenda-titulo', text: it.titulo }),
      h('div', { class: 'agenda-cuando', text: Agenda.texto(it, hoy, inh) }),
      it.e ? h('button', { class: 'agenda-expte', type: 'button', onclick: function () { verJuicio(it.e); } }, 'Expte. ' + it.e + (it.d ? ' · ' + it.d : '') + ' ›') : null,
      it.notas ? h('div', { class: 'ayuda chica agenda-notas', text: it.notas }) : null,
      h('div', { class: 'botones-hon' },
        hecho ? h('button', { class: 'btn', type: 'button', onclick: function () { marcarAgenda(it, 'REABRIR', 'Volvió a quedar pendiente'); } }, 'Deshacer')
              : h('button', { class: 'btn primario', type: 'button', onclick: function () { marcarAgenda(it, 'HECHO', 'Marcado como cumplido'); } }, 'Cumplido'),
        h('button', { class: 'btn', type: 'button', onclick: function () { nuevoAgenda(it); window.scrollTo(0, 0); } }, 'Editar'),
        h('button', { class: 'btn', type: 'button', onclick: function () {
          if (confirm('¿Borrar "' + it.titulo + '" de la agenda?')) marcarAgenda(it, 'BORRAR', 'Borrado de la agenda');
        } }, 'Borrar')));
  }

  function formAgenda(inh) {
    var f = agenda.form, campos = h('div', { class: 'form-hon-campos' }), error = h('p', { class: 'error', hidden: true });
    var tipo = h('select', { class: 'campo-form', 'aria-label': 'Qué vas a cargar' }, Object.keys(Agenda.TIPOS).map(function (k) {
      return h('option', { value: k, text: Agenda.TIPOS[k], selected: k === f.tipo });
    }));
    tipo.addEventListener('change', function () { f.tipo = tipo.value; pintarAgenda(); });
    var campo = function (etiqueta, nodo) { return h('div', { class: 'campo-rh' }, h('label', { class: 'etiqueta', text: etiqueta }), nodo); };
    var enlazar = function (input, clave) { input.addEventListener('input', function () { f[clave] = input.value; }); return input; };

    campos.appendChild(campo('Qué', enlazar(h('input', { class: 'campo-form', value: f.titulo, maxlength: '300', placeholder: f.tipo === 'RECURRENTE' ? 'Ej.: Subir la constancia de ARCA' : 'Ej.: Contestar traslado' }), 'titulo')));

    if (f.tipo === 'VENCIMIENTO' || f.tipo === 'AUDIENCIA') {
      var fecha = enlazar(h('input', { class: 'campo-form', type: 'date', value: f.fecha }), 'fecha');
      campos.appendChild(campo('Fecha', fecha));
    }
    if (f.tipo === 'VENCIMIENTO') {
      var fatal = h('input', { type: 'checkbox', checked: f.fatal });
      fatal.addEventListener('change', function () { f.fatal = fatal.checked; });
      campos.appendChild(h('label', { class: 'check-hon' }, fatal, ' Plazo fatal (avisa todos los días desde 7 días antes)'));
      // Contar días hábiles con el calendario judicial de la planilla.
      var desde = h('input', { class: 'campo-form', type: 'date', value: hoyInput() }), cuantos = h('input', { class: 'campo-form', type: 'number', min: '1', max: '365', inputmode: 'numeric', placeholder: 'Ej.: 5' });
      var resultado = h('div', { class: 'ayuda chica' });
      campos.appendChild(h('details', { class: 'agenda-contar' }, h('summary', { text: 'Contar días hábiles' }),
        h('div', { class: 'form-hon-campos' }, campo('Desde (notificación)', desde), campo('Días hábiles', cuantos),
          h('button', { class: 'btn', type: 'button', onclick: function () {
            var n = parseInt(cuantos.value, 10);
            if (!Agenda.fechaValida(desde.value) || !(n >= 1 && n <= 365)) { resultado.textContent = 'Completá la fecha y los días.'; return; }
            f.fecha = Agenda.sumarHabiles(desde.value, n, inh);
            fecha.value = f.fecha;
            resultado.textContent = 'Se cumple el ' + Agenda.dmy(f.fecha) + '. Quedó cargado en Fecha.';
          } }, 'Calcular'), resultado,
          h('div', { class: 'ayuda chica', text: 'Cuenta desde el día siguiente y saltea fines de semana, feriados y ferias de la pestaña CALENDARIO. Controlá el resultado antes de guardar.' }))));
    }
    if (f.tipo === 'AUDIENCIA') campos.appendChild(campo('Hora', enlazar(h('input', { class: 'campo-form', type: 'time', value: f.hora }), 'hora')));
    if (f.tipo === 'TAREA') {
      campos.appendChild(campo('Dónde se hace', enlazar(h('select', { class: 'campo-form' }, Object.keys(Agenda.LUGARES).map(function (k) {
        return h('option', { value: k, text: Agenda.LUGARES[k], selected: k === f.lugar });
      })), 'lugar')));
    }
    if (f.tipo === 'RECURRENTE') {
      campos.appendChild(campo('Cada cuánto', enlazar(h('select', { class: 'campo-form' }, Object.keys(Agenda.FRECUENCIAS).map(function (k) {
        return h('option', { value: k, text: Agenda.FRECUENCIAS[k], selected: k === f.frecuencia });
      })), 'frecuencia')));
    }

    // Juicio relacionado (optativo)
    var cajaJuicio = h('div', { class: 'form-hon-campos' });
    var pintarJuicio = function () {
      cajaJuicio.textContent = '';
      if (f.e) {
        cajaJuicio.appendChild(h('div', { class: 'agenda-juicio' }, h('span', { text: 'Expte. ' + f.e + (f.d ? ' · ' + f.d : '') }),
          h('button', { class: 'btn', type: 'button', onclick: function () { f.e = ''; f.d = ''; pintarJuicio(); } }, 'Quitar')));
        return;
      }
      var lista = h('div', { class: 'man-lista' });
      var inp = h('input', { class: 'campo-form', type: 'search', autocomplete: 'off', placeholder: 'Expediente o deudor', 'aria-label': 'Juicio relacionado' });
      inp.addEventListener('input', function () {
        lista.textContent = '';
        var t = inp.value.trim();
        if (!t) return;
        Buscador.buscar(estado.indice, t, 5).forEach(function (r) {
          var x = estado.filas[r.i];
          lista.appendChild(h('button', { class: 'man-item', type: 'button', onclick: function () { f.e = x.e; f.d = x.d; pintarJuicio(); } },
            h('b', { text: x.d }), h('span', { text: 'Expte. ' + x.e })));
        });
      });
      cajaJuicio.appendChild(inp);
      cajaJuicio.appendChild(lista);
    };
    pintarJuicio();
    campos.appendChild(campo('Juicio (optativo)', cajaJuicio));
    campos.appendChild(campo('Notas (optativo)', enlazar(h('textarea', { class: 'campo-form', rows: '2', maxlength: '1000' }, f.notas), 'notas')));

    var guardarBtn = h('button', { class: 'btn primario', type: 'submit' }, f.id ? 'Guardar cambios' : 'Agregar a la agenda');
    var form = h('form', { class: 'panel form-hon form-agenda' }, h('h2', { text: f.id ? 'Editar' : 'Agregar' }), campo('Qué vas a cargar', tipo), campos, error,
      h('div', { class: 'botones-hon' }, guardarBtn, h('button', { class: 'btn', type: 'button', onclick: function () { agenda.form = null; pintarAgenda(); } }, 'Cancelar')));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      error.hidden = true;
      var v = Agenda.validar(f, inh);
      if (!v.ok) { error.textContent = v.error; error.hidden = false; return; }
      guardarBtn.disabled = true;
      // El id de lo nuevo lo pone la app: así se puede editar o marcar aunque todavía no haya llegado al servidor.
      var nuevo = !f.id, item = Object.assign({}, f, { id: f.id || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) });
      mandar({ a: 'agendaGuardar', item: item, nuevo: nuevo, creado: hoyInput() }, (nuevo ? 'Agregar a la agenda: ' : 'Editar: ') + v.item.titulo).then(function (d) {
        agenda.form = null;
        agenda.grupo = GRUPOS_AGENDA.filter(function (g) { return g.tipo === f.tipo; })[0].id;   // abre la tarjeta de lo que se guardó
        if (d) recibirAgenda(d);
        else agendaLocal(function (items) {
          var previo = items.filter(function (y) { return y.id === item.id; })[0];
          var x = Object.assign({ estado: 'PENDIENTE', creado: hoyInput(), ultHecho: '' }, previo || {}, v.item, { id: item.id });
          return previo ? items.map(function (y) { return y === previo ? x : y; }) : items.concat([x]);
        });
        pintarAgenda();
        aviso(d ? d.aviso || 'Guardado en la agenda' : (v.aviso ? v.aviso + ' · ' : '') + 'Guardado en el teléfono: se envía al volver la señal');
      }).catch(function (e) {
        guardarBtn.disabled = false;
        error.textContent = traducirError(e);
        error.hidden = false;
      });
    });
    return form;
  }

  function seccionAgenda(titulo, items, hoy, inh, vacio, extra) {
    return h('section', { class: 'seccion-agenda' }, titulo ? h('h2', { text: titulo + (items.length ? ' (' + items.length + ')' : '') }) : null, extra || null,
      items.length ? items.map(function (it) { return tarjetaAgenda(it, hoy, inh); }) : h('p', { class: 'ayuda chica', text: vacio }));
  }

  // Lo que dice cada tarjeta de la Agenda.
  function resumenGrupoAgenda(g, items, hoy) {
    if (g.id === 'recurrentes') {
      var faltan = items.filter(function (x) { return !Agenda.recurrenteHecha(x, hoy); }).length;
      return { numero: faltan, unidad: faltan === 1 ? 'pendiente' : 'pendientes', info: [items.length ? items.length + ' en total' : 'Ninguna cargada'] };
    }
    var r = { numero: items.length, unidad: items.length === 1 ? 'pendiente' : 'pendientes', info: [] };
    if (g.id === 'tareas') { r.info.push(items.length ? 'Sin fecha fija' : 'Nada pendiente'); return r; }
    var al = Agenda.alertas(items, hoy);
    if (al.vencidos || al.hoy) { r.alerta = '⚠ ' + Agenda.textoAlertas(al); r.grave = true; }
    else if (al.total) r.info.push(Agenda.textoAlertas(al));
    else if (items.length) r.info.push((g.id === 'audiencias' ? 'Próxima: ' : 'Próximo: ') + Agenda.dmy(items[0].fecha).slice(0, 5));
    else r.info.push('Nada cargado');
    return r;
  }

  function pintarAgenda() {
    var cont = $('agenda');
    cont.textContent = '';
    if (!estado.cfg) { cont.appendChild(h('p', { class: 'ayuda', text: 'Configurá la app primero (engranaje).' })); return; }
    if (agenda.error) cont.appendChild(h('div', { class: 'alerta', text: agenda.error + (agenda.datos && !/^Sin conexión/.test(agenda.error) ? ' Lo que ves es la última copia guardada.' : '') }));
    if (!agenda.datos) { if (!agenda.error) cont.appendChild(h('p', { class: 'ayuda', text: 'Cargando la agenda…' })); return; }

    var hoy = hoyInput(), inh = inhabilesAgenda(), s = Agenda.secciones(agenda.datos.items, hoy);
    var abierto = GRUPOS_AGENDA.filter(function (g) { return g.id === agenda.grupo; })[0];
    var volver = function () { abrirGrupoAgenda(null); };
    if (abierto) cont.appendChild(cabeceraGrupo(abierto.nombre, volver));
    if (agenda.form) cont.appendChild(formAgenda(inh));
    else cont.appendChild(h('div', { class: 'botones', style: 'margin-bottom:12px' }, h('button', { class: 'btn primario', type: 'button', onclick: function () { nuevoAgenda(); } }, '+ Agregar')));

    if (!abierto) {
      var tarjetas = h('div', { class: 'tarjetas-grupo cuatro' });
      GRUPOS_AGENDA.forEach(function (g) {
        tarjetas.appendChild(tarjetaGrupo(Object.assign({ nombre: g.nombre, entrar: true, onclick: function () { abrirGrupoAgenda(g.id); } }, resumenGrupoAgenda(g, s[g.id], hoy))));
      });
      cont.appendChild(tarjetas);
    } else if (abierto.id === 'tareas') {
      var lugares = {};
      s.tareas.forEach(function (t) { lugares[t.lugar] = true; });
      var filtro = Object.keys(lugares).length > 1 ? h('div', { class: 'seg agenda-filtro' }, ['TODOS'].concat(Object.keys(lugares)).map(function (k) {
        return h('button', { type: 'button', class: agenda.lugar === k ? 'activo' : '', onclick: function () { agenda.lugar = k; pintarAgenda(); } }, k === 'TODOS' ? 'Todas' : Agenda.LUGARES[k]);
      })) : null;
      var tareas = s.tareas.filter(function (t) { return !filtro || agenda.lugar === 'TODOS' || t.lugar === agenda.lugar; });
      cont.appendChild(seccionAgenda('', tareas, hoy, inh, abierto.vacio, filtro));
    } else cont.appendChild(seccionAgenda('', s[abierto.id], hoy, inh, abierto.vacio));
    if (abierto) { cont.appendChild(pieGrupo(volver)); return; }

    if (s.hechos.length) {
      cont.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { agenda.verHechos = !agenda.verHechos; pintarAgenda(); } }, (agenda.verHechos ? 'Ocultar' : 'Ver') + ' cumplidos (' + s.hechos.length + ')'));
      if (agenda.verHechos) cont.appendChild(seccionAgenda('Cumplidos', s.hechos, hoy, inh, ''));
    }
  }

  function pintarEscritos() {
    var cont = $('escritos');
    cont.textContent = '';
    if (!estado.cfg) { cont.appendChild(h('p', { class: 'ayuda', text: 'Configurá la app primero (engranaje).' })); return; }

    var sel = h('select', { id: 'man-tipo', class: 'campo-form' });
    TIPOS_ESCRITO.forEach(function (t) { var o = h('option', { value: t.id, text: t.nombre }); if (t.id === manual.tipo) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () {
      manual.tipo = sel.value;
      if (manual.fila) elegirJuicio(manual.fila);   // vuelve a consultar con el tipo nuevo
    });
    var inp = h('input', { id: 'man-expte', class: 'campo-form', type: 'search', inputmode: 'search', autocomplete: 'off', autocorrect: 'off',
                           spellcheck: 'false', placeholder: 'Ej. 10420/26 o parte del nombre', value: manual.texto });
    var lista = h('div', { class: 'man-lista' });
    var mostrarCoincidencias = function () {
      manual.texto = inp.value;
      lista.textContent = '';
      var t = inp.value.trim();
      if (!t || manual.fila && manual.fila.e === t) return;
      Buscador.buscar(estado.indice, t, 6).forEach(function (r) {
        var f = estado.filas[r.i];
        lista.appendChild(h('button', { class: 'man-item', type: 'button', onclick: function () { elegirJuicio(f); } },
          h('b', { text: f.d }), h('span', { text: 'Expte. ' + f.e + ' · ' + Buscador.nominacion(f.n).texto + ' · ' + (f.g || '') })));
      });
      if (!lista.firstChild) lista.appendChild(h('p', { class: 'ayuda chica', text: 'No hay coincidencias en la planilla.' }));
    };
    inp.addEventListener('input', function () { manual.fila = null; manual.previa = null; manual.resultado = null; manual.error = ''; pintarEleccion(); mostrarCoincidencias(); });

    cont.appendChild(h('div', { class: 'panel' },
      h('h2', { text: 'Nuevo escrito' }),
      h('label', { class: 'etiqueta', for: 'man-tipo', text: 'Tipo de escrito' }), sel,
      h('label', { class: 'etiqueta', for: 'man-expte', text: 'Expediente o deudor' }), inp, lista,
      h('p', { class: 'ayuda chica', text: 'Más tipos de escritos se suman a medida que se sellen sus modelos.' })));
    cont.appendChild(h('div', { id: 'man-eleccion' }));
    if (!manual.fila) mostrarCoincidencias();
    pintarEleccion();
  }

  function elegirJuicio(f) {
    manual.fila = f; manual.texto = f.e; manual.previa = null; manual.resultado = null; manual.error = '';
    var inp = $('man-expte'); if (inp) inp.value = f.e;
    var lista = document.querySelector('.man-lista'); if (lista) lista.textContent = '';
    pintarEleccion();
    api({ a: 'previa', e: f.e, t: manual.tipo }).then(function (p) {
      if (manual.fila !== f) return;
      // Si Apps Script no tiene todavía el modo manual, responde solo con su versión.
      if (p.ok && !p.motor) {
        manual.error = 'El servidor (Apps Script) todavía no tiene el modo manual. Falta pegar el código nuevo y crear una "Nueva versión" en Implementar → Administrar implementaciones.';
      } else manual.previa = p;
      pintarEleccion();
    }).catch(function (e) { if (manual.fila === f) { manual.error = traducirError(e); pintarEleccion(); } });
  }

  /** Consulta cada 10 s hasta que el escrito tenga la constancia unida, y cambia el enlace al PDF final. */
  function esperarArca(r, intento) {
    if (manual.resultado !== r) return;
    if (intento > 12) { r.unido = false; r.arca = false; pintarEleccion(); return; }
    setTimeout(function () {
      api({ a: 'escritos' }).then(function (d) {
        var x = (d.porFirmar || []).filter(function (y) { return y.e === r.escrito.e && y.arca; })
                                   .sort(function (a, b) { return a.generado < b.generado ? 1 : -1; })[0];
        if (x && manual.resultado === r) { r.unido = true; r.escrito.url = x.url; pintarEleccion(); }
        else esperarArca(r, intento + 1);
      }).catch(function () { esperarArca(r, intento + 1); });
    }, 10000);
  }

  function pintarEleccion() {
    var caja = $('man-eleccion');
    if (!caja) return;
    caja.textContent = '';
    var f = manual.fila;
    if (!f) return;
    var tarjeta = h('div', { class: 'panel' },
      h('div', { class: 'fila1' }, h('div', { class: 'deudor', text: f.d }), h('span', { class: 'estado ' + (COLOR_ESTADO[f.g] || ''), text: f.g || 'SIN ESTADO' })),
      h('div', { class: 'fila2' }, h('span', { class: 'expte', text: 'Expte. ' + f.e }), h('span', { text: Buscador.nominacion(f.n).texto })));
    caja.appendChild(tarjeta);

    if (manual.resultado) {
      var r = manual.resultado;
      // Mientras se une la constancia de ARCA (≈20–60 s), el PDF todavía no es el definitivo: no se ofrece abrirlo.
      var esperando = r.arca && !r.unido;
      caja.appendChild(h('div', { class: 'panel caja-ok' },
        h('b', { text: '✓ Escrito generado' }),
        esperando ? h('div', { class: 'cargando-txt', text: 'Uniendo la constancia de ARCA… (menos de un minuto)' })
                  : h('div', { text: r.unido ? 'Listo: un solo PDF con el escrito y la constancia de ARCA. También está en Para firmar.'
                                             : 'Falta la constancia de ARCA del mes: guardala en su carpeta y se une sola.' }),
        h('div', { class: 'botones', style: 'margin-top:8px' },
          esperando ? null : h('a', { class: 'btn primario', href: r.escrito.url, target: '_blank', rel: 'noopener' }, 'Abrir PDF'),
          h('button', { class: 'btn', type: 'button', onclick: function () { cambiarVista('firmar'); } }, 'Ir a Para firmar'),
          h('button', { class: 'btn', type: 'button', onclick: function () { manual.fila = null; manual.texto = ''; manual.resultado = null; pintarEscritos(); } }, 'Otro escrito'))));
      return;
    }
    if (manual.error) { caja.appendChild(h('p', { class: 'error', text: manual.error })); return; }
    if (!manual.previa) { caja.appendChild(h('div', { class: 'cargando-txt', text: manual.tipo === 'COMUNICO_IVP' ? 'Buscando el IVP en Gmail y consultando el SAE…' : 'Consultando el SAE…' })); return; }

    var p = manual.previa;
    if (!p.ok) { caja.appendChild(h('p', { class: 'error', text: p.error })); return; }
    var lect = LECTURA_MOTOR[p.motor.decision] || ['aviso', p.motor.decision];
    if (p.sae.caratula) tarjeta.appendChild(h('div', { class: 'ayuda chica', style: 'margin-top:6px', text: p.sae.caratula }));
    caja.appendChild(h('div', { class: 'panel caja-' + lect[0] },
      h('b', { text: lect[1] }),
      h('div', { text: p.motor.motivo + (p.motor.detalle ? ' — ' + p.motor.detalle : '') }),
      p.motor.verificar ? h('div', { class: 'ayuda chica', text: 'Verificá que la intimación haya sido positiva.' }) : null));
    if (p.ivp) {
      caja.appendChild(h('div', { class: 'panel' },
        h('b', { text: 'IVP I ' + p.ivp.nro + ' del ' + p.ivp.fecha }), h('span', { class: 'ayuda chica', text: ' · recibido el ' + p.ivp.recibido }),
        p.ivp.escrito ? h('div', { text: 'Escrito: ' + p.ivp.escrito + (p.ivp.estado ? ' · al presentar, ESTADO → ' + p.ivp.estado : '') }) : null,
        p.ivp.url ? h('div', null, h('a', { href: p.ivp.url, target: '_blank', rel: 'noopener', text: 'Ver el IVP ↗' })) : null));
    }
    if (p.pendiente) caja.appendChild(h('div', { class: 'alerta', text: 'Ya hay un escrito de este expediente esperando firma (pestaña Para firmar).' }));

    var btn = h('button', { class: 'btn primario', type: 'button', disabled: manual.generando }, manual.generando ? 'Generando…' : 'Generar escrito');
    btn.addEventListener('click', function () {
      if (manual.tipo === 'COMUNICO_IVP' && p.motor.decision === 'REVISION') { aviso('Este IVP no se puede comunicar automáticamente: ' + p.motor.motivo); return; }
      var riesgo = p.motor.decision === 'SENTENCIA_DICTADA' || p.motor.decision === 'NO' || p.motor.decision === 'YA_COMUNICADO';
      if ((riesgo || p.pendiente) && !confirm((p.pendiente ? 'Ya hay un escrito para firmar de este expediente. ' : '') +
          (riesgo ? 'El motor no lo recomienda (' + p.motor.motivo + '). ' : '') + '¿Generar igual?')) return;
      manual.generando = true; pintarEleccion();
      apiPost({ a: 'generar', tipo: manual.tipo, e: f.e, forzar: !!p.pendiente }).then(function (r) {
        manual.generando = false; manual.resultado = r; pintarEleccion();
        firmar.datos = null; contarFirmar(Number($('cuenta-firmar').textContent || 0) + 1);
        if (r.arca) esperarArca(r, 0);
      }).catch(function (e) { manual.generando = false; manual.error = traducirError(e); pintarEleccion(); });
    });
    caja.appendChild(h('div', { class: 'botones' }, btn));
  }

  // ───────── Configuración ─────────
  function decodificar(codigo) {
    // Acepta la línea completa del registro ("CÓDIGO DE CONFIGURACIÓN (pegar en la app): eyJ1…"):
    // el código siempre empieza con "eyJ" (es {"u":… en base64).
    var m = String(codigo).match(/eyJ[\w\-]+=*/);
    var b = (m ? m[0] : codigo.trim()).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var json = decodeURIComponent(escape(atob(b)));
    var c = JSON.parse(json);
    if (!c.u || !c.k) throw new Error('Código incompleto');
    return c;
  }

  function validarCfg(c) {
    if (/\/dev$/.test(c.u)) throw new Error('El código trae la dirección de prueba (termina en /dev). Tocá "Cargar URL y clave por separado" y pegá en "URL" la de Implementar → Administrar implementaciones (termina en /exec). El código dejalo como está.');
    // Apps Script en producción, o el servidor de desarrollo local (herramientas/servidor_dev.js).
    if (!/^(https:\/\/script\.google(usercontent)?\.com\/.+|http:\/\/localhost:\d+\/dev)\/exec$/.test(c.u)) throw new Error('La URL tiene que ser la de la app web de Apps Script y terminar en /exec');
    return c;
  }

  function abrirConfig() {
    var dlg = $('dlg-config');
    $('cfg-error').hidden = true;
    $('cfg-codigo').value = '';
    $('cfg-url').value = '';
    $('cfg-clave').value = '';
    $('cfg-siri').hidden = !estado.cfg;
    dlg.showModal();
  }

  function aplicarCfg(c) {
    estado.cfg = c;
    guardar(LS.cfg, c);
    estado.ultimaCarga = 0;
    return refrescar(true);
  }

  function iniciarConfig() {
    $('btn-config').addEventListener('click', abrirConfig);
    $('cfg-cancelar').addEventListener('click', function () { $('dlg-config').close(); });
    $('form-config').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = $('cfg-error');
      try {
        // El código trae URL y clave; lo que se escriba en los campos sueltos tiene prioridad
        // (Google a veces pone en el código la URL /dev en vez de la /exec).
        var codigo = $('cfg-codigo').value.trim();
        var c = codigo ? decodificar(codigo) : { u: '', k: '' };
        var u = $('cfg-url').value.trim(), k = $('cfg-clave').value.trim();
        if (u) c.u = u;
        if (k) c.k = k;
        validarCfg(c);
        $('dlg-config').close();
        aplicarCfg(c);
      } catch (e) {
        err.textContent = e.message; err.hidden = false;
      }
    });
    $('cfg-copiar-siri').addEventListener('click', function () {
      if (!estado.cfg) return;
      copiar(estado.cfg.u + '?a=voz&k=' + encodeURIComponent(estado.cfg.k) + '&q=', 'Enlace copiado');
    });
    $('doc-cerrar').addEventListener('click', function () { $('dlg-doc').close(); });
    ['dlg-config', 'dlg-doc'].forEach(function (id) {
      $(id).addEventListener('click', function (ev) { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
    });
  }

  // ───────── Arranque ─────────
  function iniciar() {
    // Enlace de configuración: …/#cfg=CODIGO (se borra de la barra enseguida).
    var m = location.hash.match(/cfg=([\w\-=]+)/);
    if (m) {
      try { estado.cfg = validarCfg(decodificar(m[1])); guardar(LS.cfg, estado.cfg); }
      catch (e) { aviso('Código de configuración inválido'); }
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (!estado.cfg) estado.cfg = leer(LS.cfg);

    var copia = leer(LS.datos);
    if (copia && copia.filas) { cargarDatos(copia); sync('Copia local · ' + haceCuanto(copia.generado), 'offline'); }

    var inicial = new URLSearchParams(location.search).get('q');
    if (inicial) q.value = inicial;

    iniciarConfig();
    iniciarVoz();
    estado.vista = 'buscar';
    document.querySelectorAll('.pestana').forEach(function (b) { b.addEventListener('click', function () { cambiarVista(b.dataset.vista); }); });
    $('aviso-agenda').addEventListener('click', function () { cambiarVista('agenda'); });
    agenda.datos = leer(LS.agenda);
    actualizarAlertasAgenda();
    cargarAgenda();
    $('btn-presentados').addEventListener('click', marcarPresentados);
    $('btn-imprimir-lote').addEventListener('click', imprimirLote);
    $('doc-imprimir').addEventListener('click', function () { if (estado.doc) Impresion.documentoSae(estado.doc.titulo, estado.doc.texto, estado.doc.f); });
    ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { $('honorarios').addEventListener(ev, usoHon, { passive: true }); });
    $('btn-honorarios').addEventListener('click', function (ev) {
      if (hon.pin && hon.datos) { usoHon(); return; }               // desbloqueado: abre la planilla
      ev.preventDefault();
      hon.msgPin = 'Ingresá el PIN para abrir la planilla HONORARIOS.';
      cambiarVista('honorarios');
    });
    actualizarBtnHon();
    var copiaFirmar = leer(LS.firmar);
    if (copiaFirmar && copiaFirmar.porFirmar) { quitarEnCola(copiaFirmar); contarFirmar(copiaFirmar.porFirmar.length); }
    if (estado.cfg) api({ a: 'escritos' }).then(function (d) { d.guardado = Date.now(); guardar(LS.firmar, d); quitarEnCola(d); firmar.datos = d; if (d.porFirmar) contarFirmar(d.porFirmar.length); }).catch(function () {});
    mostrarCola();
    q.addEventListener('input', render);
    q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') q.blur(); });
    $('btn-limpiar').addEventListener('click', function () { q.value = ''; render(); q.focus(); });
    $('estado-sync').addEventListener('click', function () { refrescar(true); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { refrescar(false); actualizarAlertasAgenda(); cargarAgenda(); } });
    window.addEventListener('online', function () { enviarCola().then(function () { refrescar(true); cargarAgenda(); }); });
    window.addEventListener('offline', function () { sync('Sin conexión · ' + haceCuanto(estado.generado), 'offline'); });

    render();
    refrescar(true);
    if (!estado.cfg) setTimeout(abrirConfig, 300);
    else if (matchMedia('(pointer: fine)').matches) q.focus();

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  iniciar();
})();
