/**
 * El «Exportar todo» de la vista Detalle: UN archivo con todas las señales
 * historizadas del catálogo (hoy cinco), en el rango ya elegido en la vista —
 * el mismo para las cinco, sin importar qué pestaña esté abierta. Ver la
 * cabecera de `DetalleActivo.jsx` y `GraficaComparada` sobre por qué estas
 * señales se tratan como un conjunto transversal a los activos y no como
 * contenido de una pestaña.
 *
 * ── POR QUÉ UN CSV Y NO UN .XLSX DE CINCO HOJAS (Plan 22 F1 · SEG-05) ──
 *
 * Hasta el 07-09-2026 esto era un libro de SheetJS, una hoja por señal. La
 * dependencia (`xlsx@0.18.5`, la rama publicada en npm) acumula avisos
 * conocidos —contaminación de prototipo, ReDoS— cuyo arreglo sólo existe en
 * las versiones que SheetJS distribuye fuera del registro. Aquí la superficie
 * real era mínima —el tablero sólo ESCRIBE hojas y los vectores conocidos son
 * de lectura— pero cualquier auditoría lo marca, y explicar cada vez por qué
 * un aviso alto «no aplica aquí» cuesta más que quitarlo.
 *
 * **Lo que NO cambió, y el plan daba por hecho que sí**: el arranque. Los
 * ~276 KB de `xlsx` ya viajaban en un trozo propio y diferido —esa regla de
 * `manualChunks` existía justo para eso—, así que `vendor` sigue en 206,85 KB
 * de su techo de 210 y `index` en 97,5. Lo que se ahorra es la descarga de
 * quien pulsa «Exportar todo», no la de quien abre el tablero. El Plan 22 §F1
 * lo contaba como «la mitad del alivio que COD-07 pedía»; medido el
 * 07-09-2026, ese alivio no estaba donde COD-07 lo necesita.
 *
 * ── POR QUÉ FORMATO LARGO, CON UNA COLUMNA `senal` ─────────────────
 *
 * Porque las cinco series NO comparten rejilla de instantes: el historiador
 * ajusta el intervalo real al servir cada una, y un tramo que falló en una
 * señal no falló necesariamente en las otras. Un CSV ancho —una columna por
 * señal— obligaría a alinear cinco ejes de tiempo distintos, y alinear es
 * decidir a qué instante «pertenece» una muestra que cayó entre dos. Esa
 * decisión inventa dato, que es exactamente lo que CLAUDE.md §2.4 prohíbe.
 * En formato largo cada muestra viaja con SU instante y no hay nada que
 * alinear; quien quiera la tabla ancha la hace con una tabla dinámica, que es
 * una decisión suya y no nuestra.
 *
 * Las filas van AGRUPADAS por señal, no entrelazadas por instante: es lo que
 * hacía el libro de cinco hojas y lo que deja el archivo legible a ojo sin
 * filtrar nada.
 *
 * ── LA UNIDAD ES COLUMNA, NO CABECERA ──────────────────────────────
 *
 * `datosACSV` (una sola señal) la pone en la cabecera —`valor (%)`—. Aquí
 * conviven bar, %, °C y V en la misma columna `valor`, así que la unidad
 * tiene que ir por fila o el archivo miente. Es la única diferencia de
 * columnas entre los dos exportadores, y es deliberada.
 *
 * Mismo criterio de pureza que `lib/exportar.js`: `armarCSVGeneral` y
 * `nombreArchivoGeneral` no tocan el DOM y son las piezas que se prueban. La
 * descarga la dispara `descargarCSV` de `exportar.js`, que ya existía — este
 * archivo no vuelve a montar un `<a download>`.
 */
import { AGREGADO } from "@shared/eva/comun/historia.js";

import { CRLF, celdaCSV, fechaArchivo, notaDeCobertura, notaDeProcedencia } from "./exportar.js";

/**
 * Las columnas del CSV general. `senal` primero porque es la que se usa para
 * filtrar; el resto en el mismo orden que `datosACSV`, para que abrir el
 * archivo general y el de una gráfica suelta no sorprenda a nadie.
 */
const COLUMNAS = ["senal", "instante_iso", "hora_local", "valor", "unidad"];

