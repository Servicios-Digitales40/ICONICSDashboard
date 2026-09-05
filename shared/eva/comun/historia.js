/**
 * Mecánica del historiador para las señales de Demo EVA: **las reglas, no la
 * red**.
 *
 * Aquí no hay `fetch`. Este archivo dice qué agregado se pide, cómo se escribe
 * un intervalo, qué muestra se tira y cómo se reduce una serie a las cuatro
 * cifras que se pueden citar. Quién sale a buscarla es cosa de cada programa:
 * `Demo-EVA/data/historia.js` en el navegador, `backend/ia/conversacion/herramientas.mjs`
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
 * 2. **Sólo algunas señales tienen serie propia.** A las demás el historiador
 *    les devuelve la curva de `STEMPERATURA_TANQUE` —idéntica hasta el último
 *    decimal, con dos agregados distintos— y no da error: responde `ok: true`
 *    con marcas de tiempo correctas.
 *
 *    Cuáles son vive en el catálogo (`historizado`), no en este texto: la
 *    lista cambia según lo que se configure en el Data Historian. Eran cuatro
 *    hasta el 24-08-2026, cuando `tensionLinea` pasó a servir la suya.
 *
 * La segunda es la que hace peligroso compartir este archivo a medias. Un
 * asistente que se olvidara de la guarda no fallaría: contestaría, con
 * aplomo, la temperatura del tanque bajo el nombre «carga del motor». Por eso
 * `motivoSinSerie()` se pregunta ANTES de salir a la red, en los dos lados, y
 * la marca vive en el catálogo (`historizado`) y no en cada consulta.
 *
 * 3. **Sin `aggregate`, un rango vacío no vuelve vacío: vuelve la muestra
 *    LÍMITE del historiador entero, sin importar cuán lejos esté del rango
 *    pedido.** Medido el 26-08-2026: pedir `SNIVEL_TANQUE` sin agregar para
 *    el 14-ago, el 17-ago o incluso el año 2020 devuelve LA MISMA muestra
 *    —`2026-08-18T18:54:21.491Z`, que resultó ser la primera del
 *    historiador entero para esa señal— con `ok: true` y sin ningún aviso
 *    de que está fuera del rango pedido. Con `aggregate: 'Average'` el
 *    mismo rango vacío sí devuelve `data: []`, limpio. Por eso este
 *    proyecto entero pide SIEMPRE agregado (ver el resto del archivo) y
 *    nunca lectura cruda para construir una serie: una lectura cruda que
 *    alguna vez se necesite tiene que comprobar el `timestamp` de cada
 *    muestra contra el rango pedido antes de darla por buena, porque el
 *    servidor no lo hace.
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
 * Techo de muestras POR PÁGINA del servidor — `maxUpstreamItems` del puente
 * (`X-ICO-MAX-ITEM-COUNT`), repetido aquí como número porque `shared/` no
 * puede leer la configuración del backend.
 *
 * ── YA NO ES "EL TOPE DEL SERVIDOR": ES EL TAMAÑO DE PÁGINA (Plan 15) ──
 *
 * Hasta el Plan 15 pedir más de esto recortaba la serie **en silencio**: el
 * servidor devolvía sólo la primera página y `hasMore` avisaba de que
 * quedaba más sin que nadie lo persiguiera. Con la Fase 1
 * (`backend/iconics/client.mjs` siguiendo `X-ICO-CONTINUATION`), el backend
 * SÍ persigue esa continuación hasta agotar el rango o su propio presupuesto
 * (`HISTORY_MAX_PAGINAS`/`HISTORY_MAX_MS`) — así que `GET
 * /api/iconics/history` puede devolver bastante más de `MAX_PUNTOS` muestras
 * cuando el rango las tiene.
 *
 * Lo que este número sigue fijando es la DENSIDAD que se le pide a cada
 * tramo al trocear un rango largo (ver `planificar()` en `rango.js`, Plan 15
 * Fase 2): sigue siendo el techo razonable de puntos por petición para que
 * el servidor no tenga que paginar dentro de un solo tramo, no el límite
 * real de cuánto se puede leer en total.
 *
 * ── CUÁNTO DE ESTRECHO ES EL TAMAÑO DE PÁGINA ───────────────────────
 *
 * Mucho más estrecho de lo que sugiere el número, frente a la densidad real
 * del historiador. Medido por paginación sobre el 21-08-2026, el
 * historiador guardó **26.754 muestras de un solo día** del nivel del
 * tanque: en operación graba cerca de 1 Hz (~3.200 por hora), y sólo en
 * reposo baja a 12 por hora.
 *
 * Contra eso, 100 muestras son **menos de dos minutos** de datos crudos. Por
 * eso ninguna lectura de este proyecto pide muestras sin agregar: se pide
 * `Average` sobre una rejilla calculada para no pasar de aquí por tramo (ver
 * `leerSerie`) — es la Fase 1, no esta constante, la que resuelve leer un
 * rango que por su densidad real necesitaría varias páginas.
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
 * `Date` → `"YYYY-MM-DD HH:MM:SS"` en la zona del servidor.
 *
 * ── POR QUÉ NO BASTA CON `toISOString()` ───────────────────────────
 *
 * Porque `toISOString()` da UTC, y la planta está en UTC-6. Una serie de las
 * 11:00 locales sale rotulada `17:00Z`, y el asistente —que compara esa marca
 * con la hora que escribió el operador— concluye que los datos son de otro
 * momento y dice que no los tiene, teniéndolos delante. Ocurrió: a «el nivel
 * del tanque a las 11:16» se contestó que los datos «cubren desde las 17:00
 * hasta las 17:45», que eran ESAS MISMAS 11:00 a 11:45 escritas en UTC.
 *
 * Sin `Z` ni desplazamiento a propósito: la marca es para leerla en una frase
 * («el mínimo fue a las 11:15»), no para volver a parsearla. Las de máquina
 * siguen ahí, en los campos `…Utc`.
 */
