/**
 * Mecánica de lectura del historiador (Hyper Historian), sin nada de red.
 *
 * Son las reglas que costó descubrir contra el servidor real y que cualquiera
 * que lea historia tiene que respetar: qué agregado, qué rango, cómo se
 * formatean las fechas y cómo se reduce cada tipo de tag. Están aquí, y no en
 * el transporte del frontend, porque las usan dos consumidores:
 *
 *  - `react-dashboard` — el comparativo del detalle de máquina.
 *  - `backend/ia` — las herramientas que consulta el modelo de lenguaje.
 *
 * Duplicarlas era la alternativa, y divergirían: es la misma lección que el
 * backend aprendió con `request()` en `iconics/client.mjs`.
 *
 * Todo lo de este archivo es JavaScript puro —sin `fetch`, sin
 * `import.meta.env`, sin DOM— para que Node lo importe tal cual.
 *
 * La justificación medida de cada regla está en docs/TAGS.md, § «Lectura del
 * histórico».
 */

/**
 * Agregado del historiador.
 *
 * Se usa `Interpolative` y no `Average` porque `Average` devuelve 500 en los
 * tags que pueden traer `Infinity` (`OEE_Cal` y `OEE`): el servidor no
 * protege la división y promediar un bucket con un infinito dentro rompe el
 * cálculo. `Interpolative` toma el valor interpolado en cada bucket y
 * funciona sobre los siete tags.
 */
export const AGREGADO = { serie: "Interpolative" };

/**
 * Intervalo de agregación en formato TimeSpan de .NET (`01:00:00` = 1 hora).
 *
 * Este servidor rechaza la forma de más de un día (`1.00:00:00`) y los rangos
 * multi-día fallan de forma intermitente, así que la historia se pide día a día.
 */
export const INTERVALO = { hora: "01:00:00" };

/** Factores del OEE. Una serie de 24 puntos por día y tag. */
export const TAGS_FACTOR = ["disponibilidad", "rendimiento", "calidad", "oee"];

/**
 * Contadores. Su total del día se obtiene con `totalDelDia()`, sumando los
 * incrementos de cada tramo — **no** leyendo el último punto de la serie, que
 * son solo las piezas del último turno.
 */
export const TAGS_CIERRE = ["aprobadas", "rechazadas", "tMuerto"];

/** Todo lo que se pide por día. Una petición por tag, 24 puntos cada una. */
export const TAGS_DIA = [...TAGS_FACTOR, ...TAGS_CIERRE];

/*
 * Fechas.
 *
 * La API espera marcas de tiempo con desplazamiento horario explícito
 * (`2026-07-30T00:00:00-06:00`). En UTC se movería la frontera del día y el
 * rango devolvería las últimas horas del día anterior.
 */

/** Desplazamiento local en formato ±HH:MM. */
export function desplazamiento(d) {
  const min = -d.getTimezoneOffset();
  const signo = min >= 0 ? "+" : "-";
  const abs = Math.abs(min);
  return `${signo}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Date → "YYYY-MM-DD" del día local (no UTC, para no adelantar el día de noche). */
export function isoLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Date local → `2026-07-30T00:00:00-06:00`. */
export function marcaLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${desplazamiento(d)}`
  );
}

/** Rango [00:00, 24:00) del día local `iso` ("YYYY-MM-DD"). */
export function rangoDelDia(iso) {
  const inicio = new Date(`${iso}T00:00:00`);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { startDate: marcaLocal(inicio), endDate: marcaLocal(fin) };
}

/** Rango [00:00 de `isoDesde`, 24:00 de `isoHasta`). */
export function rangoDeDias(isoDesde, isoHasta) {
  return { startDate: rangoDelDia(isoDesde).startDate, endDate: rangoDelDia(isoHasta).endDate };
}

/**
 * Total del día de un contador, sumando sus incrementos.
 *
 * No sirve tomar el último valor: los contadores del PLC se reinician con el
 * cambio de turno, así que el último valor son las piezas del turno y no las
 * del día. Sumando solo los saltos positivos, cada reinicio cuenta como el
 * final de un tramo y no como una pérdida de producción.
 *
 * Al apoyarse en la rejilla horaria, un reinicio y una subida dentro de la
 * misma hora cuentan como uno solo: el resultado es una cota inferior.
 */
