/**
 * El .xlsx "exportar todo" de la vista Detalle: una hoja por cada señal
 * historizada del catálogo (hoy cinco), con el mismo rango de fechas ya
 * elegido en la vista — el mismo para las cinco, sin importar qué pestaña
 * esté abierta. Ver la cabecera de `DetalleActivo.jsx` y `GraficaComparada`
 * sobre por qué estas señales se tratan como un conjunto transversal a los
 * activos y no como contenido de una pestaña.
 *
 * Mismo criterio de pureza que `lib/exportar.js`: `armarLibro` y
 * `nombreArchivoGeneral` no tocan el DOM y son las piezas que se prueban.
 * `descargarLibro` dispara la escritura real (`XLSX.writeFile`, que crea su
 * propio `<a download>` internamente) y no se prueba en jsdom, por el mismo
 * motivo que `descargarCSV`/`descargarPNG` tampoco se prueban ahí.
 */
import * as XLSX from "xlsx";

/** Cabecera + filas de una hoja: mismas tres columnas que `datosACSV`, para que abrir el .xlsx y el .csv de una misma señal no sorprenda a nadie. */
function filasDeHoja(senal, datos) {
  const cabecera = ["instante_iso", "hora_local", senal.unidad ? `valor (${senal.unidad})` : "valor"];
  const filas = (datos ?? []).map((p) => [p.t.toISOString(), p.t.toLocaleString("es-MX"), p.valor]);
  return [cabecera, ...filas];
}

/** "Presión relativa" → "Presion relativa", recortado a 31 caracteres: el límite duro de Excel para nombres de hoja, que tampoco admite : \ / ? * [ ]. */
function nombreHoja(senal) {
  const limpio = senal.corto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[:\\/?*[\]]/g, "");
  return limpio.slice(0, 31);
}

/**
 * El workbook de SheetJS con una hoja por señal. Pura: no dispara ninguna
 * descarga ni toca el DOM.
 *
 * @param {{senal: {key:string, corto:string, unidad:string}, datos: {t:Date, valor:number}[]}[]} hojas
 */
export function armarLibro(hojas) {
  const wb = XLSX.utils.book_new();
  for (const { senal, datos } of hojas) {
    const ws = XLSX.utils.aoa_to_sheet(filasDeHoja(senal, datos));
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja(senal));
  }
  return wb;
}

/** 2026-08-19T14:32 (hora LOCAL) → "2026-08-19T14-32": los ":" no son válidos en un nombre de archivo de Windows. Mismo formato que `lib/exportar.js`. */
function fechaArchivo(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/** "excel-general-historico_2026-08-19T14-32_2026-08-20T14-32.xlsx" */
export function nombreArchivoGeneral(rango) {
  return `excel-general-historico_${fechaArchivo(rango.inicio)}_${fechaArchivo(rango.fin)}.xlsx`;
}

/** Dispara la descarga real del libro. No es pura — ver la cabecera del archivo. */
export function descargarLibro(wb, nombre) {
  XLSX.writeFile(wb, nombre);
}
