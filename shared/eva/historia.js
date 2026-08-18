/**
 * Mecánica del historiador para las señales de Demo EVA: **las reglas, no la
 * red**.
 *
 * Aquí no hay `fetch`. Este archivo dice qué agregado se pide, cómo se escribe
 * un intervalo, qué muestra se tira y cómo se reduce una serie a las cuatro
 * cifras que se pueden citar. Quién sale a buscarla es cosa de cada programa:
 * `Demo-EVA/data/historia.js` en el navegador, `backend/ia/herramientas.mjs`
 * en el puente, y `Demo-EVA/data/simulador.js` sin salir a ningún sitio.
 *
 * ── LAS DOS REGLAS QUE NO SE PUEDEN PERDER AL CRUZAR ───────────────
 *
 * Están medidas contra el servidor real (Plan 8 §1.3) y son la razón de que
 * esto viva en `shared/` en vez de repetirse en los dos lados:
 *
 * 1. **El punto histórico se nombra con `ac:`, igual que el de tiempo real.**
 *    La sintaxis `hda:\Configuration\…` que usaba el catálogo del tablero
 *    anterior responde 500 para este árbol, con las dos variantes de barra
 *    probadas. Por eso aquí el punto histórico se nombra con `pointName` y no
 *    hay un `historyPointName` aparte.
 *
 * 2. **Sólo cuatro de las ocho señales tienen serie propia.** A las otras tres
 *    el historiador les devuelve la curva de `STEMPERATURA_TANQUE` —idéntica
 *    hasta el último decimal, con dos agregados distintos— y no da error:
 *    responde `ok: true` con marcas de tiempo correctas.
 *
 * La segunda es la que hace peligroso compartir este archivo a medias. Un
 * asistente que se olvidara de la guarda no fallaría: contestaría, con
 * aplomo, la temperatura del tanque bajo el nombre «carga del motor». Por eso
 * `motivoSinSerie()` se pregunta ANTES de salir a la red, en los dos lados, y
 * la marca vive en el catálogo (`historizado`) y no en cada consulta.
 *
 * ── POR QUÉ EL RESUMEN SE CALCULA AQUÍ ─────────────────────────────
 *
 * `resumirSerie` existe por el asistente, pero se queda en `shared/` porque es
 * la misma reducción que hace una gráfica al rotular sus extremos. Y sobre
 * todo porque el mínimo, el máximo y la media son ARITMÉTICA, que es
 * exactamente lo que el prompt le prohíbe al modelo: devolverle 24 muestras
 * crudas y pedirle el mayor es pedirle que haga a ojo lo que aquí cuesta
 * cuatro líneas y no se equivoca nunca.
 */

/**
 * Agregado del servidor.
 *
 * `Average` sobre una rejilla regular es lo que quiere una tendencia. **No es
 * el `Interpolative` de Resonac** y no puede serlo: allí se leen contadores y
 * factores de OEE que hay que interpolar entre muestras; aquí las ocho señales
 * son magnitudes instantáneas y ninguna es acumulativa, así que promediar el
 * tramo es la lectura honesta de «cuánto valió durante esos minutos».
 */
export const AGREGADO = "Average";

/** Ventana por defecto: 6 h en 24 puntos (uno cada 15 min). */
export const VENTANA = { horas: 6, puntos: 24 };

/**
 * Tope de muestras que se pueden pedir de una vez.
 *
 * Es `maxUpstreamItems` del puente (`X-ICO-MAX-ITEM-COUNT`), y se repite aquí
 * como número porque `shared/` no puede leer la configuración del backend. Si
 * se pide más, el servidor recorta y devuelve una serie incompleta **sin
 * decirlo**: la gráfica saldría cortada por la derecha y el máximo de un día
 * sería el máximo de las primeras horas.
 */
export const MAX_PUNTOS = 100;

/** Segundos → `HH:MM:SS`, que es el formato de intervalo que espera ICONICS. */
export function intervaloHMS(segundos) {
  const s = Math.max(1, Math.round(segundos));
  const dos = (n) => String(n).padStart(2, "0");
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

/**
 * Motivo por el que una señal no tiene serie. Se devuelve en vez de lanzar
 * porque **no es un error**: es un hecho de la instalación que la interfaz —y
 * el asistente— tienen que poder explicar, y una excepción acabaría pintada
 * como «fallo al leer», que es otra cosa.
 */
export const SIN_SERIE = "El historiador no publica una serie propia de esta señal.";

/**
 * Muestras del servidor → `[{ t, valor }]`.
 *
 * Se descarta la muestra de mala calidad y la que no trae número. El
 * historiador rellena los huecos de la rejilla con muestras vacías, y sin este
 * filtro la serie bajaría a cero en cada tramo sin datos — que es justo la
 * lectura contraria a «aquí no se midió», y en un mínimo diario es la
 * diferencia entre «el tanque se vació» y «el historiador no guardó esa hora».
 */
export function normalizar(muestras) {
  if (!Array.isArray(muestras)) return [];

  return muestras
    .filter((m) => (m?.quality ?? 0) === 0 && Number.isFinite(Number(m?.value)))
    .map((m) => ({ t: new Date(m.timestamp), valor: Number(m.value) }))
    .filter((m) => !Number.isNaN(m.t.getTime()));
}

/** Redondeo que **conserva el hueco**: `Math.round(null)` vale 0, y ese 0 miente. */
const red = (v, decimales) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : +Number(v).toFixed(decimales);

/**
 * Reduce una serie a lo que se puede citar en una frase.
 *
 * Devuelve `null` con la serie vacía, y quien llama decide qué decir de eso.
 * Aquí no se inventa un resumen de cero muestras: un `{ minimo: 0, maximo: 0 }`
 * se lee como una instalación parada, no como un tramo sin registrar.
 *
 * El mínimo y el máximo van **con su marca de tiempo**. Sin ella, «el nivel
 * bajó al 12 %» no se puede contrastar con nada; con ella, quien lea la
 * respuesta puede ir a la gráfica y mirar ese momento.
 *
 * @param {{t: Date, valor: number}[]} datos  serie ya normalizada
 * @param {number} decimales                  los de la señal, del catálogo
 */
export function resumirSerie(datos, decimales = 1) {
  if (!Array.isArray(datos) || !datos.length) return null;

  let min = datos[0];
  let max = datos[0];
  let suma = 0;

  for (const d of datos) {
    if (d.valor < min.valor) min = d;
    if (d.valor > max.valor) max = d;
    suma += d.valor;
  }

  return {
    muestras: datos.length,
    minimo: red(min.valor, decimales),
    minimoEn: min.t.toISOString(),
    maximo: red(max.valor, decimales),
    maximoEn: max.t.toISOString(),
    promedio: red(suma / datos.length, decimales),
    primero: red(datos[0].valor, decimales),
    ultimo: red(datos[datos.length - 1].valor, decimales),
    desde: datos[0].t.toISOString(),
    hasta: datos[datos.length - 1].t.toISOString(),
  };
}