export function totalDelDia(muestras) {
  const nums = muestras.map((m) => m.value).filter((v) => Number.isFinite(v));
  if (!nums.length) return null;

  let total = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const salto = nums[i] - nums[i - 1];
    if (salto > 0) total += salto;
    else if (salto < 0) total += nums[i];   // reinicio: el tramo nuevo aporta desde su propio valor
  }
  return total;
}

/** ¿Cae la marca de tiempo dentro de `[desde, hasta)` en horas locales? */
function enVentana(ts, desde, hasta) {
  const h = new Date(ts).getHours()
  // Un turno de noche cruza la medianoche: 22→6 significa «22:00 o antes de
  // las 6:00», no un rango vacío.
  return desde <= hasta ? h >= desde && h < hasta : h >= desde || h < hasta
}

/** Filas horarias que caen dentro de la ventana. */
export function filasEnVentana(filas, desde, hasta) {
  if (desde === 0 && hasta >= 24) return filas
  return filas.filter(f => enVentana(f.ts, desde, hasta))
}

/**
 * Cuánto SUBIÓ un contador dentro de una ventana.
 *
 * No es `totalDelDia` recortado, y la diferencia importa. El total del día
 * incluye el valor con el que arranca la serie —lo acumulado hasta entonces—
 * porque a las 00:00 el contador ya trae lo que lleve el turno de noche. En
 * una ventana que empieza a las 12:00 ese valor inicial es producción de
 * antes, y contarlo triplicaría la cifra de la tarde.
 *
 * Así que aquí solo se suman los incrementos. Un reinicio dentro de la
 * ventana aporta desde su propio valor, igual que en el total del día.
 */
export function incrementoEnVentana(muestras, desde, hasta) {
  const nums = muestras
    .filter(m => enVentana(m.timestamp, desde, hasta))
    .map(m => m.value)
    .filter(v => Number.isFinite(v))

  if (nums.length < 2) return null

  let total = 0
  for (let i = 1; i < nums.length; i++) {
    const salto = nums[i] - nums[i - 1]
    total += salto > 0 ? salto : nums[i]
  }
  return total
}

/**
 * Corta la serie en la hora actual cuando el día pedido es el de hoy.
 *
 * `Interpolative` rellena todos los buckets del rango repitiendo el último
 * valor conocido, también los que aún no han ocurrido. En un día en curso eso
 * dibuja una recta hasta medianoche que no ha pasado y arrastra las medias.
 * En un día pasado la meseta final sí es información, así que no se recorta.
 */
export function recortarAlPresente(filas, iso) {
  const ahora = new Date();
  if (iso !== isoLocal(ahora)) return filas;
  return filas.filter((f) => new Date(f.ts) <= ahora);
}

/**
 * Une las series de varios tags en filas, emparejando por marca de tiempo
 * y no por posición.
 *
 * Si un tag se queda sin muestra en una hora concreta, el emparejado
 * posicional desplazaría el resto de su serie y compararía horas distintas
 * sin avisar. Emparejando por marca, el hueco queda como `null`.
 */
export function unir(porTag, tags) {
  const rejilla = [];
  const vistos = new Set();
  for (const tag of tags) {
    for (const m of porTag[tag] ?? []) {
      const clave = String(m.timestamp);
      if (!vistos.has(clave)) {
        vistos.add(clave);
        rejilla.push(m.timestamp);
      }
    }
  }
  rejilla.sort((a, b) => new Date(a) - new Date(b));

  const indices = Object.fromEntries(
    tags.map((tag) => [tag, new Map((porTag[tag] ?? []).map((m) => [String(m.timestamp), m.value]))])
  );

  return rejilla.map((ts) => {
    const fila = {
      t: new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      ts,
    };
    for (const tag of tags) fila[tag] = indices[tag].get(String(ts)) ?? null;
    return fila;
  });
}
