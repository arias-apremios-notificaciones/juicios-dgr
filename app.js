/*
 * Juicios DGR — app del buscador (Fase 1).
 * Datos: MAESTRO_SEGUIMIENTO_SAE vía Apps Script (solo lectura), con copia local
 * para que funcione sin señal. SAE: a través del mismo Apps Script.
 */
(function () {
  'use strict';

  var LS = { cfg: 'jdgr.cfg', datos: 'jdgr.datos', recientes: 'jdgr.recientes' };
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
    'CANCELADO PARCIAL': 'azul', 'CANCELADO TOTAL': 'amarillo'
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
  function api(params) {
    var cfg = estado.cfg;
    if (!cfg) return Promise.reject(new Error('Falta configurar la app'));
    var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(cfg.u + '?' + qs + '&k=' + encodeURIComponent(cfg.k), { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Error del servidor'); return j; });
  }

  function cargarDatos(datos) {
    estado.filas = datos.filas || [];
    estado.indice = Buscador.indexar(estado.filas);
    estado.generado = datos.generado;
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
    }).catch(function (e) {
      sync(estado.filas.length ? 'Copia local · ' + haceCuanto(estado.generado) : 'Sin datos', 'error');
      if (forzado || !estado.filas.length) aviso('No se pudo actualizar: ' + e.message);
    });
  }

  // ───────── Render ─────────
  var renderPendiente;
  function render() {
    cancelAnimationFrame(renderPendiente);
    renderPendiente = requestAnimationFrame(pintar);
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
    contenido.appendChild(h('p', { class: 'resumen', text: res.length === 1 ? '1 juicio' : res.length + (res.length === 60 ? '+' : '') + ' juicios' }));
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
    det.appendChild(h('div', { class: 'botones' },
      btnSae,
      h('button', { class: 'btn', type: 'button', onclick: function () { copiar(f.e, 'Expediente copiado'); } }, 'Copiar Nº'),
      h('a', { class: 'btn', href: PORTAL_SAE, target: '_blank', rel: 'noopener',
               onclick: function () { copiar(f.e); } }, 'Portal SAE ↗')));
    if (f.s === 'DUDOSO') det.appendChild(h('div', { class: 'alerta', text: 'Ojo: la carátula del SAE no coincide del todo con el deudor. Verificala.' }));
    det.appendChild(saeCaja);

    if (lineas.length) {
      var ul = h('ul', { class: 'lista-seg' });
      var mostrar = function (n) {
        ul.textContent = '';
        lineas.slice(0, n).forEach(function (l) {
          ul.appendChild(h('li', null, h('span', { class: 'f', text: l.fecha || '—' }), h('span', { text: l.texto })));
        });
      };
      mostrar(5);
      var bloque = h('div', { class: 'bloque' }, h('h3', { text: 'Seguimiento (' + lineas.length + ')' }), ul);
      if (lineas.length > 5) {
        var mas = h('button', { class: 'mas', type: 'button', text: 'Ver las ' + lineas.length + ' líneas' });
        mas.addEventListener('click', function () { mostrar(lineas.length); mas.remove(); });
        bloque.appendChild(mas);
      }
      det.appendChild(bloque);
    }
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
    api({ a: 'doc', p: f.p, j: f.j, h: histid }).then(function (r) {
      t.textContent = r.texto;
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
    q.addEventListener('input', render);
    q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') q.blur(); });
    $('btn-limpiar').addEventListener('click', function () { q.value = ''; render(); q.focus(); });
    $('estado-sync').addEventListener('click', function () { refrescar(true); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refrescar(false); });
    window.addEventListener('online', function () { refrescar(true); });

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
