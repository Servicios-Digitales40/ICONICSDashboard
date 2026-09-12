/**
 * Llevarse una gráfica del historiador: el CSV de sus muestras, o su imagen.
 *
 * ── QUÉ ES PURO Y QUÉ NO, Y POR QUÉ IMPORTA AQUÍ ────────────────────
 *
 * `nombreArchivo`, `datosACSV` y `prepararSvgParaExportar` no tocan el DOM
 * real ni disparan una descarga: reciben datos y devuelven texto. Son las
 * únicas tres piezas que estas pruebas pueden comprobar de verdad —
 * `descargarCSV` y `descargarPNG` orquestan `Blob`, `<a download>` y
 * `canvas.toBlob()`, y **jsdom no implementa canvas**: `getContext("2d")`
 * devuelve `null` y `toBlob()` nunca llama a su callback (comprobado antes
 * de escribir esto — un `await` sobre ese callback cuelga la prueba para
 * siempre, no falla). El plan original de esta fase pedía «una prueba de
 * humo del PNG, que se produzca un blob no vacío»: no se puede, y llevarla a
 * cabo tal cual habría dejado la suite colgada en CI. Lo que SÍ se prueba es
 * el SVG ya preparado —el `<rect>` de fondo, el título dibujado dentro— que
 * es todo lo que un fallo de canvas en pantalla no puede esconder.
 *
 * ── POR QUÉ EL NOMBRE DEL ARCHIVO SALE DE LOS DATOS, NO DEL RANGO PEDIDO ──
 *
 * `DetalleActivo` guarda el preset elegido (`"ayer"`, `{horas,puntos}`…),
 * pero lo que hay DENTRO del archivo es la serie que de verdad llegó, y el
 * historiador ajusta el intervalo real al pedirla (`shared/eva/comun/historia.js`).
 * Nombrar el archivo con el primer y el último instante de `datos` describe
 * exactamente lo que contiene, no lo que se preguntó — la diferencia importa
 * el día que el historiador devuelva menos de lo pedido y nadie lo note
 * porque el nombre seguía diciendo el rango original.
 */
import { AGREGADO } from "@shared/eva/comun/historia.js";
import { procedenciaDe } from "@shared/eva/comun/procedencia.js";

/** "Presión del tanque" → "presion-del-tanque". Sin acentos: un nombre de archivo no debe depender de que el sistema operativo los soporte bien. */
function slug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 2026-08-19T14:32 (hora LOCAL) → "2026-08-19T14-32": los ":" no son válidos
 * en un nombre de archivo de Windows.
 *
 * Exportada porque `exportarTodo.js` nombra su archivo con la misma regla:
 * hasta el Plan 22 F1 esta función estaba copiada allí palabra por palabra
 * —dos ficheros con el mismo formato de fecha y ninguna prueba que notara si
 * uno de los dos cambiaba—, que es justo la divergencia que CLAUDE.md §4.2
 * describe.
 */
