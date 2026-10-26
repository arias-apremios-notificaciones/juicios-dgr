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

  // ───────── Para firmar (motor de escritos) ─────────
  var firmar = { datos: null, sel: {}, cargando: false };

  function apiPost(cuerpo) {
    var cfg = estado.cfg;
    if (!cfg) return Promise.reject(new Error('Falta configurar la app'));
    // Texto plano: así el navegador no hace el control previo de CORS que Apps Script no responde.
    return fetch(cfg.u, { method: 'POST', body: JSON.stringify(Object.assign({ k: cfg.k }, cuerpo)), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Error del servidor'); return j; });
  }

  function cambiarVista(v) {
    estado.vista = v;
    document.querySelectorAll('.pestana').forEach(function (b) { b.classList.toggle('activa', b.dataset.vista === v); });
    $('barra-buscar').hidden = v !== 'buscar';
    contenido.hidden = v !== 'buscar';
    $('firmar').hidden = v !== 'firmar';
    $('escritos').hidden = v !== 'escritos';
    actualizarBarraAcciones();
    if (v === 'firmar') cargarFirmar();
    else if (v === 'escritos') pintarEscritos();
    else render();
    window.scrollTo(0, 0);
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
      firmar.datos = d;
      Object.keys(firmar.sel).forEach(function (id) { if (!d.porFirmar.some(function (x) { return x.id === id; })) delete firmar.sel[id]; });
      firmar.cargando = false;
      pintarFirmar();
      if (d.enCurso || d.uniendoArca) setTimeout(function () { if (estado.vista === 'firmar') cargarFirmar(); }, 20000);
    }).catch(function (e) {
      firmar.cargando = false;
      $('firmar').textContent = '';
      $('firmar').appendChild(h('p', { class: 'error', text: 'No se pudo cargar: ' + e.message }));
    });
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

    // Estado del análisis
    var info = d.enCurso ? 'Analizando la cartera…' + (d.quedan ? ' quedan ' + d.quedan + ' juicios' : '')
                         : (d.ultimaCorrida ? 'Último análisis: ' + new Date(d.ultimaCorrida).toLocaleDateString('es-AR') + ' · se repite cada 15 días' : 'Todavía no se analizó la cartera');
    var btnAnalizar = h('button', { class: 'btn', type: 'button', disabled: d.enCurso }, d.enCurso ? 'Analizando…' : 'Analizar ahora');
    btnAnalizar.addEventListener('click', function () {
      btnAnalizar.disabled = true;
      api({ a: 'analizar' }).then(function () { aviso('Análisis en marcha: tarda unos minutos'); setTimeout(cargarFirmar, 3000); })
        .catch(function (e) { btnAnalizar.disabled = false; aviso('No se pudo: ' + e.message); });
    });
    cont.appendChild(h('div', { class: 'panel' }, h('div', { class: 'fila-panel' },
      h('div', null, h('h2', { text: 'Pedidos de sentencia' }), h('div', { class: 'ayuda chica', text: info })),
      btnAnalizar),
      h('div', { class: 'ayuda chica' }, h('a', { href: d.carpeta, target: '_blank', rel: 'noopener', text: 'Abrir la carpeta de escritos ↗' }))));

    // Constancia de ARCA del mes
    if (d.arca && !d.arca.alDia) {
      cont.appendChild(h('div', { class: 'panel aviso-arca' },
        h('b', { text: '⚠ Falta la constancia de ARCA de ' + d.arca.mes.toLowerCase() }),
        h('div', { text: 'Bajala de ARCA y guardala en la carpeta CONSTANCIA ARCA: cada pedido de sentencia se sube junto con ella.' }),
        h('div', { style: 'margin-top:6px' }, h('a', { href: d.arca.carpeta, target: '_blank', rel: 'noopener', text: 'Abrir carpeta CONSTANCIA ARCA ↗' }))));
    } else if (d.arca && d.arca.archivo) {
      var sinArca = d.porFirmar.filter(function (x) { return !x.arca; }).length;
      var panelArca = h('div', { class: 'panel ok-arca' }, '✓ Constancia de ARCA de ' + d.arca.mes.toLowerCase() + ': ',
        h('a', { href: d.arca.archivo.url, target: '_blank', rel: 'noopener', text: d.arca.archivo.nombre }));
      if (d.uniendoArca) panelArca.appendChild(h('div', { class: 'ayuda chica', text: 'Uniendo la constancia a los escritos… (unos minutos)' }));
      else if (sinArca) {
        var btnArca = h('button', { class: 'btn', type: 'button', style: 'margin-top:8px' }, 'Unir la constancia a ' + sinArca + (sinArca === 1 ? ' escrito' : ' escritos'));
        btnArca.addEventListener('click', function () {
          btnArca.disabled = true;
          api({ a: 'adjuntarArca' }).then(function () { aviso('Uniendo la constancia: tarda unos minutos'); setTimeout(cargarFirmar, 5000); })
            .catch(function (e) { btnArca.disabled = false; aviso('No se pudo: ' + e.message); });
        });
        panelArca.appendChild(h('div', null, btnArca));
      }
      cont.appendChild(panelArca);
    }

    // Escritos para firmar, por año del juicio
    if (!d.porFirmar.length) {
      cont.appendChild(h('div', { class: 'vacio' }, h('h2', { text: 'No hay escritos para firmar' }),
        h('p', { text: d.enCurso ? 'Esperá a que termine el análisis.' : 'El próximo análisis los va a generar si corresponde.' })));
    }
    porAnio(d.porFirmar).forEach(function (g) {
      cont.appendChild(h('div', { class: 'anio' }, 'Juicios ' + g.anio, h('small', { text: g.items.length + (g.items.length === 1 ? ' escrito' : ' escritos') })));
      g.items.forEach(function (x) { cont.appendChild(tarjetaEscrito(x)); });
    });

    // Revisión manual
    if (d.revision.length) {
      var det = h('details', { class: 'grupo' }, h('summary', { text: 'Revisión manual (' + d.revision.length + ')' }),
        h('p', { class: 'ayuda chica', text: 'El motor no genera escritos para estos juicios: necesitan tu criterio. Tocá uno para ver su ficha.' }));
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
        h('p', { class: 'ayuda chica', text: 'En el MAESTRO figuran como INTIMACION / AUTOS P/RESOLVER, pero el SAE ya muestra la sentencia. Destildá los que no quieras cambiar.' }));
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
        }).catch(function (e) { btn.disabled = false; aviso('No se pudo: ' + e.message); });
      });
      refrescarBtn();
      det2.appendChild(h('div', { class: 'botones' }, btn));
      cont.appendChild(det2);
    }
    actualizarBarraAcciones();
  }

  function tarjetaEscrito(x) {
    var chk = h('input', { type: 'checkbox', checked: !!firmar.sel[x.id], 'aria-label': 'Seleccionar ' + x.d });
    var card = h('div', { class: 'escrito' + (firmar.sel[x.id] ? ' marcado' : '') },
      chk,
      h('div', { class: 'deudor', text: x.d }),
      h('div', { class: 'meta' },
        h('span', { class: 'expte', text: 'Expte. ' + x.e }),
        h('span', { class: 'chip-tipo' + (/REITERO/.test(x.tipo) ? ' reitero' : ''), text: /REITERO/.test(x.tipo) ? 'REITERO' : 'PIDO SENTENCIA' }),
        h('span', { class: 'chip-arca' + (x.arca ? '' : ' falta'), text: x.arca ? '📎 con ARCA' : 'sin ARCA' }),
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
    if (!confirm('¿Ya firmaste y subiste al SAE ' + (ids.length === 1 ? 'este escrito' : 'estos ' + ids.length + ' escritos') +
                 '?\n\nSe va a anotar "PIDO SENTENCIA" con la fecha de hoy en el seguimiento del MAESTRO.')) return;
    $('btn-presentados').disabled = true;
    apiPost({ a: 'presentado', ids: ids }).then(function (r) {
      $('btn-presentados').disabled = false;
      firmar.sel = {};
      aviso('Anotado en el MAESTRO: ' + r.presentados.length + ' juicio(s)' + (r.noEncontrados.length ? ' · no encontrados: ' + r.noEncontrados.join(', ') : ''));
      refrescar(true); cargarFirmar();
    }).catch(function (e) { $('btn-presentados').disabled = false; aviso('No se pudo: ' + e.message); });
  }

  function descartar(x) {
    if (!confirm('¿Descartar el escrito de ' + x.d + ' (' + x.e + ')? El PDF va a la papelera de Drive.')) return;
    apiPost({ a: 'descartar', ids: [x.id] }).then(function () {
      delete firmar.sel[x.id];
      aviso('Escrito descartado');
      cargarFirmar();
    }).catch(function (e) { aviso('No se pudo: ' + e.message); });
  }

  // ───────── Escritos a mano (elegir tipo + expediente → generar) ─────────
  var TIPOS_ESCRITO = [{ id: 'PEDIDO_SENTENCIA', nombre: 'Pedido de sentencia' }];
  var manual = { tipo: 'PEDIDO_SENTENCIA', texto: '', fila: null, previa: null, error: '', resultado: null, generando: false };

  var LECTURA_MOTOR = {
    PEDIR: ['ok', 'El motor también pediría sentencia'],
    REITERAR: ['ok', 'Corresponde reiterar el pedido'],
    ESPERAR: ['aviso', 'El motor esperaría'],
    REVISION: ['aviso', 'El motor lo mandaría a revisión manual'],
    NO: ['aviso', 'Según el motor todavía no corresponde'],
    SENTENCIA_DICTADA: ['peligro', 'Ojo: el SAE ya tiene sentencia']
  };

  function pintarEscritos() {
    var cont = $('escritos');
    cont.textContent = '';
    if (!estado.cfg) { cont.appendChild(h('p', { class: 'ayuda', text: 'Configurá la app primero (engranaje).' })); return; }

    var sel = h('select', { id: 'man-tipo', class: 'campo-form' });
    TIPOS_ESCRITO.forEach(function (t) { var o = h('option', { value: t.id, text: t.nombre }); if (t.id === manual.tipo) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { manual.tipo = sel.value; });
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
    api({ a: 'previa', e: f.e }).then(function (p) {
      if (manual.fila !== f) return;
      manual.previa = p; pintarEleccion();
    }).catch(function (e) { if (manual.fila === f) { manual.error = e.message; pintarEleccion(); } });
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
      caja.appendChild(h('div', { class: 'panel caja-ok' },
        h('b', { text: '✓ Escrito generado' }),
        h('div', { text: r.arca ? 'En un minuto se le une la constancia de ARCA. Lo encontrás en Para firmar.' : 'Falta la constancia de ARCA del mes: guardala en su carpeta y se une sola.' }),
        h('div', { class: 'botones', style: 'margin-top:8px' },
          h('a', { class: 'btn primario', href: r.escrito.url, target: '_blank', rel: 'noopener' }, 'Abrir PDF'),
          h('button', { class: 'btn', type: 'button', onclick: function () { cambiarVista('firmar'); } }, 'Ir a Para firmar'),
          h('button', { class: 'btn', type: 'button', onclick: function () { manual.fila = null; manual.texto = ''; manual.resultado = null; pintarEscritos(); } }, 'Otro escrito'))));
      return;
    }
    if (manual.error) { caja.appendChild(h('p', { class: 'error', text: manual.error })); return; }
    if (!manual.previa) { caja.appendChild(h('div', { class: 'cargando-txt', text: 'Consultando el SAE…' })); return; }

    var p = manual.previa;
    if (!p.ok) { caja.appendChild(h('p', { class: 'error', text: p.error })); return; }
    var lect = LECTURA_MOTOR[p.motor.decision] || ['aviso', p.motor.decision];
    if (p.sae.caratula) tarjeta.appendChild(h('div', { class: 'ayuda chica', style: 'margin-top:6px', text: p.sae.caratula }));
    caja.appendChild(h('div', { class: 'panel caja-' + lect[0] },
      h('b', { text: lect[1] }),
      h('div', { text: p.motor.motivo + (p.motor.detalle ? ' — ' + p.motor.detalle : '') }),
      p.motor.verificar ? h('div', { class: 'ayuda chica', text: 'Verificá que la intimación haya sido positiva.' }) : null));
    if (p.pendiente) caja.appendChild(h('div', { class: 'alerta', text: 'Ya hay un escrito de este expediente esperando firma (pestaña Para firmar).' }));

    var btn = h('button', { class: 'btn primario', type: 'button', disabled: manual.generando }, manual.generando ? 'Generando…' : 'Generar escrito');
    btn.addEventListener('click', function () {
      var riesgo = p.motor.decision === 'SENTENCIA_DICTADA' || p.motor.decision === 'NO';
      if ((riesgo || p.pendiente) && !confirm((p.pendiente ? 'Ya hay un escrito para firmar de este expediente. ' : '') +
          (riesgo ? 'El motor no lo recomienda (' + p.motor.motivo + '). ' : '') + '¿Generar igual?')) return;
      manual.generando = true; pintarEleccion();
      apiPost({ a: 'generar', tipo: manual.tipo, e: f.e, forzar: !!p.pendiente }).then(function (r) {
        manual.generando = false; manual.resultado = r; pintarEleccion();
        firmar.datos = null; contarFirmar(Number($('cuenta-firmar').textContent || 0) + 1);
      }).catch(function (e) { manual.generando = false; manual.error = e.message; pintarEleccion(); });
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
    $('btn-presentados').addEventListener('click', marcarPresentados);
    if (estado.cfg) api({ a: 'escritos' }).then(function (d) { firmar.datos = d; if (d.porFirmar) contarFirmar(d.porFirmar.length); }).catch(function () {});
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