export function horaLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

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
 * ── «MUESTRAS» NO SON LECTURAS DEL SENSOR ──────────────────────────
 *
 * `datos` no son mediciones crudas: son los promedios que devuelve el
 * servidor sobre la rejilla que se le pidió (15 min en este proyecto). Un día
 * entero cabe en unas pocas decenas de puntos aunque el historiador haya
 * grabado decenas de miles de lecturas — ver `MAX_PUNTOS`.
 *
 * Por eso el recuento se llama `puntos` y no `muestras`: «28 muestras
 * registradas» hacía entender a quien leía la respuesta que el sensor midió
 * 28 veces en todo el día, cuando midió miles. `muestras` se mantiene como
 * alias porque el frontend ya lo usaba.
 *
 * ── Y POR QUÉ VIAJA LA COBERTURA ───────────────────────────────────
 *
 * Porque los tramos SIN dato no vienen en la respuesta: sencillamente faltan.
 * El promedio es entonces el de las horas en que hubo actividad, no el del
 * período pedido, y sin decirlo se lee como si fuera el del día completo.
 * Con `rejilla` se puede contar cuántos tramos cabían y cuántos hubo.
 *
 * @param {{t: Date, valor: number}[]} datos  serie ya normalizada
 * @param {number} decimales                  los de la señal, del catálogo
 * @param {object} [ventana]                  { inicio, fin, segundosPorPunto }
 *   de la petición, para poder declarar la cobertura. Opcional: sin ella el
 *   resumen sale igual, sólo que sin los campos de cobertura.
 */
export function resumirSerie(datos, decimales = 1, ventana = null) {
  if (!Array.isArray(datos) || !datos.length) return null;

  let min = datos[0];
  let max = datos[0];
  let suma = 0;

  for (const d of datos) {
    if (d.valor < min.valor) min = d;
    if (d.valor > max.valor) max = d;
    suma += d.valor;
  }

  const primera = datos[0].t;
  const ultima = datos[datos.length - 1].t;

  /*
   * Las marcas van DOS VECES: la local para citarla y la UTC para la máquina.
   *
   * La local va primera y con el nombre corto porque es la que el asistente
   * lee y repite; la UTC conserva el instante exacto para quien tenga que
   * volver a calcular con él (gráficas, comparaciones entre husos). Quitar la
   * UTC habría sido más limpio, pero es la que ya consumía el frontend.
   */
  return {
    puntos: datos.length,
    // Alias histórico: el frontend y las pruebas ya leían `muestras`.
    muestras: datos.length,
    ...cobertura(datos.length, ventana),
    minimo: red(min.valor, decimales),
    minimoEn: horaLocal(min.t),
    minimoEnUtc: min.t.toISOString(),
    maximo: red(max.valor, decimales),
    maximoEn: horaLocal(max.t),
    maximoEnUtc: max.t.toISOString(),
    promedio: red(suma / datos.length, decimales),
    primero: red(datos[0].valor, decimales),
    ultimo: red(datos[datos.length - 1].valor, decimales),
    desde: horaLocal(primera),
    hasta: horaLocal(ultima),
    desdeUtc: primera.toISOString(),
    hastaUtc: ultima.toISOString(),
    zona: "hora local de la planta",
  };
}

/**
 * Cuántos tramos de la rejilla traían dato, y qué significa que falten.
 *
 * Devuelve `{}` sin `ventana`, para no inventar una cobertura que no se puede
 * calcular. El texto va redactado para el asistente: un `4 de 96` suelto no
 * se traduce solo, y lo que hay que evitar es que presente el promedio de
 * nueve horas de actividad como el del día entero.
 */
function cobertura(conDato, ventana) {
  if (!ventana?.inicio || !ventana?.fin || !ventana?.segundosPorPunto) return {};

  const total = Math.round(
    (new Date(ventana.fin).getTime() - new Date(ventana.inicio).getTime()) /
      1000 /
      ventana.segundosPorPunto
  );
  if (!Number.isFinite(total) || total <= 0) return {};

  const minutos = Math.round(ventana.segundosPorPunto / 60);
  const tramo = minutos >= 60 ? `${Math.round(minutos / 60)} h` : `${minutos} min`;

  const base = {
    tramoPorPunto: tramo,
    tramosConDato: conDato,
    tramosPosibles: total,
  };

  // Sin huecos no hace falta advertir de nada: el promedio ES el del período.
  if (conDato >= total) return base;

  return {
    ...base,
    avisoCobertura:
      `Cada punto es el promedio de ${tramo} de mediciones, no una lectura suelta del sensor: ` +
      `detrás de estos ${conDato} puntos hay muchas más mediciones reales. Sólo ${conDato} de ` +
      `los ${total} tramos del período tienen dato; en el resto el historiador no registró nada. ` +
      `Eso quiere decir que el promedio, el mínimo y el máximo son de las horas CON actividad, ` +
      `no del período completo: dilo así si das el promedio como representativo del día.`,
  };
}
