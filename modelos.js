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

  /*
   * Cada modelo: nombre (= título, como se lista), claves (para el buscador), titulo, presentacion, cuerpo, arca,
   * adjunto (lo que Carlos sube y se une detrás del escrito), campos (datos entre llaves), calcular, seguimiento, cierre.
   * Campos: tipo texto | fecha | monto | cuit; auto: demandado | cuit | hoy (se completa solo con el MAESTRO / la fecha de hoy).
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
        'Habiéndose abonado la suma de {MONTO PAGADO}, cabe restar este monto a los {MONTO ACTUALIZADO}, lo que da un monto adeudado de {SALDO}, con más el IVA, aportes previsionales y lo que VS considere por acrecidas.',
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
        'Se oficie a ARCA a los fines de que indique si posee inscripción en dicho Organismo Fiscal, en qué actividades se encuentra inscripta en su caso y si presenta y paga las declaraciones juradas de IVA desde el año 2020 a la fecha.'
      ],
      campos: [{ id: 'DEMANDADO', etiqueta: 'Demandado', tipo: 'texto', auto: 'demandado' },
               { id: 'CUIT', etiqueta: 'CUIT del demandado', tipo: 'cuit', auto: 'cuit' }]
    },
    // "AGRO TIUN S.R.L. (167-13) - ACOMPAÑO CONSTANCIA": la constancia de ARCA es la del mes, la que ya usa el pedido de sentencia.
    ACOMPANO_CONSTANCIA: {
      nombre: 'ACOMPAÑO CONSTANCIA', claves: 'constancia inscripcion arca afip cumplimiento proveido',
      titulo: 'ACOMPAÑO CONSTANCIA',
      presentacion: ', apoderado de la parte actora, por derecho propio a V.S. respetuosamente digo:',
      cuerpo: ['Vengo a dar cumplimiento con el proveído que antecede. A tales efectos, acompaño constancia de inscripción ante ARCA. Se agregue y se tenga presente.'],
      arca: true
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
    return { id: id, nombre: m.nombre, titulo: m.titulo, cuerpo: m.cuerpo.slice(), arca: !!m.arca, adjunto: m.adjunto || null,
             campos: (m.campos || []).map(function (c) { return { id: c.id, etiqueta: c.etiqueta, tipo: c.tipo, auto: c.auto || '' }; }), agregados: ag };
  }

  /** Valor automático de un campo (auto = { demandado, cuit, hoy } del juicio). */
  function valorAuto(c, auto) {
    if (!c.auto || !auto) return '';
    return c.auto === 'cuit' ? String(auto.cuit || '').replace(/\D/g, '') : String(auto[c.auto] || '');
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
  function completarCampos(m, dados, auto) {
    var v = {}, n = {};
    var campos = m.campos || [];
    for (var i = 0; i < campos.length; i++) {
      var c = campos[i], nombre = c.etiqueta.replace(/ \(.*\)$/, ''), crudo = limpio(dados[c.id]) || valorAuto(c, auto);
      if (!crudo) return { error: 'Falta completar: ' + nombre + '.' };
      if (c.tipo === 'monto') {
        if ((n[c.id] = monto(crudo)) === null) return { error: nombre + ': el monto no es válido.' };
        v[c.id] = pesos(n[c.id]);
      } else if (c.tipo === 'fecha') {
        if (!(v[c.id] = fecha(crudo))) return { error: nombre + ': la fecha tiene que ser dd/mm/aaaa.' };
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

    var c = completarCampos(m, ed.campos || {}, ed.auto);
    if (c.error) return { ok: false, error: c.error };
    var tituloModelo = titulo === m.titulo;
    titulo = rellenar(titulo, c.valores);
    cuerpo = cuerpo.map(function (p) { return rellenar(p, c.valores); });
    var resto = (titulo + ' ' + cuerpo.join(' ')).match(LLAVE);
    if (resto) return { ok: false, error: 'Hay un dato entre llaves que no se completa: ' + resto[0] + '. Borralo o corregilo.' };

    var subidos = (ed.archivos || []).length;
    if (m.adjunto && !subidos) return { ok: false, error: 'Falta subir el archivo: ' + m.adjunto.etiqueta.toLowerCase() + '.' };
    if (subidos > MAX_ARCHIVOS) return { ok: false, error: 'Son muchos archivos (máximo ' + MAX_ARCHIVOS + ').' };
    var sinPunto = titulo.replace(/[\s.\-–]+$/, '');
    // Seguimiento propio del modelo (p. ej. con el saldo) solo si el título quedó como en el modelo.
    var seguimiento = m.seguimiento && tituloModelo ? rellenar(m.seguimiento, c.valores) : sinPunto + '.';
    return {
      ok: true, titulo: titulo, accion: sinPunto, tipo: sinPunto, presentacion: m.presentacion, cierre: !!m.cierre, cuerpo: cuerpo,
      seguimiento: seguimiento, sinArca: !(ed.arca == null ? !!m.arca : ed.arca), carpeta: CARPETA, adjunto: m.adjunto || null
    };
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
           pesos: pesos, monto: monto, fecha: fecha, columnaAdjunto: columnaAdjunto, leerAdjunto: leerAdjunto };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Modelos;