/**
 * Una línea `#` para la señal que no trajo NINGUNA muestra.
 *
 * ── POR QUÉ ESTO NO ES UN ADORNO ───────────────────────────────────
 *
 * En formato largo, una señal sin muestras simplemente no aparece: no hay
 * filas suyas y el archivo se lee como si nunca se hubiera pedido. El libro
 * de cinco hojas al menos dejaba una hoja vacía con su cabecera. Sin esta
 * nota, F1 habría cambiado un hueco visible por uno invisible — que es
 * peor que el problema que venía a resolver (CLAUDE.md §2.4).
 *
 * `motivo` es el de `leerSerie()`: «Señal desconocida», «no historizada»…
 * Cuando no lo hay, la señal sí se pidió y el historiador no devolvió nada,
 * y eso se dice tal cual en vez de suponer por qué.
 */
function notaDeSerieVacia(senal, motivo) {
  const porque = motivo
    ? ` Motivo: ${motivo}`
    : " El historiador no devolvió ninguna muestra para ese rango.";
  return celdaCSV(`# ${senal.corto}: sin datos en el rango pedido.${porque}`);
}

/**
 * El CSV con todas las señales, precedido de las notas que declaran lo que
 * NO trae. Pura: no dispara ninguna descarga ni toca el DOM.
 *
 * @param {{
 *   senal: {key:string, corto:string, unidad?:string},
 *   datos: {t:Date, valor:number}[],
 *   cobertura?: {tramos:number, tramosConDato:number, completa:boolean, desde:Date|null, hasta:Date|null}|null,
 *   motivo?: string|null,
 *   punto?: string|null,
 * }[]} series
 */
export function armarCSVGeneral(series, locale = "es-MX") {
  const lista = series ?? [];

  const notas = [];
  const filas = [];

  /*
   * ── LA PROCEDENCIA VA UNA VEZ, NO CINCO (Plan 24 F3 · `USO-09`) ──
   *
   * Las cinco señales de este archivo son de la MISMA máquina —es el catálogo
   * del tanque, y `NO_COMPARTEN` garantiza que un CSV nunca mezcla dos
   * instalaciones—, así que su punto de origen, su PLC y su agregado son los
   * mismos para todas. Repetir la cabecera cinco veces diría lo mismo cinco
   * veces; peor, invitaría a leer cada bloque como si pudiera venir de otro
   * sitio.
   *
   * Lo que SÍ es por señal es la cobertura, y eso ya se resolvió antes de esta
   * fase: cada nota lleva su `etiqueta` delante porque cinco notas seguidas sin
   * nombre no se pueden atribuir a nada.
   *
   * Se toma de la primera señal con punto conocido. Si ninguna lo trae, la nota
   * sale sin máquina en vez de con una adivinada.
   */
  const primeraConPunto = lista.find((s) => s.punto);
  if (primeraConPunto) {
    const cabecera = notaDeProcedencia({
      senal: primeraConPunto.senal,
      punto: primeraConPunto.punto,
      locale,
    });
    if (cabecera) notas.push(cabecera);
  }

  for (const { senal, datos, cobertura, motivo } of lista) {
    const muestras = datos ?? [];

    if (!muestras.length) notas.push(notaDeSerieVacia(senal, motivo ?? null));
    else {
      const nota = notaDeCobertura(cobertura ?? null, senal.corto, locale);
      if (nota) notas.push(nota);
    }

    for (const p of muestras) {
      filas.push([
        senal.corto,
        p.t.toISOString(),
        p.t.toLocaleString(locale),
        String(p.valor),
        senal.unidad ?? "",
      ]);
    }
  }

  const cuerpo = [COLUMNAS, ...filas].map((fila) => fila.map(celdaCSV).join(",")).join(CRLF);
  return notas.length ? notas.join(CRLF) + CRLF + cuerpo : cuerpo;
}

/**
 * "historico-general_2026-08-19T14-32_2026-08-20T14-32_promedio.csv"
 *
 * Lleva el agregado declarado por el mismo motivo que `nombreArchivo` en
 * `exportar.js`: lo que hay dentro son medias de intervalo, nunca lecturas
 * crudas, y en unos meses el nombre es lo único que queda para saberlo.
 *
 * El rango que nombra es el PEDIDO —no el de los datos que llegaron, como
 * hace `nombreArchivo`— porque aquí son cinco series con cinco extensiones
 * posibles y ninguna representa al archivo entero. Lo que de verdad llegó lo
 * dicen las notas de cobertura de dentro.
 */
export function nombreArchivoGeneral(rango) {
  const desde = fechaArchivo(rango.inicio);
  const hasta = fechaArchivo(rango.fin);
  return `historico-general_${desde}_${hasta}_${AGREGADO.toLowerCase()}.csv`;
}
