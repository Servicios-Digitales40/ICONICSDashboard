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
 * historiador ajusta el intervalo real al pedirla (`shared/eva/historia.js`).
 * Nombrar el archivo con el primer y el último instante de `datos` describe
 * exactamente lo que contiene, no lo que se preguntó — la diferencia importa
 * el día que el historiador devuelva menos de lo pedido y nadie lo note
 * porque el nombre seguía diciendo el rango original.
 */
import { AGREGADO } from "@shared/eva/historia.js";

/** "Presión del tanque" → "presion-del-tanque". Sin acentos: un nombre de archivo no debe depender de que el sistema operativo los soporte bien. */
function slug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 2026-08-19T14:32 (hora LOCAL) → "2026-08-19T14-32": los ":" no son válidos en un nombre de archivo de Windows. */
function fechaArchivo(d) {
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
function celdaCSV(valor) {
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * El CSV de una serie: una fila por muestra, con el instante en dos formas
 * —ISO para que se pueda reimportar sin ambigüedad, y hora local para que se
 * lea igual que en la propia gráfica— y el valor, con la unidad en la
 * cabecera si el tag la declara.
 *
 * No lleva columna de calidad: `normalizar()` (`shared/eva/historia.js`) ya
 * descarta la muestra de mala calidad antes de que llegue aquí — no hay un
 * dato de calidad que exportar, sólo huecos que ya no están en el arreglo.
 */
export function datosACSV(senal, datos) {
  const cabecera = ["instante_iso", "hora_local", senal.unidad ? `valor (${senal.unidad})` : "valor"];
  const filas = (datos ?? []).map((p) => [
    p.t.toISOString(),
    p.t.toLocaleString("es-MX"),
    String(p.valor),
  ]);
  return [cabecera, ...filas].map((fila) => fila.map(celdaCSV).join(",")).join("\r\n");
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
      // eslint-disable-next-line no-console
      console.error("No se pudo exportar el PNG: este navegador no da contexto 2D de canvas.");
      return;
    }
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) descargarBlob(nombre, blob);
    }, "image/png");
  };
  img.onerror = () => {
    // eslint-disable-next-line no-console
    console.error("No se pudo exportar el PNG: la gráfica no se pudo rasterizar.");
  };
  img.src = url;
}
