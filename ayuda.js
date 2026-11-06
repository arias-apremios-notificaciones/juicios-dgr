/*
 * Ayuda de la app (botón "?"): guía por secciones con buscador. Pedido de Carlos del 05/11/2026.
 * Archivo puro y sin conexión: lo usa la app y se prueba en la Mac con pruebas/prueba_ayuda.js.
 * REGLA: cada entrega que agrega o cambia una función de la app actualiza esta guía (y su prueba controla que estén todas las pestañas).
 * Cada pregunta: id, seccion, pregunta, claves (palabras para el buscador), texto (párrafos), pasos (optativo), nota (optativo), ir (pestaña).
 */
var Ayuda = (function () {
  'use strict';

  var VISTAS = { buscar: 'Buscar', agenda: 'Agenda', seguimientos: 'Seguimientos', firmar: 'Para firmar', escritos: 'Escritos', honorarios: 'Honorarios', tablero: 'Tablero' };
  var SECCIONES = [
    { id: 'general', nombre: 'General' },
    { id: 'buscar', nombre: 'Buscar', vista: 'buscar' },
    { id: 'agenda', nombre: 'Agenda', vista: 'agenda' },
    { id: 'seguimientos', nombre: 'Seguimientos', vista: 'seguimientos' },
    { id: 'firmar', nombre: 'Para firmar', vista: 'firmar' },
    { id: 'escritos', nombre: 'Escritos', vista: 'escritos' },
    { id: 'honorarios', nombre: 'Honorarios', vista: 'honorarios' },
    { id: 'tablero', nombre: 'Tablero', vista: 'tablero' },
    { id: 'conexion', nombre: 'Sin conexión' }
  ];

  var GUIA = [];   // se completa abajo, sección por sección

  function sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function clave(s) { return sinAcentos(s).toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim(); }
  // Palabras que no ayudan a buscar ("¿cómo hago para…?").
  var VACIAS = { como: 1, hago: 1, para: 1, que: 1, el: 1, la: 1, los: 1, las: 1, un: 1, una: 1, de: 1, del: 1, en: 1, y: 1, o: 1, a: 1, al: 1, se: 1, es: 1, me: 1, mi: 1,
                 por: 1, con: 1, lo: 1, le: 1, puedo: 1, donde: 1, cuando: 1, cual: 1, hay: 1, quiero: 1, hacer: 1, sirve: 1, significa: 1, esta: 1, este: 1, eso: 1, esto: 1 };

  function palabras(texto) { return clave(texto).split(' ').filter(function (p) { return p && !VACIAS[p]; }); }
  // Coincide al principio de una palabra; con 4 letras o más tolera la última distinta ("embargos" → "embargo").
  // Devuelve 2 si está entera, 1 si solo coincide la raíz, 0 si no está.
  function contiene(donde, p) { return donde.indexOf(' ' + p) >= 0 ? 2 : (p.length > 3 && donde.indexOf(' ' + p.slice(0, -1)) >= 0 ? 1 : 0); }

  /**
   * Buscador: cada palabra suma si aparece en la pregunta (más), en las claves o en la respuesta (sin tildes ni mayúsculas;
   * "embargos" encuentra "embargo"). Sale ordenado por puntaje; con 1 o 2 palabras tienen que aparecer todas, con más alcanza la mitad.
   */
  function buscar(texto) {
    var ps = palabras(texto);
    if (!ps.length) return [];
    return GUIA.map(function (e, i) {
      var preg = ' ' + clave(e.pregunta), cla = ' ' + clave(e.claves), resp = ' ' + clave((e.texto || []).concat(e.pasos || [], e.nota || '').join(' '));
      var puntos = 0, halladas = 0;
      ps.forEach(function (p) {
        var en = contiene(preg, p) * 3 || contiene(cla, p) * 2 || contiene(resp, p);
        puntos += en; if (en) halladas++;
      });
      return { e: e, i: i, puntos: puntos, halladas: halladas };
    }).filter(function (x) { return x.halladas && (ps.length <= 2 ? x.halladas === ps.length : x.halladas * 2 >= ps.length); })
      .sort(function (a, b) { return (b.halladas - a.halladas) || (b.puntos - a.puntos) || (a.i - b.i); })
      .map(function (x) { return x.e; });
  }

  function deSeccion(id) { return GUIA.filter(function (e) { return !id || e.seccion === id; }); }
  function seccionDeVista(v) { var s = SECCIONES.filter(function (x) { return x.vista === v; })[0]; return s ? s.id : ''; }
  function nombreSeccion(id) { var s = SECCIONES.filter(function (x) { return x.id === id; })[0]; return s ? s.nombre : ''; }
  function nombreVista(v) { return VISTAS[v] || v; }

  function agregar(seccion, ir, items) {
    items.forEach(function (e) { GUIA.push(Object.assign({ seccion: seccion, ir: ir, texto: [] }, e)); });
  }

  // ══════════════ CONTENIDO ══════════════
  agregar('general', '', [
    { id: 'g-que-es', pregunta: '¿Qué hace la app?', claves: 'inicio resumen funciones para que sirve',
      texto: ['Junta en un solo lugar los juicios del MAESTRO, el SAE, la agenda, los escritos para firmar y los honorarios. Lee el MAESTRO (la fuente de verdad) y solo escribe en él cuando vos lo confirmás.',
              'La app redacta y prepara: los escritos los firmás y los subís al SAE siempre vos. Nada se presenta solo.'] },
    { id: 'g-pestanas', pregunta: '¿Qué hay en cada pestaña?', claves: 'pestañas menu secciones',
      texto: ['Buscar: encontrar un juicio y ver su ficha (MAESTRO, SAE, deuda). Agenda: vencimientos, audiencias y tareas. Seguimientos: listas de juicios para revisar cada tantos días. Para firmar: los escritos listos para firmar e imprimir. Escritos: hacer un escrito a mano con un modelo. Honorarios: el listado semanal, cobros y escritos de honorarios (con PIN). Tablero: números y gráficos.',
              'El botón "?" de arriba abre esta guía en la sección de la pestaña en la que estás.'] },
    { id: 'g-sync', pregunta: '¿Qué significa la pastilla de arriba ("N juicios · hace X")? ¿Cómo actualizo los datos?', claves: 'actualizar sincronizar refrescar datos copia local pastilla',
      texto: ['Dice cuántos juicios trajo del MAESTRO y hace cuánto. Tocala para actualizar en el momento. La app también se actualiza sola al volver a la pantalla, si pasaron más de 5 minutos.',
              '"Copia local" o "Sin conexión" quiere decir que estás viendo lo último que se guardó en el teléfono. "Sin configurar" quiere decir que falta conectarla (engranaje).'] },
    { id: 'g-config', pregunta: '¿Cómo conecto la app en un teléfono o computadora nueva?', claves: 'configurar configuracion engranaje codigo conectar dispositivo nuevo instalar',
      texto: ['Se hace una vez por dispositivo, desde el engranaje (Configuración).'],
      pasos: ['En Apps Script, ejecutá la función configurar() y copiá el código que te da.', 'En la app tocá el engranaje y pegalo en "Código de configuración".', 'Tocá "Guardar y conectar".'],
      nota: 'El código incluye tu clave: no lo compartas. Si dice que la dirección termina en /dev, es la de prueba: tiene que ser la de la app web, que termina en /exec.' },
    { id: 'g-botones', pregunta: '¿Para qué son los botones de arriba?', claves: 'botones encabezado maestro honorarios engranaje planilla abrir',
      texto: ['El icono de tabla abre la planilla MAESTRO. El "$" abre la planilla HONORARIOS (si no entraste con el PIN, te lleva a la pestaña Honorarios para pedirlo). El "?" abre esta ayuda y el engranaje, la configuración.'] },
    { id: 'g-siri', pregunta: '¿Cómo uso "Oye Siri, juicio"?', claves: 'siri atajo voz iphone dictar',
      texto: ['Con un Atajo del iPhone, decís "Oye Siri, juicio", después el nombre o el número, y Siri te lee el estado y el último movimiento (hasta 3 juicios).'],
      pasos: ['En la app: engranaje → "Atajo de Siri" → "Copiar enlace para el Atajo".', 'En la app Atajos: + → nombre "Juicio".', 'Agregá "Dictar texto" (Español – Argentina).', 'Agregá "URL": pegá el enlace y al final agregá la variable "Texto dictado".', 'Agregá "Obtener contenido de URL" y "Mostrar resultado".'],
      nota: 'El enlace incluye tu clave: no lo compartas.' },
    { id: 'g-avisos', pregunta: '¿Qué son los avisos que aparecen debajo de las pestañas?', claves: 'avisos banner cartel rojo amarillo alerta',
      texto: ['"⚠ Agenda: …" resume lo vencido, lo de hoy y lo próximo; en rojo si hay algo vencido o para hoy. Tocalo para ir a la Agenda.',
              '"⏳ N cambios hechos sin conexión" son cambios guardados en el teléfono que se envían solos al volver la señal.',
              '"📤 Recordatorio semanal" te recuerda subir al Drive lo guardado en la PC del trabajo.'] },
    { id: 'g-drive', pregunta: '¿Qué es el recordatorio de subir archivos al Drive?', claves: 'drive recordatorio semanal subir pc trabajo facturas word pdf',
      texto: ['Desde el viernes, si esa semana no lo marcaste, aparece "📤 Recordatorio semanal: subí al Drive lo guardado en la PC del trabajo: facturas, escritos en Word y PDF firmados". Si quedó pendiente de la semana anterior, aparece todos los días.',
              '"Ya lo subí" lo marca como hecho y "Abrir Drive ↗" abre el Drive. Es también una tarea que se repite en la Agenda: si la borrás, no vuelve.'] },
    { id: 'g-contadores', pregunta: '¿Qué indican los números rojos en las pestañas?', claves: 'contador numero globo pestaña badge',
      texto: ['Agenda: vencidos + para hoy + próximos. Seguimientos: juicios que toca revisar o que cambiaron de estado. Para firmar: escritos esperando tu firma.'] },
    { id: 'g-presenta', pregunta: '¿La app presenta los escritos sola en el SAE?', claves: 'presentar subir sae firmar automatico solo',
      texto: ['No. La app redacta y arma los PDF; vos los firmás y los subís al SAE. Después, con "Marcar como presentados", se anota en el MAESTRO. Toda escritura en el MAESTRO o en HONORARIOS pide confirmación.'] },
    { id: 'g-imprimir', pregunta: '¿Cómo imprimo desde el iPhone o la computadora?', claves: 'imprimir impresora airprint guardar pdf papel',
      texto: ['Los botones "Imprimir" arman una hoja A4 con tu pie de firma. En el iPhone se abre el menú del sistema: elegís la impresora (AirPrint) o "Guardar como PDF". Los escritos se imprimen desde su propio PDF ("Abrir PDF" o "Imprimir juntos").'] },
    { id: 'g-mails', pregunta: '¿Qué mails me manda la app?', claves: 'mail correo gmail aviso mañana diario',
      texto: ['Cerca de las 7 de la mañana pueden llegar dos mails: el de la Agenda (vencidos, plazos fatales, vencimientos y audiencias que se acercan) y el de Seguimientos (juicios que toca revisar). Como máximo uno por día de cada uno, y ninguno si no hay nada para avisar.'] },
    { id: 'g-error-servidor', pregunta: '¿Qué hago si dice "El servidor respondió algo inesperado" o "todavía no tiene esta función"?', claves: 'error servidor apps script version implementar falla no funciona',
      texto: ['Casi siempre falta actualizar el Apps Script: pegar el código nuevo y crear una versión nueva.', 'Si es "No hay conexión con el servidor", revisá la señal e intentá de nuevo.'],
      pasos: ['Abrí el proyecto en Apps Script y pegá el código nuevo.', 'Implementar → Gestionar implementaciones → editar → Nueva versión → Implementar.'],
      nota: 'Si el error se repite, mandale una captura a Claude.' }
  ]);

  agregar('buscar', 'buscar', [
    { id: 'b-como', pregunta: '¿Cómo busco un juicio?', claves: 'buscar encontrar deudor nombre cuit expediente',
      texto: ['Escribí parte del nombre del deudor, el número de expediente o el CUIT. No importan tildes, mayúsculas, "S.A.", "SRL" ni errores típicos de dictado (v/b, s/z/c, ll/y, h).',
              'Tienen que aparecer todas las palabras (con 3 o más, puede fallar una). Si hay un solo resultado, la ficha se abre directamente.'] },
    { id: 'b-numero', pregunta: '¿Cómo busco por número de expediente o CUIT?', claves: 'numero expediente expte año barra cuit',
      texto: ['"7108/24" o "7108-24" busca ese expediente exacto; "7108" solo, ese número en cualquier año. Con 7 o más números busca por CUIT, completo o en parte. También entiende números dictados ("siete mil ciento ocho barra veinticuatro").'] },
    { id: 'b-voz', pregunta: '¿Cómo busco por voz?', claves: 'voz microfono dictar hablar',
      texto: ['Tocá el micrófono. En el iPhone el cursor queda en el campo: tocá el 🎤 del teclado y decí el nombre o el número. En la computadora (Chrome o Edge) escucha directamente; permití el micrófono la primera vez.'] },
    { id: 'b-colores', pregunta: '¿Qué significan los colores del estado?', claves: 'color colores estado chip verde rojo naranja amarillo azul celeste violeta',
      texto: ['Son los mismos colores del MAESTRO. Verde: en trámite (intimación, excepciones, prueba, autos para resolver, planilla fiscal, recurso, edictos). Naranja: sentencia o ejecución. Rojo: honorarios pendientes o plan de pagos caduco. Azul: cancelado parcial. Amarillo: cancelado total. Celeste: deuda regularizada o plan de pagos activo. Violeta: sin bienes / inhibición. DEMANDA no tiene color.'] },
    { id: 'b-semaforo', pregunta: '¿Qué significa el punto de color y "hace N días"?', claves: 'semaforo punto dias movimiento ultimo antiguedad',
      texto: ['Son los días desde el último movimiento (columna ÚLTIMO MOV. del MAESTRO o la última fecha del SEGUIMIENTO). Verde: menos de un año. Amarillo: entre 365 y 659 días. Rojo: 660 días o más. Los CANCELADO TOTAL no llevan color.'] },
    { id: 'b-ficha', pregunta: '¿Qué hay en la ficha de un juicio?', claves: 'ficha detalle juicio datos importe fila',
      texto: ['Importe, CUIT, último movimiento y fila del MAESTRO; el estado con "Cambiar estado"; "Abrir en el MAESTRO" (va a esa fila); el SEGUIMIENTO completo del MAESTRO; y los botones del SAE y de la deuda. También "Agendar" y "Seguir".'] },
    { id: 'b-estado', pregunta: '¿Cómo cambio el estado de un juicio en el MAESTRO?', claves: 'cambiar estado maestro columna otros subestado',
      texto: ['Se escribe en la columna ESTADO del MAESTRO, siempre con confirmación. Necesita conexión.'],
      pasos: ['Abrí la ficha del juicio.', 'Tocá "Cambiar estado" y elegí el nuevo.', 'Si elegís OTROS, escribí el subestado (queda "OTROS: TEXTO").', 'Tocá "Guardar" y confirmá.'] },
    { id: 'b-sae', pregunta: '¿Cómo veo los movimientos del SAE de un juicio?', claves: 'sae movimientos proveido leer caratula juzgado expediente',
      texto: ['En la ficha, "Ver en SAE" trae la carátula, el juzgado y los últimos 12 movimientos (la primera vez tarda unos 10 segundos). "Leer" muestra el texto de un movimiento con sus adjuntos y "Último proveído" va directo al último; desde ahí se puede imprimir.',
              'Si avisa que la carátula no coincide con el deudor, verificalo. Los números de formato antiguo no se pueden buscar en el SAE.'],
      nota: '"Copiar Nº" copia el número; "Portal SAE ↗" lo copia y abre el portal de consulta.' },
    { id: 'b-deuda', pregunta: '¿Cómo veo el detalle de la deuda (boletas de la demanda)?', claves: 'deuda boletas demanda detalle total impuesto padron exportar excel',
      texto: ['En la ficha, "Detalle de deuda" busca la demanda en el SAE y muestra cada boleta con su concepto completo, tal como lo dice la demanda (origen del título, acta, expediente, resolución, períodos), el padrón o dominio y el importe, con el total reclamado; y controla que la suma coincida.',
              'Se puede imprimir para darle al demandado (con el total en letras), exportar a Excel o compartir. La consulta queda guardada 30 días; no se incorpora al MAESTRO.'] },
    { id: 'b-imprimir-estado', pregunta: '¿Cómo imprimo el estado del juicio?', claves: 'imprimir estado juicio ficha uso interno',
      texto: ['En la ficha, "Imprimir estado del juicio (con SAE)". El primer toque trae los movimientos del SAE; cuando dice "Listo: tocá para imprimir", tocá otra vez (el iPhone solo imprime con un toque directo). Si antes abriste "Detalle de deuda", la deuda sale también.'] },
    { id: 'b-agendar', pregunta: '¿Cómo agendo o sigo un juicio desde su ficha?', claves: 'agendar seguir ficha vencimiento seguimiento',
      texto: ['"Agendar" abre el formulario de la Agenda con el juicio ya puesto. "Seguir" lo suma a una lista de Seguimientos. Si ya está en alguna lista, la ficha dice "👁 En seguimiento: …".'] },
    { id: 'b-imprimir-lista', pregunta: '¿Puedo imprimir los resultados de una búsqueda?', claves: 'imprimir lista resultados busqueda',
      texto: ['Sí: cuando hay más de un resultado aparece "Imprimir lista" (hoja apaisada).'] }
  ]);

  agregar('agenda', 'agenda', [
    { id: 'a-que', pregunta: '¿Qué puedo cargar en la Agenda?', claves: 'agenda tipos vencimiento audiencia reunion tarea',
      texto: ['Cuatro tipos, cada uno con su tarjeta: Vencimiento (con fecha), Audiencia o reunión (fecha y hora), Tarea sin fecha (con el lugar: Tribunales, Computadora, Teléfono, Despacho) y Tarea que se repite (todos los días, semanas o meses).',
              'La Agenda se guarda en la planilla del MOTOR: no toca el MAESTRO.'] },
    { id: 'a-agregar', pregunta: '¿Cómo agrego un vencimiento?', claves: 'agregar cargar nuevo vencimiento plazo fecha',
      pasos: ['Tocá "+ Agregar".', 'En "Qué vas a cargar" elegí Vencimiento.', 'Escribí de qué se trata (ej.: Contestar traslado) y la fecha (o calculala con "Contar días hábiles").', 'Si querés, tildá "Plazo fatal", buscá el juicio y agregá notas.', 'Tocá "Agregar a la agenda".'],
      nota: 'Si la fecha cae en un día inhábil, la app te avisa.' },
    { id: 'a-habiles', pregunta: '¿Cómo cuento días hábiles para un plazo?', claves: 'dias habiles contar calcular plazo feriado feria notificacion',
      texto: ['En el formulario de un Vencimiento, abrí "Contar días hábiles": poné la fecha de notificación y la cantidad de días, y tocá "Calcular". Cuenta desde el día siguiente y saltea fines de semana, feriados y ferias (pestaña CALENDARIO de la planilla del MOTOR). El resultado queda en Fecha.'],
      nota: 'Controlá el resultado antes de guardar. Los feriados de 2027 todavía están "A CONFIRMAR".' },
    { id: 'a-fatal', pregunta: '¿Qué hace "Plazo fatal"?', claves: 'plazo fatal aviso diario urgente',
      texto: ['Marca el vencimiento con el chip PLAZO FATAL y avisa todos los días desde 7 días antes, en la app y en el mail de la mañana. Los demás vencimientos avisan 7, 3, 1 y 0 días antes.'] },
    { id: 'a-repite', pregunta: '¿Cómo funcionan las tareas que se repiten?', claves: 'repite recurrente diaria semanal mensual periodo',
      texto: ['Son para lo que hacés cada día, semana o mes (ej.: subir la constancia de ARCA). "Cumplido" marca el período actual; al empezar el siguiente, la tarea vuelve sola a pendientes.'] },
    { id: 'a-cumplido', pregunta: '¿Cómo marco algo como cumplido, lo edito o lo borro?', claves: 'cumplido hecho deshacer editar borrar ver cumplidos',
      texto: ['Cada tarjeta tiene "Cumplido" (o "Deshacer" si ya estaba hecho), "Editar" y "Borrar" (pide confirmación). Lo cumplido de los últimos 60 días se ve con "Ver cumplidos". "Expte. … ›" abre el juicio.'] },
    { id: 'a-avisos', pregunta: '¿Cuándo me avisa la Agenda?', claves: 'avisos mail correo vencido proximo audiencia',
      texto: ['En la app: el cartel "⚠ Agenda" y el número de la pestaña. Por mail, cerca de las 7: vencidos todos los días, plazos fatales desde 7 días antes, otros vencimientos a 7, 3, 1 y 0 días, y audiencias a 7, 1 y 0 días.'] }
  ]);

  agregar('seguimientos', 'seguimientos', [
    { id: 's-que', pregunta: '¿Para qué sirven los Seguimientos?', claves: 'seguimientos listas vigilar revisar seguir de cerca',
      texto: ['Son listas de juicios que querés vigilar, cada una con su tarjeta y cada cuántos días revisarlos. Vienen tres: "Juicios a seguir de cerca" (7 días), "Honorarios a seguir" (15) y "Vencimientos a vigilar" (3).',
              'Te avisa cuando toca revisar un juicio, cuando cambia su estado o cuando hay un movimiento nuevo en el MAESTRO desde la última revisión. Lo que toca revisar llega también por mail a la mañana.'] },
    { id: 's-agregar', pregunta: '¿Cómo sumo un juicio a una lista?', claves: 'agregar sumar juicio seguir lista',
      pasos: ['Tocá "+ Agregar juicio" (o "Seguir" en la ficha del juicio).', 'Buscá el juicio y elegí la lista.', 'Si querés, poné la próxima revisión y una nota (ej.: esperar el informe del banco).', 'Tocá "Agregar al seguimiento".'] },
    { id: 's-listas', pregunta: '¿Cómo creo, cambio o borro una lista?', claves: 'nueva lista crear renombrar borrar editar dias',
      texto: ['"+ Nueva lista": nombre y cada cuántos días revisar. Dentro de una lista, "Editar lista" permite cambiar el nombre, los días o borrarla. Al borrarla, sus juicios salen del seguimiento (en la planilla quedan anotados). Máximo 20 listas.'] },
    { id: 's-alertas', pregunta: '¿Qué significan los avisos en la tarjeta de un juicio seguido?', claves: 'alerta aviso cambio estado movimiento nuevo sin movimiento no aparece',
      texto: ['"Cambió el estado: X → Y": el estado del MAESTRO no es el de tu última revisión. "Movimiento nuevo en el MAESTRO": hay una línea nueva desde que lo revisaste. "Sin movimiento hace N días": 90 días o más quieto. "No aparece en el MAESTRO": no se encuentra ese expediente.',
              '"Toca revisar hoy" o "Revisión atrasada" indican que se cumplieron los días de la lista.'] },
    { id: 's-revisado', pregunta: '¿Qué hace "Revisado"?', claves: 'revisado revisar marcar proxima revision',
      texto: ['Anota que lo revisaste hoy, toma el estado y el último movimiento actuales como referencia (se borran esos avisos) y fija la próxima revisión según los días de la lista.', '"Quitar" lo saca de la lista; "Editar" cambia la lista, la fecha o la nota.'] }
  ]);

  agregar('firmar', 'firmar', [
    { id: 'f-que', pregunta: '¿Qué hay en Para firmar?', claves: 'para firmar tarjetas pendientes escritos',
      texto: ['Tres tarjetas: "Pedidos de sentencia" (los arma el motor los domingos), "Cancelaciones (IVP)" (los arma al llegar un IVP a Gmail) y "Honorarios y otros" (los de la pestaña Honorarios y los modelos de Escritos). Cada una dice cuántos hay para firmar.'] },
    { id: 'f-flujo', pregunta: '¿Cómo firmo y presento los escritos?', claves: 'firmar presentar subir sae pasos flujo',
      pasos: ['Abrí la tarjeta y revisá cada escrito ("Abrir PDF", "Ver juicio").', 'Tildá los que vas a firmar e imprimilos con "Imprimir juntos" (o abrí cada PDF).', 'Firmalos y subilos al SAE (eso lo hacés vos).', 'Tildalos y tocá "Marcar como presentados": se anota en el MAESTRO con la fecha de hoy.'],
      nota: 'Al abrir una tarjeta se destilda todo, para no marcar algo que no está en pantalla.' },
    { id: 'f-juntos', pregunta: '¿Qué hace "Imprimir juntos"?', claves: 'imprimir juntos pdf unico varios',
      texto: ['Arma UN solo PDF con los escritos tildados, cada uno con su constancia o IVP (máximo 40). Tarda 1 o 2 minutos; cuando aparece "🖨 PDF para imprimir listo", tocá "Abrir PDF". Queda en la carpeta PARA IMPRIMIR del Drive y se borra a los 7 días.'] },
    { id: 'f-presentados', pregunta: '¿Qué anota "Marcar como presentados" en el MAESTRO?', claves: 'marcar presentados maestro seguimiento anota estado',
      texto: ['En el SEGUIMIENTO agrega "- fecha: TEXTO" (por ejemplo "PIDO SENTENCIA." o "COMUNICO CANCELACION DE LA DEUDA. IVP I …"), actualiza MES y ÚLTIMO MOV., y si el escrito lo indica cambia el ESTADO (CANCELADO TOTAL, CANCELADO PARCIAL o DEUDA REGULARIZADA). Pide confirmación.',
              'Si lo marcás sin conexión, se anota al volver la señal con la fecha del día en que lo marcaste.'] },
    { id: 'f-descartar', pregunta: '¿Qué pasa si descarto un escrito?', claves: 'descartar borrar escrito papelera',
      texto: ['El PDF va a la papelera de Drive y sale de la lista. No escribe nada en el MAESTRO.'] },
    { id: 'f-chips', pregunta: '¿Qué significan "📎 con IVP", "sin ARCA" y los otros chips?', claves: 'chip adjunto arca ivp uniendo sin adjuntos falta',
      texto: ['"📎 con IVP / con ARCA / con adjunto": el adjunto ya está unido al PDF del escrito. "sin adjuntos": va solo. "sin ARCA" (en rojo): necesita la constancia de ARCA del mes y todavía no está. "uniendo…": se está uniendo el adjunto.',
              '"Al presentar: ESTADO → X" avisa qué estado se pone en el MAESTRO al marcarlo presentado.'] },
    { id: 'f-motor', pregunta: '¿Cómo decide el motor los pedidos de sentencia?', claves: 'motor analisis domingo pedir reiterar esperar revision automatico',
      texto: ['Todos los domingos (o lunes/martes si el domingo no corrió) revisa en el SAE los juicios en DEMANDA, INTIMACION, AUTOS P/RESOLVER y PLANILLA FISCAL. Pide sentencia si la intimación está diligenciada con 6 días hábiles y sin excepciones, o si está en despacho sin pedido previo. Reitera si pasaron 15 días o más del último pedido sin sentencia. Espera si el plazo corre o el pedido es reciente.',
              'Lo dudoso (excepciones, recurso, escrito de un tercero, cancelación, edictos, intimación probablemente negativa, etc.) va a "Revisión manual". Con "Analizar ahora" lo corrés en el momento.'],
      nota: 'Los escritos quedan en el Drive en BORRADORES AUTOMATICOS/PEDIDOS DE SENTENCIA, con una copia editable en Google Docs.' },
    { id: 'f-arca', pregunta: '¿Qué es la constancia de ARCA del mes? ¿Cómo la subo?', claves: 'arca constancia mes carpeta unir afip subir monotributo nueva cambiar',
      texto: ['Cada pedido de sentencia se sube junto con la constancia de ARCA del mes. Está al día si el archivo más nuevo de la carpeta CONSTANCIA ARCA es de este mes; entonces se une sola a los escritos, o con "Unir la constancia a N escritos".',
              'Para subirla: bajá el PDF de ARCA y, en Para firmar, tocá "Subir constancia de ARCA" (si falta la del mes) o "Subir una constancia nueva" (para reemplazar la del mes, por ejemplo al cambiar de categoría). Se guarda en CONSTANCIA ARCA y desde ese momento es la que se une.'],
      nota: 'Los escritos que ya están para firmar quedan con la constancia que tenían: si hace falta la nueva, descartalos y generalos de nuevo.' },
    { id: 'f-revision', pregunta: '¿Qué es "Revisión manual" y "Ya tienen sentencia en el SAE"?', claves: 'revision manual criterio ya tienen sentencia cambiar estado',
      texto: ['"Revisión manual": juicios en los que el motor no genera escrito porque necesitan tu criterio (también los IVP dudosos). Tocá uno para ver su ficha.',
              '"Ya tienen sentencia en el SAE": en el MAESTRO figuran como INTIMACION o AUTOS P/RESOLVER pero el SAE ya muestra la sentencia. Destildá los que no quieras cambiar y tocá "Cambiar ESTADO a SENTENCIA".'] },
    { id: 'f-ivp', pregunta: '¿Cómo funcionan las cancelaciones por IVP?', claves: 'ivp cancelacion gmail etiqueta comunico cancelacion parcial regularizacion',
      texto: ['Todos los días (o con "Revisar IVP ahora") lee los mails de Gmail con la etiqueta IVP de los últimos 30 días: guarda el PDF, lo clasifica (total, parcial o regularizada), lo controla contra el MAESTRO y el SAE, y arma el "COMUNICO …" con el IVP unido.',
              'Los IVP impagos o poco claros van a revisión. Si hay embargo en el expediente, avisa para evaluar pedir el levantamiento y la devolución de fondos.'] },
    { id: 'f-errores', pregunta: '¿Qué hago si aparece "⚠ El motor tuvo N errores"?', claves: 'errores motor panel rojo falla instalarmotor',
      texto: ['Muestra los errores de los últimos 7 días. Si se repite, mandale una captura a Claude; el detalle está en la pestaña ERRORES de la planilla de control.',
              'Si dice "El motor todavía no está instalado", en Apps Script ejecutá una sola vez la función instalarMotor.'] }
  ]);

  agregar('escritos', 'escritos', [
    { id: 'e-nuevo', pregunta: '¿Cómo hago un escrito con un modelo?', claves: 'nuevo escrito modelo generar redactar manual',
      pasos: ['En "Modelo de escrito" buscá por palabra (cédula, oficio, bono, planilla…) y elegilo.', 'En "Expediente o deudor" elegí el juicio. La app consulta el SAE para el encabezado y la carátula.', 'Completá los datos, revisá "Así queda:" y subí el adjunto si lo pide.', 'Tocá "Generar escrito". Queda en Para firmar.'],
      nota: 'El MAESTRO se anota recién cuando lo marcás como presentado.' },
    { id: 'modelos-lista', pregunta: '¿Qué modelos de escritos hay?', claves: 'modelos lista cuales disponibles sellados',
      texto: ['Estos son los modelos cargados hoy, en orden alfabético:'] },
    { id: 'e-campos', pregunta: '¿Cómo completo los datos que van entre llaves {…}?', claves: 'datos campos llaves completar monto fecha cuit banco opciones',
      texto: ['En "Datos del escrito" cada campo dice a qué {…} del texto corresponde. Las fechas van dd/mm/aaaa y los montos como 15.500 o 85.870,33. Algunos se completan solos (demandado, CUIT) y otros calculan (aportes, total, saldo). En los desplegables, "Otro (escribirlo)" permite poner un valor que no está en la lista.',
              '"Así queda:" muestra el texto final en vivo o lo que falta completar.'] },
    { id: 'e-adjunto', pregunta: '¿Cómo adjunto un archivo al escrito?', claves: 'adjunto archivo pdf foto subir unir',
      texto: ['Si el modelo lleva adjunto, aparece su casilla: subí uno o varios PDF o fotos (hasta 10 archivos, 15 MB cada uno, 25 MB en total; las fotos grandes se achican). Se unen detrás del escrito en un solo PDF.',
              '"Unir la constancia de ARCA del mes" agrega la constancia de ARCA.',
              'Si la casilla dice "(optativo…)", el escrito se puede generar sin adjunto (por ejemplo, DOY CUMPLIMIENTO o SE NOTIFIQUE POR EDICTOS). Si subís el archivo, se une igual: sale un solo PDF completo para firmar.'] },
    { id: 'e-requisitos', pregunta: '¿Qué es "Antes de generar, confirmá"?', claves: 'requisitos confirmar antes de generar casillas inhibicion',
      texto: ['Algunos modelos piden controlar algo antes (por ejemplo, en la inhibición: que el informe del Registro Inmobiliario ya esté subido y que el de ARCA sea negativo de actividades). Hasta que no tildes todo, no se genera.'] },
    { id: 'e-variante', pregunta: '¿Qué es "Variante del texto"?', claves: 'variante texto parrafo alternativa estado deuda sin pagos pago parcial',
      texto: ['Algunos modelos tienen más de una versión del cuerpo (por ejemplo, COMUNICO ESTADO DE LA DEUDA: "Con pago parcial" o "Sin pagos"). Al elegir otra, se reemplaza el cuerpo; si lo habías editado, te pregunta antes.'] },
    { id: 'e-editar', pregunta: '¿Puedo cambiar el título o el texto de un escrito?', claves: 'editar cambiar texto titulo cuerpo volver al modelo pido sentencia',
      texto: ['Sí: el título y el cuerpo son editables (un renglón en blanco separa los párrafos). Los cambios valen solo para ese escrito; el modelo queda como está. "Volver al modelo" restaura el texto original y conserva los archivos subidos.',
              '"+ Pido sentencia" agrega el pedido de sentencia al título y al texto, y tilda ARCA.'],
      nota: 'Encabezado, carátula, comparecencia y cierre los pone el sistema.' },
    { id: 'e-encabezado', pregunta: '¿De dónde salen el encabezado (OGA, Juzgado) y la carátula?', claves: 'encabezado oga juzgado nominacion caratula',
      texto: ['Del juzgado y la carátula del SAE. Si el expediente no se encuentra en el SAE, el encabezado sale de la nominación del MAESTRO (OGA N° 1): revisalo en el PDF.'] },
    { id: 'e-motor', pregunta: '¿Puedo hacer a mano un pedido de sentencia o un comunico de IVP?', claves: 'manual pedido sentencia ivp comunico motor',
      texto: ['Sí: elegí "SOLICITO DICTADO DE SENTENCIA" o "COMUNICO CANCELACIÓN (IVP)". La app muestra qué haría el motor (pedir, reiterar, esperar, revisión) y, en el IVP, el IVP encontrado en Gmail. Si el motor no lo aconseja o ya hay un escrito esperando firma, te pregunta "¿Generar igual?".'] },
    { id: 'e-despues', pregunta: '¿Qué pasa después de "Generar escrito"?', claves: 'generado resultado pdf listo uniendo',
      texto: ['Aparece "✓ Escrito generado". Si lleva adjunto o ARCA, espera a que se unan (menos de un minuto) y después "Abrir PDF". El escrito queda en Para firmar; "Otro escrito" empieza uno nuevo.'] },
    { id: 'e-cuenta-dgr', pregunta: '¿Dónde copio los datos de la cuenta de la DGR para una transferencia?', claves: 'cuenta dgr cbu transferencia banco macro copiar fondos',
      texto: ['Al final de la pestaña Escritos, en "Cuenta de la DGR para transferencias": titular, CUIT, banco, número de cuenta y CBU.',
              '"Copiar para escrito" copia la frase de los escritos ("a la Cuenta … - CBU … del actor Provincia de Tucumán DGR…"); "Copiar datos (mail)" copia los datos en renglones; "Copiar CBU", solo el CBU.'] },
    { id: 'e-embargos', pregunta: '¿Cómo pido un embargo al ejecutar la sentencia?', claves: 'embargo ejecuto sentencia banco cuenta inmueble automotor vehiculo dominio matricula padron dnrpa registro',
      texto: ['Hay tres modelos: "EJECUTO SENTENCIA. PIDO EMBARGO" (sobre cuentas: elegí el banco en el desplegable; el monto sale solo del importe del juicio y se puede cambiar), "… PIDO EMBARGO SOBRE INMUEBLE" (matrícula y padrón; adjuntá el informe del Registro Inmobiliario y el dominial) y "… PIDO EMBARGO AUTOMOTOR" (marca, modelo, dominio, año y registro seccional; adjuntá la ficha de la DNRPA y el recibo del arancel).'] },
    { id: 'e-pagos-parciales', pregunta: '¿Cómo comunico un pago parcial o una cancelación con embargo?', claves: 'imputacion pago parcial actualizo ejecucion cancelacion levantamiento embargo devolucion fondos saldo',
      texto: ['"COMUNICO IMPUTACION. ACTUALIZO EJECUCION" tiene dos modelos: uno con embargo (monto imputado, fecha del pago, saldo y banco) y otro de pago parcial sin embargo (monto imputado, IVP y saldo). Adjuntá el IVP y la planilla.',
              'Si el contribuyente canceló y hay embargo: "COMUNICO CANCELACION. PIDO LEVANTAMIENTO DE EMBARGO Y DEVOLUCION DE FONDOS", con el IVP y el informe bancario del Colegio de Abogados. En "Variante del texto", "Con informe bancario" agrega la frase que lo acompaña.'] },
    { id: 'e-notificaciones', pregunta: '¿Qué modelos hay para cédulas, mandamientos y edictos?', claves: 'cedula nueva mandamiento juzgado paz edictos notifique publicacion devuelvo pido sentencia',
      texto: ['"SE LIBRE CEDULA" y "SE LIBRE NUEVA CEDULA" (al Juzgado de Paz que elijas), "SE LIBRE NUEVO MANDAMIENTO" (el juzgado que informó y el nuevo), "SE NOTIFIQUE POR EDICTOS" (domicilio y fecha de la notificación fallida) y "DEVUELVO PUBLICACION DE EDICTOS. PIDO SENTENCIA" (las fechas y los edictos los busca sola en el Boletín Oficial: ver la pregunta de los edictos).',
              'En todos, el texto del modelo viene cargado y lo podés editar antes de generar.'] },
    { id: 'e-edictos', pregunta: '¿Cómo devuelvo la publicación de edictos y pido sentencia?', claves: 'edictos boletin oficial publicacion primer ultimo dia quinto decimo devuelvo pido sentencia intimacion',
      texto: ['Elegí "DEVUELVO PUBLICACION DE EDICTOS. PIDO SENTENCIA" y el juicio. La app busca el expediente en el Boletín Oficial del Poder Judicial (edictos.justucuman.gov.ar), elige el edicto de la intimación de pago y completa sola el primer día, el último día y si es el quinto o el décimo.',
              'El primer y el último día se unen detrás del escrito, cada uno en una hoja como "Visualización de Edicto" (con la fecha de publicación y el enlace). No hace falta subir nada.',
              'Si el juicio tiene varios edictos (intimación, sentencia, planilla), elegí cuál en "Este juicio tiene … edictos". Los enlaces abren cada día en la página del Boletín para revisarlo.'],
      nota: 'Avisa si todavía se está publicando (por ejemplo, 3 de 5 días) o si el edicto no es de intimación. Si el Boletín no responde o no encuentra nada, completás las fechas y subís los edictos a mano, como antes; si subís archivos, van esos en lugar de los del Boletín.' },
    { id: 'e-oficios-cne-catastro', pregunta: '¿Cómo pido un oficio a la Cámara Nacional Electoral o a Catastro?', claves: 'cne camara nacional electoral juzgado electoral domicilio catastro colindantes numeracion oficial justicia',
      texto: ['"PIDO OFICIO A LA CNE" pide el domicilio del demandado a la Cámara Nacional Electoral (se encuentra buscando CNE, Cámara o Juzgado Electoral).',
              '"SE OFICIE A CATASTRO (INMUEBLES COLINDANTES)" se usa cuando el oficial de justicia informa que no hay numeración visible: pide a Catastro los datos de los inmuebles linderos del domicilio.'] },
    { id: 'e-prueba', pregunta: '¿Cómo ofrezco prueba en un cuaderno de prueba (documental o informativa)?', claves: 'ofrezco prueba documental informativa instrumental cuaderno a1 a2 excepciones apertura contestacion oficio expediente administrativo',
      texto: ['Elegí "OFREZCO PRUEBA DOCUMENTAL" u "OFREZCO PRUEBA INFORMATIVA" y el juicio. La app busca tu contestación de excepciones (primero en el Drive y si no en el SAE) y copia lo que ofreciste en la sección PRUEBAS: la instrumental o documental en uno, la informativa en el otro. Arriba dice de qué archivo lo copió.',
              'Si no la encuentra, queda el texto habitual (en la informativa, completás el expediente administrativo). En "Variante del texto" podés pasar de la copia al texto habitual.',
              'En "Cuaderno de prueba" elegí A1, A2…: va pegado al número (3624/26-A1) y en el nombre del archivo.'] },
    { id: 'e-doy-cumplimiento', pregunta: '¿Cómo hago un DOY CUMPLIMIENTO?', claves: 'doy cumplimiento demanda firmada en blanco libre',
      texto: ['Elegí "DOY CUMPLIMIENTO". En "Variante del texto" elegí "Acompaño demanda firmada" o "En blanco (lo escribís vos)" y escribí el cuerpo. El adjunto es optativo.'] },
    { id: 'e-nuevos-modelos', pregunta: '¿Cómo se agrega un modelo nuevo?', claves: 'agregar modelo nuevo carpeta drive sellar',
      texto: ['Subí el escrito en Word a la carpeta MODELOS PARA LA APP del Drive con tus observaciones y avisale a Claude. Se carga como modelo, lo revisás y, cuando lo sellás, aparece en la lista.', 'Si al elegirlo dice que el servidor todavía no tiene el modelo, falta actualizar el Apps Script (nueva versión).'] }
  ]);

  agregar('honorarios', 'honorarios', [
    { id: 'h-pin', pregunta: '¿Cómo funciona el PIN de Honorarios? ¿Qué hago si lo olvido?', claves: 'pin clave bloqueo olvide cambiar contraseña',
      texto: ['La primera vez creás un PIN de 4 a 8 números. Lo controla el servidor; no se guarda en el teléfono. Se bloquea tras 10 minutos sin uso o 2 minutos fuera de la app, y 5 intentos fallidos lo bloquean 15 minutos.',
              '"Cambiar PIN" pide el actual y el nuevo. Si lo olvidaste, ejecutá borrarPinHonorarios() en Apps Script y la app te pide crear uno nuevo.'],
      nota: 'Honorarios necesita conexión.' },
    { id: 'h-buscar', pregunta: '¿Cómo busco un juicio en Honorarios?', claves: 'buscar buscador honorarios expediente deudor cuit fila planilla abrir en honorarios',
      texto: ['Arriba de las tarjetas está "Buscar en HONORARIOS": escribí el expediente, parte del nombre o el CUIT, como en la pestaña Buscar (tolera errores de tipeo). Mientras hay texto, se ven las filas de la planilla en lugar de las tarjetas.',
              'Cada fila muestra si está pendiente o cobrada, el monto, el último movimiento, "Abrir en HONORARIOS ↗" (va directo a la fila) y "Ver juicio". Las filas sin saldo pendiente aparecen con su número de fila. Si no está, te ofrece agregarlo.',
              'Desde la pestaña Buscar también: al pie de los resultados está "Buscar … en Honorarios", y al abrir un juicio, el botón "Abrir en Honorarios". Si Honorarios está bloqueado, primero pide el PIN.'] },
    { id: 'h-registro', pregunta: '¿Cómo se completa solo el Registro de Honorarios de Fiscalía?', claves: 'registro honorarios fiscalia estado verificado expediente tramite mail gmail lunes verde presentacion 546',
      texto: ['Los lunes el sistema lee los mails de Fiscalía de Estado (fiscaliatucuman.gob.ar): "Tiene una respuesta a una presentación" (recibida y vinculada al expediente N° …) y "Registro de Honorarios de Abogados del Estado" (Trámite VERIFICADO). Para hacerlo en el momento: tarjeta "Registro de Honorarios (Fiscalía)" → "Revisar Gmail ahora".',
              'El mail no dice de qué juicio es. Se busca en el PDF de la nota que adjunta Fiscalía; si no, el formulario RH que armaste en la app esos días (si hay uno solo); si no, lo elegís vos con "Elegir juicio". "No es de honorarios" lo saca de la lista.',
              'En HONORARIOS anota el Nº en "N° EXPTE. REGISTRO DE HONORARIOS" y la fecha en "FECHA DE PRESENTACION", solo si la celda está vacía. Cuando Fiscalía lo da por VERIFICADO, pinta de verde la celda del Nº y la tarjeta queda verde. Si la celda ya tenía otro número, no la cambia y te avisa. Las notas quedan en la carpeta REGISTRO FISCALIA del Drive.'] },
    { id: 'h-etiqueta', pregunta: '¿Cómo creo la etiqueta de Gmail para los mails de Fiscalía?', claves: 'etiqueta gmail filtro fiscalia registro honorarios crear label',
      texto: ['En la computadora, en Gmail: tocá el ícono de opciones de la barra de búsqueda (las rayitas a la derecha). En "De" escribí fiscaliatucuman.gob.ar. En "Contiene las palabras" escribí: "Registro de Honorarios de Abogados del Estado" OR "respuesta a una presentación" (con las comillas).',
              'Tocá "Crear filtro". Marcá "Aplicar la etiqueta" → "Nueva etiqueta…" → REGISTRO HONORARIOS (exactamente así). Marcá también "Aplicar el filtro a las N conversaciones que coinciden" y tocá "Crear filtro".',
              'Listo: los mails nuevos y los viejos quedan en esa etiqueta. Mientras no exista, el sistema busca los mismos mails igual.'],
      nota: 'No marques "Omitir Recibidos" si querés seguir viéndolos en la bandeja.' },
    { id: 'h-tarjetas', pregunta: '¿Qué hay en la pestaña Honorarios?', claves: 'tarjetas honorarios por cobrar panel',
      texto: ['Arriba, el total por cobrar y el botón "Abrir HONORARIOS ↗". Siete tarjetas: Listado de la semana, Escritos y Formulario RH, Cobrado en el mes anterior, Tramitados, Para revisar, Agregar un juicio y Registro de Honorarios (Fiscalía).',
              'Toda escritura en HONORARIOS pide confirmación y el PIN.'] },
    { id: 'h-listado', pregunta: '¿Qué es el listado de la semana?', claves: 'listado semana semanal pendientes domingo prioridad',
      texto: ['Se arma solo el domingo a la noche (con PDF). Muestra los honorarios pendientes ordenados: cuotas que vencen, prioridad (fondos embargados, orden de pago, fechas anotadas) y el resto por monto. Salen de la lista solo cuando se cobran.',
              'Cada juicio dice el último movimiento y "→ Tu próximo paso", y tiene: Anotar, Reclamar, Cobro, Cuotas, Comprobante, Formulario RH, Escrito y Fila ↗. Se puede imprimir.'] },
    { id: 'h-anotar', pregunta: '¿Cómo anoto un trámite en HONORARIOS?', claves: 'anotar tramite pendiente honorarios linea',
      texto: ['En el juicio del listado, "Anotar": escribí el texto o usá un botón rápido (LE MANDÉ MSJ…, PIDO ORDEN DE PAGO, ACTUALIZO PLANILLA…, PIDO EMBARGO…). "Anotar en HONORARIOS" agrega "- fecha: TEXTO" en TRAMITE PENDIENTE.'] },
    { id: 'h-reclamar', pregunta: '¿Cómo le reclamo los honorarios a un deudor por WhatsApp o mail?', claves: 'reclamar whatsapp mail mensaje deudor cobrar',
      texto: ['"Reclamar" arma un mensaje con la carátula, el monto y tus datos para transferencia. Elegí WhatsApp, Mail o Copiar; después te ofrece anotarlo en HONORARIOS.', 'Primero cargá tus datos en "Datos para transferencia" (titular, CUIT, banco, cuenta, CBU, alias).'] },
    { id: 'h-cobro', pregunta: '¿Cómo registro un cobro?', claves: 'cobro cobrar pago fecha de pago factura transferencia',
      texto: ['"Cobro": fecha, modo de pago y factura o recibo (y el comprobante si querés). Completa FECHA DE PAGO, MODO y FACTURA, pinta la fila de amarillo y anota "PAGARON HONORARIOS: $…".'] },
    { id: 'h-cuotas', pregunta: '¿Cómo cargo un plan de pago en cuotas?', claves: 'cuotas plan de pago cuota',
      texto: ['"Cuotas": cantidad (2 a 36), monto de cada una y vencimiento de la primera. Después "Cobrar cuota" registra cada una; con la última la fila queda cobrada. Entre cuota y cuota el juicio sale del listado hasta la semana del próximo vencimiento.'] },
    { id: 'h-comprobante', pregunta: '¿Cómo adjunto una factura, recibo o carta de pago?', claves: 'comprobante factura recibo carta de pago adjuntar',
      texto: ['"Comprobante" → "Subir un archivo": elegí el tipo, el número (optativo) y el PDF o foto. La factura va a FACTURAS del año; el recibo y la carta, a COMPROBANTES DE PAGO. Queda como enlace en la columna AGREGAR FACTURA/CARTA DE PAGO.'] },
    { id: 'h-generar-comprobante', pregunta: '¿Cómo genero una carta de pago o un recibo?', claves: 'generar crear carta de pago recibo honorarios firma sello pdf aportes cuota',
      texto: ['En el listado de la semana, "Comprobante" → "Carta de pago" o "Recibo". Sale con el demandado, el expediente y la nominación de HONORARIOS; podés cambiar quién paga (y si es el Sr., la Sra. o una empresa), el CUIT o DNI, sumar otros expedientes del mismo deudor (19633/24; 7133/25) y cargar honorarios y aportes.',
              'Carta de pago: el texto de tus cartas. Con "Con montos" dice "cancelación total y definitiva… por un monto de…"; si paga otra persona, agrega "abona a cuenta y orden del juicio". Recibo: pago total, a cuenta o de una cuota, con el monto en letras y la fecha.',
              'Abajo ves "Así queda"; con "Editar el texto" lo cambiás solo para ese comprobante. Al generar (con confirmación) se arma el PDF con tu firma y sello escaneados, se guarda en COMPROBANTES DE PAGO y queda enlazado en la columna AGREGAR FACTURA/CARTA DE PAGO. Nunca pisa uno anterior.'] },
    { id: 'h-factura-arca', pregunta: '¿Cómo hago la factura de honorarios?', claves: 'factura arca afip emitir factura c monotributo comprobantes en linea',
      texto: ['"Comprobante" → "Factura (ARCA)": "Abrir ARCA" te lleva a la página para entrar con tu clave fiscal (la app no la pide ni la guarda). En "Comprobantes en línea" emití la Factura C (Concepto: Servicios).',
              'La app te muestra para copiar el receptor, el CUIT o DNI, el importe y tu texto para la descripción ("CANCELACION DE HONORARIOS PROFESIONALES… vs. [demandado]… DE LA [I°/II°] NOMINACION DEL CENTRO JUDICIAL [CAPITAL/CONCEPCION] POR EXPEDIENTE N° […]"). Las variables salen del juicio y las podés corregir arriba del texto; cada factura arranca de nuevo del modelo. "Copiar el texto" avisa si quedó algún [***] sin completar.',
              'Después, "Ya la emití: subir el PDF": queda en FACTURAS del año (entra en el control del reporte mensual) y enlazada en HONORARIOS.'] },
    { id: 'h-escritos', pregunta: '¿Cómo hago un escrito de honorarios (orden de pago, embargo, planilla, regulación)?', claves: 'escrito orden de pago embargo planilla regulacion honorarios',
      texto: ['En "Escritos y Formulario RH" buscá el juicio y tocá "Escrito". Hay: Solicito orden de pago, Pido embargo ejecutorio por honorarios, Actualizo planilla por honorarios y Solicito regulación de honorarios. Calcula los aportes del 10 % cuando corresponde (sin IVA: Monotributista desde el 03/11/2026). Quedan en Para firmar → Honorarios y otros.'] },
    { id: 'h-rh', pregunta: '¿Cómo genero el Formulario RH (Registro de Honorarios, Res. 546)?', claves: 'formulario rh registro honorarios 546 fiscalia declaracion jurada',
      texto: ['En "Escritos y Formulario RH" buscá el juicio y tocá "Formulario RH". Busca las sentencias en el SAE y el IVP en tu Gmail (hasta un minuto). Compará los textos con la sentencia y cargá vos el "Monto a percibir". Lo que está entre corchetes hay que completarlo.',
              '"Generar formulario con firma y sello" arma el PDF en la carpeta REGISTRO DE HONORARIOS del demandado, con el IVP y las sentencias.'],
      nota: 'Es una declaración jurada que sale con tu firma: revisalo siempre.' },
    { id: 'h-actualizar', pregunta: '¿Cómo anoto en el MAESTRO y en HONORARIOS lo que generé?', claves: 'generados esta semana actualizar planillas maestro honorarios',
      texto: ['En "Generados esta semana", el panel "¿Actualizar el MAESTRO y HONORARIOS?" trae el texto (editable) y dos casillas. "Actualizar planillas" agrega la línea con la fecha de hoy. Si ya lo anotaste en el MAESTRO desde acá, "Presentado" no lo repite.'] },
    { id: 'h-cobrado', pregunta: '¿Dónde veo lo cobrado en el mes y el control de facturas?', claves: 'cobrado mes reporte facturas control iva neto',
      texto: ['La tarjeta "Cobrado en <mes>" lista los cobros, el reporte en PDF (se genera solo el primer día hábil del mes) y el control de facturas de la carpeta FACTURAS: cobros sin factura, facturas sin cobro, montos que no coinciden.'] },
    { id: 'h-revisar', pregunta: '¿Qué es "Para revisar"?', claves: 'para revisar diferencias cruce maestro sae no corresponde',
      texto: ['Diferencias entre HONORARIOS, el MAESTRO y el SAE: filas repetidas, cobrados sin FECHA DE PAGO, movimientos que faltan, juicios que faltan en HONORARIOS, etc. Corregí la planilla y el aviso desaparece solo; si no corresponde, tocá "No corresponde". El cruce con el SAE se hace cada 7 días ("Consultar SAE ahora" lo corre en el momento).'] },
    { id: 'h-agregar', pregunta: '¿Cómo agrego a HONORARIOS un juicio que no está?', claves: 'agregar juicio fila nueva honorarios',
      texto: ['Tarjeta "Agregar un juicio": buscalo en el MAESTRO, cargá el monto (si lo sabés) y la primera línea del TRAMITE PENDIENTE, y tocá "Agregar a HONORARIOS". Se inserta una fila nueva en orden alfabético.'] }
  ]);

  agregar('tablero', 'tablero', [
    { id: 't-que', pregunta: '¿Qué muestra el Tablero?', claves: 'tablero graficos numeros estadisticas resumen',
      texto: ['Juicios según el MAESTRO: totales (en trámite, con sentencia, en ejecución, cancelados) y gráficos de los últimos 12 meses (escritos, movimientos, sentencias, ejecución, demandas), por estado y por año.',
              'Honorarios según la planilla: cobrado en el año y por mes, por cobrar, promedio y modo de pago. Esta parte se ve solo después de entrar con el PIN en Honorarios.'] },
    { id: 't-usar', pregunta: '¿Cómo veo el número exacto de un gráfico?', claves: 'grafico barra numero ver tabla',
      texto: ['Tocá una barra para ver su número, o "Ver tabla" debajo del gráfico.'] }
  ]);

  agregar('conexion', '', [
    { id: 'c-que', pregunta: '¿Qué puedo hacer sin conexión?', claves: 'sin conexion offline sin señal internet',
      texto: ['Buscar y ver las fichas con la copia guardada en el teléfono. En Agenda y Seguimientos podés agregar, editar, marcar y borrar. En Para firmar podés tildar y marcar "Presentado" o "Descartar".',
              'Esos cambios quedan en la cola ("⏳ N cambios hechos sin conexión") y se envían solos, en orden, al volver la señal.'] },
    { id: 'c-no', pregunta: '¿Qué necesita conexión?', claves: 'necesita conexion no funciona sin señal',
      texto: ['Ver en SAE, Detalle de deuda, Cambiar estado, Imprimir juntos, Analizar, la constancia de ARCA, abrir los PDF, la pestaña Escritos, Honorarios y los números de honorarios del Tablero.'] },
    { id: 'c-vuelve', pregunta: '¿Qué pasa cuando vuelve la señal?', claves: 'vuelve señal enviar cola cambios',
      texto: ['Se envían los cambios pendientes y aparece "Se enviaron N cambios hechos sin conexión". Si el servidor rechaza alguno, la app te muestra cuáles. Lo marcado como presentado se anota con la fecha en que lo marcaste.'] }
  ]);

  return { VISTAS: VISTAS, SECCIONES: SECCIONES, GUIA: GUIA, buscar: buscar, deSeccion: deSeccion,
           seccionDeVista: seccionDeVista, nombreSeccion: nombreSeccion, nombreVista: nombreVista, clave: clave };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Ayuda;