export function fechaArchivo(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/**
 * Nombre del archivo exportado, con el agregado declarado: lo que hay dentro
 * son medias de intervalo (`AGREGADO` de `historia.js`), nunca lecturas
 * crudas, y el nombre tiene que decirlo o nadie lo sabrá interpretar en unos
 * meses.
 *
 * @param {{corto:string}} senal
 * @param {{t:Date}[]} datos
 * @param {"csv"|"png"} extension
 */
export function nombreArchivo(senal, datos, extension) {
  const base = slug(senal.corto);
  if (!datos?.length) return `${base}.${extension}`;

  const desde = fechaArchivo(datos[0].t);
  const hasta = fechaArchivo(datos[datos.length - 1].t);
  return `${base}_${desde}_${hasta}_${AGREGADO.toLowerCase()}.${extension}`;
}

/** Envuelve en comillas sólo si hace falta — un CSV con comillas de más en cada celda es más difícil de leer a ojo. */
export function celdaCSV(valor) {
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * El CSV de una serie: una fila por muestra, con el instante en dos formas
 * —ISO para que se pueda reimportar sin ambigüedad, y hora local para que se
 * lea igual que en la propia gráfica— y el valor, con la unidad en la
 * cabecera si el tag la declara.
 *
 * No lleva columna de calidad: `normalizar()` (`shared/eva/comun/historia.js`) ya
 * descarta la muestra de mala calidad antes de que llegue aquí — no hay un
 * dato de calidad que exportar, sólo huecos que ya no están en el arreglo.
 *
 * `locale` es del idioma ACTIVO del tablero (`useFormato().locale`), no de
 * `es-MX` fijo: quien exporta en inglés espera fechas en inglés. El valor por
 * defecto sólo existe para no romper una llamada sin ese argumento —esta
 * función es pura y no puede leer `i18n` por su cuenta—; quien la invoca
 * desde una vista SIEMPRE pasa el suyo.
 */
/** Fin de línea de CSV: Windows/Excel lo esperan así. */
export const CRLF = "\r\n";

export function datosACSV(senal, datos, cobertura = null, locale = "es-MX", punto = null) {
  const cabecera = ["instante_iso", "hora_local", senal.unidad ? `valor (${senal.unidad})` : "valor"];
  const filas = (datos ?? []).map((p) => [
    p.t.toISOString(),
    p.t.toLocaleString(locale),
    String(p.valor),
  ]);

  const cuerpo = [cabecera, ...filas].map((fila) => fila.map(celdaCSV).join(",")).join(CRLF);

  /*
   * Orden de las notas: procedencia primero, cobertura después. La procedencia
   * dice DE DÓNDE salió el archivo y la cobertura QUÉ LE FALTA, así que se leen
   * en ese orden — igual que el `accion` de F2 va después del detalle.
   *
   * `punto` es el último parámetro y opcional para no romper las llamadas que
   * ya existían: sin él la nota sale sin máquina, que es exactamente lo que
   * `procedenciaDe()` hace cuando no puede identificarla, y nunca una máquina
   * adivinada.
   */
  const notas = [
    notaDeProcedencia({ senal, punto, locale }),
    notaDeCobertura(cobertura, null, locale),
  ].filter(Boolean);

  return notas.length ? notas.join(CRLF) + CRLF + cuerpo : cuerpo;
}

/**
 * Una linea de comentario `#` con la cobertura real, delante de la cabecera.
 *
 * -- POR QUE VA DENTRO DEL ARCHIVO ----------------------------------
 *
 * Porque el CSV se abre meses despues, fuera de la aplicacion, y sin esto no
 * hay forma de distinguir <<la planta estuvo parada esos dias>> de <<la
 * consulta se quedo corta>>. Es la misma distincion que el asistente declara
 * con su `avisoCobertura`: un archivo con cinco dias de los diez pedidos no
 * es un archivo completo ni uno roto, y solo quien lo genero lo sabe.
 *
 * Va como `#` para que Excel y pandas la traten como comentario o como una
 * fila suelta, nunca como parte de la cabecera.
 *
 * `etiqueta` es para el CSV general (`exportarTodo.js`), donde conviven cinco
 * señales y cada una tiene SU cobertura: sin el nombre delante, cinco notas
 * seguidas no se pueden atribuir a nada. En el CSV de una sola gráfica no hay
 * ambigüedad que resolver y por eso el valor por defecto es no ponerla.
 *
 * @param {{tramos:number, tramosConDato:number, completa:boolean, desde:Date|null, hasta:Date|null}|null} cobertura
 * @param {string|null} [etiqueta]
 */
export function notaDeCobertura(cobertura, etiqueta = null, locale = "es-MX") {
  if (!cobertura || cobertura.completa) return null;

  const { tramos, tramosConDato, desde, hasta } = cobertura;
  const sinDato = tramos - tramosConDato;
  const quien = etiqueta ? `${etiqueta}: ` : "";
  const cuando =
    desde && hasta
      ? ` Los datos van del ${desde.toLocaleDateString(locale)} al ${hasta.toLocaleDateString(locale)}.`
      : "";

  return celdaCSV(
    `# ${quien}${sinDato} de los ${tramos} tramos del rango pedido no tienen registro en el historiador.${cuando}`
  );
}


/**
 * La PROCEDENCIA del archivo, en líneas de comentario delante de todo
 * (Plan 24 F3 · `USO-09`).
 *
 * ── POR QUÉ UN CSV TIENE QUE PODER DEFENDERSE SOLO ─────────────────
 *
 * Porque se abre meses después, en otra máquina, fuera de esta aplicación y
 * por alguien que no recuerda de qué pantalla salió. Hasta ahora el archivo
 * decía QUÉ señal y en qué rango —en su nombre— pero no de qué máquina, de qué
 * PLC, ni con qué agregado del historiador. Con dos instalaciones que no se
 * pueden mezclar (`NO_COMPARTEN`), «presion-del-tanque_…csv» en el escritorio
 * de alguien no basta para saber a qué planta pertenece.
 *
 * Sale de `procedenciaDe()` y no se recompone aquí: es el mismo dominio que
 * pinta el panel de F1, así que el archivo y la pantalla no pueden discrepar.
 * Si mañana cambia la ruta del historiador de una máquina, los dos lo heredan.
 *
 * ── POR QUÉ `#` Y NO UNA CABECERA DE COLUMNAS ──────────────────────
 *
 * Mismo criterio que `notaDeCobertura`, y por el mismo motivo: Excel y pandas
 * tratan `#` como comentario o como fila suelta, nunca como parte de la
 * cabecera. Meter la procedencia en columnas obligaría a repetirla en cada
 * fila o a romper la rejilla del CSV.
 */
export function notaDeProcedencia({ senal, punto = null, locale = "es-MX" } = {}) {
  const p = procedenciaDe({ senal, punto });
  if (!p) return null;

  const lineas = [];

  /* El tag entero: es lo que permite ir a ICONICS a comprobar el punto. */
  if (p.punto) lineas.push(`# punto: ${p.punto}`);

  /*
   * Máquina y PLC juntos, como en el panel: son el mismo hecho visto de dos
   * formas, y es la línea que impide confundir dos instalaciones.
   */
  if (p.sistema) {
    lineas.push(`# maquina: ${p.sistema.nombre} (${p.sistema.plc})`);
  }

  if (p.serie.historizada && p.serie.agregado) {
    lineas.push(`# agregado: ${p.serie.agregado}${p.serie.ruta ? ` via ${p.serie.ruta}` : ""}`);
  }

  /*
   * Cuándo se exportó, no cuándo se midió: el rango de las muestras ya va en
   * el nombre del archivo y en sus propias filas. Esto fecha el ACTO de
   * exportar, que es lo que falta para reconstruir de dónde salió el archivo.
   */
  lineas.push(`# exportado: ${new Date().toLocaleString(locale)}`);

  return lineas.map(celdaCSV).join(CRLF);
}

/** BOM UTF-8: sin él, Excel en español abre el CSV interpretando los acentos como otra cosa. */
const BOM_UTF8 = "﻿";

/** Dispara la descarga de un CSV ya generado. Efecto puro y simple: crea el enlace, lo pulsa, lo suelta. */
export function descargarCSV(nombre, contenidoCSV) {
  const blob = new Blob([BOM_UTF8 + contenidoCSV], { type: "text/csv;charset=utf-8" });
  descargarBlob(nombre, blob);
}

function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Clona el `<svg>` de la gráfica y le añade lo que un `<canvas>` no hereda
 * solo: un fondo sólido (el SVG no tiene, y un PNG "transparente" se ve
 * ilegible sobre un fondo oscuro si alguien lo pega en un documento claro) y
 * un título dibujado DENTRO de la imagen — pegada en un correo o un parte,
 * la imagen viaja sin su nombre de archivo, así que el título es la única
 * procedencia que le queda.
 *
 * Devuelve la cadena XML del SVG ya preparado, lista para envolver en un
 * `data:` URI. No toca el DOM real: opera sobre un clon.
 *
 * @param {SVGSVGElement} svg
 * @param {{titulo:string, fondo:string}} opciones
 */
export function prepararSvgParaExportar(svg, { titulo, fondo }) {
  const clon = svg.cloneNode(true);
  const ns = "http://www.w3.org/2000/svg";

  const ancho = Number(svg.getAttribute("width")) || svg.viewBox?.baseVal?.width || 400;
  const alto = Number(svg.getAttribute("height")) || svg.viewBox?.baseVal?.height || 200;
  const altoTitulo = 26;

  clon.setAttribute("width", ancho);
  clon.setAttribute("height", alto + altoTitulo);
  clon.setAttribute("viewBox", `0 0 ${ancho} ${alto + altoTitulo}`);

  const fondoRect = document.createElementNS(ns, "rect");
  fondoRect.setAttribute("x", "0");
  fondoRect.setAttribute("y", "0");
  fondoRect.setAttribute("width", String(ancho));
  fondoRect.setAttribute("height", String(alto + altoTitulo));
  fondoRect.setAttribute("fill", fondo);
  clon.insertBefore(fondoRect, clon.firstChild);

  // El contenido original de la gráfica se desplaza hacia abajo para dejar
  // sitio al título, en vez de dibujar el título encima y arriesgar que se
  // superponga con el primer trazo de la serie. `Array.from` primero: mover
  // nodos con `appendChild` reordena `childNodes` en vivo bajo el propio bucle.
  const hijosOriginales = Array.from(clon.childNodes).slice(1);
  const grupoOriginal = document.createElementNS(ns, "g");
  grupoOriginal.setAttribute("transform", `translate(0, ${altoTitulo})`);
  for (const nodo of hijosOriginales) grupoOriginal.appendChild(nodo);
  clon.appendChild(grupoOriginal);

  const texto = document.createElementNS(ns, "text");
  texto.setAttribute("x", "12");
  texto.setAttribute("y", "18");
  texto.setAttribute("font-family", "'IBM Plex Mono', monospace");
  texto.setAttribute("font-size", "13");
  texto.setAttribute("font-weight", "600");
  texto.setAttribute("fill", "#5F6981");
  texto.textContent = titulo;
  clon.appendChild(texto);

  return new XMLSerializer().serializeToString(clon);
}

/**
 * Descarga la gráfica como PNG.
 *
 * No es una función pura ni se prueba a fondo — ver la cabecera del
 * archivo—: serializa el SVG (`prepararSvgParaExportar`, eso sí probado),
 * lo pinta en un `<canvas>` vía `Image`, y descarga el resultado. Si el
 * navegador no puede rasterizar el SVG (CSP inusual, canvas bloqueado),
 * `onerror` avisa por consola en vez de dejar un clic sin efecto y sin
 * explicación.
 *
 * @param {SVGSVGElement} svg
 * @param {string} nombre
 * @param {{titulo:string, fondo:string}} opciones
 */
export function descargarPNG(svg, nombre, opciones) {
  const xml = prepararSvgParaExportar(svg, opciones);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("No se pudo exportar el PNG: este navegador no da contexto 2D de canvas.");
      return;
    }
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) descargarBlob(nombre, blob);
    }, "image/png");
  };
  img.onerror = () => {
    console.error("No se pudo exportar el PNG: la gráfica no se pudo rasterizar.");
  };
  img.src = url;
}
