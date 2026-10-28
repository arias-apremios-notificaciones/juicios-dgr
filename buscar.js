/*
 * Buscador de juicios — motor compartido.
 * El mismo archivo corre en la app (navegador) y en Apps Script (Buscar.gs),
 * para que la búsqueda por Siri y la de la pantalla den el mismo resultado.
 * Tolera errores de dictado: acentos, mayúsculas, S.A./SRL, letras que suenan
 * igual (v/b, z/s, ll/y…) y números dichos en palabras ("siete mil ciento ocho barra veinticuatro").
 */
var Buscador = (function () {
  'use strict';

  // Palabras que no ayudan a distinguir un deudor.
  var VACIAS = {};
  ('de del la las los el y e en sa srl sh sas saic saci sacif sca scs se srls cia hnos hermanos ' +
   'sociedad anonima responsabilidad limitada expediente expte exp nro numero n juicio ' +
   'nominacion nom capital concepcion contra c provincia tucuman dgr').split(' ')
    .forEach(function (p) { VACIAS[p] = true; });

  function sinAcentos(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // "Ferretería El Sol S.A." -> "ferreteria el sol sa"
  function normalizar(s) {
    return sinAcentos(s).toLowerCase()
      .replace(/[.'`´"]/g, '')
      .replace(/[^a-z0-9\/ ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  // Clave fonética simple para castellano: lo que suena igual queda igual.
  function fonetica(t) {
    return t
      .replace(/ch/g, 'C').replace(/ll/g, 'y').replace(/qu/g, 'k').replace(/ph/g, 'f')
      .replace(/c([ei])/g, 's$1').replace(/c/g, 'k').replace(/z/g, 's').replace(/x/g, 'ks')
      .replace(/v/g, 'b').replace(/w/g, 'u').replace(/g([ei])/g, 'j$1').replace(/h/g, '')
      .replace(/y$/, 'i').replace(/(.)\1+/g, '$1');
  }

  function tokens(s) {
    // Se descartan las letras sueltas ("S A", "C/") y las palabras vacías.
    return normalizar(s).replace(/\//g, ' ').split(' ')
      .filter(function (t) { return t && !VACIAS[t] && !/^[a-z]$/.test(t); });
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // ───────── Números dichos en palabras ─────────
  var UNIDADES = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
    veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
    treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
    cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
    seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900
  };

  // "siete mil ciento ocho barra veinticuatro" -> "7108 / 24"
  function numerosEnPalabras(texto) {
    var palabras = normalizar(String(texto || '').replace(/(\d)\s*-\s*(?=\d)/g, '$1/')).split(' ');
    var salida = [], total = 0, actual = 0, enNumero = false;
    function cerrar() {
      if (enNumero) salida.push(String(total + actual));
      total = 0; actual = 0; enNumero = false;
    }
    for (var i = 0; i < palabras.length; i++) {
      var p = palabras[i];
      if (UNIDADES.hasOwnProperty(p)) { actual += UNIDADES[p]; enNumero = true; }
      else if (p === 'mil') { total += (actual || 1) * 1000; actual = 0; enNumero = true; }
      else if (p === 'y' && enNumero && UNIDADES.hasOwnProperty(palabras[i + 1] || '')) { /* "treinta y dos" */ }
      else { cerrar(); salida.push(p); }
    }
    cerrar();
    return salida.join(' ')
      .replace(/(\d)\s+(?:barra|bar|diagonal|sobre|del|de)\s+(\d)/g, '$1/$2')
      .replace(/(\d)\s*[\/\-]\s*(\d)/g, '$1/$2');
  }

  // ───────── Expedientes ─────────
  // "7108/24" -> "7108/24" · "3480/2019" -> "3480/19" · "07108/24" -> "7108/24"
  function claveExpte(numero, anio) {
    var n = String(parseInt(numero, 10));
    var a = String(anio);
    if (a.length === 4) a = a.slice(2);
    if (n === 'NaN' || a.length !== 2) return null;
    return n + '/' + a;
  }

  function exptesDe(texto) {
    var re = /(\d{1,6})\s*\/\s*(\d{4}|\d{2})(?!\d)/g, m, salida = [];
    while ((m = re.exec(String(texto || '')))) {
      var k = claveExpte(m[1], m[2]);
      if (k) salida.push(k);
    }
    return salida;
  }

  // Columna C del MAESTRO: "II°", "I CONCP.", "II CONCEPCION"… -> forma única.
  function nominacion(raw) {
    var s = sinAcentos(raw).toUpperCase();
    var conc = /CONC/.test(s);
    var romano = s.replace(/CONC[A-Z]*\.?/g, '').replace(/[^I\-]/g, '');
    var nom = romano === 'II' ? 'II' : romano === 'I' ? 'I' : '';
    var centro = conc ? 2 : (nom ? 1 : 0);   // 0 = no informado
    var texto = nom ? nom + ' Nom.' + (conc ? ' Concepción' : ' Capital') : (String(raw || '').trim() || 'Nominación s/d');
    return { nom: nom, centro: centro, texto: texto };
  }

  // ───────── Seguimiento (columna F) ─────────
  var RE_FECHA = /^-?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*:?\s*/;
  var RE_ISO = /^-?\s*(\d{4})-(\d{2})-(\d{2})(?:\s+\d{2}:\d{2}:\d{2})?\s*:?\s*/;

  function dos(n) { return (n < 10 ? '0' : '') + Number(n); }

  function lineaSeguimiento(linea) {
    var l = String(linea).trim(), m, fecha = '';
    if ((m = l.match(RE_ISO))) {
      fecha = dos(m[3]) + '/' + dos(m[2]) + '/' + m[1];
      l = l.slice(m[0].length);
    } else if ((m = l.match(RE_FECHA))) {
      var a = m[3].length === 2 ? '20' + m[3] : m[3];
      fecha = dos(m[1]) + '/' + dos(m[2]) + '/' + a;
      l = l.slice(m[0].length);
    } else {
      l = l.replace(/^-\s*/, '');
    }
    return { fecha: fecha, texto: l.trim() };
  }

  // Todas las líneas, la más reciente primero.
  function seguimiento(texto) {
    return String(texto || '').split(/\r?\n/)
      .filter(function (l) { return l.trim(); })
      .map(lineaSeguimiento)
      .reverse();
  }

  function ultimaLinea(texto) {
    return seguimiento(texto)[0] || { fecha: '', texto: '' };
  }

  // ───────── Índice y búsqueda ─────────
  function indexar(filas) {
    return filas.map(function (f) {
      var toks = tokens(f.d);
      var exptes = exptesDe(f.e);
      return {
        toks: toks,
        fon: toks.map(fonetica),
        exptes: exptes,
        numeros: exptes.map(function (k) { return k.split('/')[0]; }),
        cuit: String(f.c || '').replace(/\D/g, ''),
        activo: f.g !== 'CANCELADO TOTAL',
        k: f.k || ''
      };
    });
  }

  // Puntaje de una palabra buscada contra las palabras del deudor.
  function puntajeToken(q, qf, toks, fon) {
    var mejor = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], tf = fon[i], p = 0;
      if (t === q) p = 3;
      else if (q.length >= 2 && t.indexOf(q) === 0) p = 2.5;
      else if (tf === qf) p = 2.2;
      else if (qf.length >= 3 && tf.indexOf(qf) === 0) p = 1.8;
      else if (qf.length >= 4) {
        var d = levenshtein(qf, tf.length > qf.length + 2 ? tf.slice(0, qf.length + 1) : tf);
        if (d <= (qf.length >= 7 ? 2 : 1)) p = 1.4;
      }
      if (p > mejor) mejor = p;
    }
    return mejor;
  }

  /*
   * Devuelve [{i, puntaje}] ordenado. Entiende:
   *   "7108/24", "7108 barra 24", "siete mil ciento ocho barra veinticuatro" -> expediente exacto
   *   "7108" -> ese número en cualquier año
   *   "20-12345678-6", con o sin guiones, o parte (7+ dígitos) -> CUIT
   *   "el sol", "perez juan" -> deudor (todas las palabras; si no hay, tolera una que falle)
   */
  function buscar(indice, consulta, limite) {
    limite = limite || 60;
    var conNumeros = buscarTexto(indice, numerosEnPalabras(consulta));
    // "Dos Hermanos SRL": si convertir palabras en números cambió la consulta,
    // se busca también el texto literal y se queda el mejor puntaje de cada fila.
    var literal = normalizar(String(consulta || '').replace(/(\d)\s*-\s*(?=\d)/g, '$1/'));
    var mapa = {};
    conNumeros.concat(literal === numerosEnPalabras(consulta) ? [] : buscarTexto(indice, literal))
      .forEach(function (r) { if (!mapa[r.i] || mapa[r.i].puntaje < r.puntaje) mapa[r.i] = r; });
    var res = Object.keys(mapa).map(function (k) { return mapa[k]; });
    // A igual puntaje, primero el juicio con movimiento más reciente.
    res.sort(function (a, b) {
      return b.puntaje - a.puntaje || (indice[b.i].k > indice[a.i].k ? 1 : indice[b.i].k < indice[a.i].k ? -1 : a.i - b.i);
    });
    return res.slice(0, limite);
  }

  function buscarTexto(indice, q) {
    var exptes = exptesDe(q);
    var resto = q.replace(/(\d{1,6})\s*\/\s*(\d{4}|\d{2})(?!\d)/g, ' ');
    var digitos = (resto.match(/\d+/g) || []);
    var palabras = tokens(resto.replace(/\d+/g, ' '));
    var pf = palabras.map(fonetica);
    if (!exptes.length && !digitos.length && !palabras.length) return [];

    var res = [];
    for (var i = 0; i < indice.length; i++) {
      var x = indice[i], p = 0, ok = true;

      if (exptes.length) {
        var hit = exptes.some(function (k) { return x.exptes.indexOf(k) >= 0; });
        if (hit) p += 100;
        else if (exptes.some(function (k) { return x.numeros.indexOf(k.split('/')[0]) >= 0; })) p += 20;
        else ok = false;
      }
      for (var d = 0; ok && d < digitos.length; d++) {
        var g = digitos[d];
        if (g.length < 3) continue;   // "2", "24" sueltos no filtran
        if (g.length >= 7) { if (x.cuit && x.cuit.indexOf(g) >= 0) p += 90; else ok = false; }
        else if (x.numeros.indexOf(String(parseInt(g, 10))) >= 0) p += 80;
        else if (x.numeros.some(function (n) { return n.indexOf(g) === 0; })) p += 30;
        else ok = false;
      }
      if (!ok) continue;

      if (palabras.length) {
        var suma = 0, fallas = 0;
        for (var w = 0; w < palabras.length; w++) {
          var s = puntajeToken(palabras[w], pf[w], x.toks, x.fon);
          if (s === 0) fallas++;
          suma += s;
        }
        // Todas las palabras tienen que aparecer; con 3 o más se perdona una (error de dictado).
        if (fallas > (palabras.length >= 3 ? 1 : 0)) continue;
        p += suma * 10 - fallas * 15;
        if (palabras.length === x.toks.length && fallas === 0) p += 5;
      }
      if (p <= 0) continue;
      if (x.activo) p += 1;
      res.push({ i: i, puntaje: p });
    }
    return res;
  }

  // ───────── Utilidades de presentación ─────────
  function diasDesde(iso, hoy) {
    if (!iso) return null;
    var p = iso.split('-');
    var f = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    var h = hoy || new Date();
    var hu = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    return Math.round((hu - f) / 86400000);
  }

  // Semáforo de la col. L: verde <365 · amarillo 365–659 · rojo ≥660. CANCELADO TOTAL no alarma.
  function semaforo(dias, estado) {
    if (dias == null || estado === 'CANCELADO TOTAL') return '';
    return dias >= 660 ? 'rojo' : dias >= 365 ? 'amarillo' : 'verde';
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function fechaHablada(ddmmaaaa) {
    var p = String(ddmmaaaa || '').split('/');
    if (p.length !== 3) return '';
    return Number(p[0]) + ' de ' + MESES[Number(p[1]) - 1] + ' de ' + p[2];
  }

  // Texto para que Siri lo lea en voz alta.
  function resumenVoz(filas, resultados) {
    if (!resultados.length) return 'No encontré ningún juicio con ese dato.';
    var top = resultados.slice(0, 3).map(function (r) { return filas[r.i]; });
    var partes = top.map(function (f) {
      var nom = nominacion(f.n);
      var ult = ultimaLinea(f.f);
      var exp = String(f.e).replace(/\//g, ' barra ');
      var t = f.d + '. Expediente ' + exp + ', ' +
        (nom.nom ? (nom.nom === 'II' ? 'segunda' : 'primera') + ' nominación' + (nom.centro === 2 ? ' de Concepción' : '') : 'nominación sin dato') +
        '. Estado: ' + String(f.g || 'sin estado').toLowerCase() + '.';
      if (ult.texto) t += ' Último movimiento' + (ult.fecha ? ' del ' + fechaHablada(ult.fecha) : '') + ': ' + ult.texto.toLowerCase();
      return t.replace(/\.?\s*$/, '.');
    });
    var extra = resultados.length > 3 ? ' Hay ' + (resultados.length - 3) + ' resultados más en la app.' : '';
    var intro = resultados.length > 1 ? 'Encontré ' + resultados.length + ' juicios. ' : '';
    return intro + partes.join(' ') + extra;
  }

  // ¿La carátula del SAE corresponde a este deudor? (control al guardar el procid)
  function caratulaCoincide(deudor, caratula) {
    var c = tokens(caratula).map(fonetica);
    var d = tokens(deudor).filter(function (t) { return t.length >= 3; }).map(fonetica);
    if (!d.length) return false;
    var hits = d.filter(function (t) { return c.indexOf(t) >= 0; }).length;
    return hits >= Math.min(2, d.length);
  }

  return {
    normalizar: normalizar, fonetica: fonetica, numerosEnPalabras: numerosEnPalabras,
    claveExpte: claveExpte, exptesDe: exptesDe, nominacion: nominacion,
    seguimiento: seguimiento, ultimaLinea: ultimaLinea,
    indexar: indexar, buscar: buscar, diasDesde: diasDesde, semaforo: semaforo,
    fechaHablada: fechaHablada, resumenVoz: resumenVoz, caratulaCoincide: caratulaCoincide
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Buscador;
