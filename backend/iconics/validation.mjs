/**
 * Validación de los parámetros que el puente reenvía a ICONICS.
 *
 * Todo lo que llega del cliente y acaba en una query string o en un cuerpo
 * hacia el servidor pasa por aquí. Es una lista blanca, no una lista negra:
 * lo que no encaje se rechaza, aunque parezca inofensivo.
 */

/**
 * Patrón admitido para nombres de punto y textos de búsqueda.
 *
 * Un nombre de punto de ICONICS puede llevar letras, dígitos, dos puntos,
 * puntos, guiones bajos, guiones, espacios, `@`, `#`, paréntesis, corchetes,
 * barras, contrabarras y —para los Data Manipulators de GridWorX— `< > = ' "`
 * y comas, que son sus parámetros. Ejemplos reales:
 *
 *   svrsim:step int 5 25 10
 *   db:Northwind.Products[ProductName][0]
 *   db:Northwind.AddCustomer<@CustomerID='X', @CompanyName='Y'>.@@Execute
 *
 * El `$` es del espacio de nombres de diagnóstico `$info:`, que expone el
 * estado de la LICENCIA (`$info:Overview.Tier`, `$info:Features.HistorianOn`).
 * Sin él, `scripts/verificar-historia.mjs` no puede distinguir un servidor en
 * modo Demo —que apaga la lectura histórica y devuelve 500— de un servicio
 * realmente roto.
 *
 * ── EL `+` ES DE LAS ALARMAS ───────────────────────────────────────
 *
 * El servidor de alarmas (`ae:`) cuelga los campos de cada alarma de subnodos
 * separados con `+`:
 *
 *   ae:/DEMO.NIVEL ALTO+AdjustableInputs      (los LÍMITES configurados)
 *   ae:/DEMO.NIVEL ALTO+SystemEventFields     (severidad, estado, marca de tiempo)
 *
 * Sin el `+` esos nodos no se pueden ni explorar ni leer, y con ellos se cae
 * la única fuente FIABLE de umbrales que tiene esta instalación: los límites
 * con los que la propia planta dispara sus alarmas. La alternativa —los
 * valores de `shared/eva/umbrales.js`— son estimaciones nuestras que, medidas
 * contra el servidor real, no se parecen a esta instalación.
 *
 * Añadirlo no abre nada: esto es una lista blanca de CARACTERES para un valor
 * que viaja como parámetro de query ya codificado, no un intérprete de rutas.
 * El `+` no significa nada especial en un nombre de punto de ICONICS ni en el
 * cliente HTTP que lo reenvía.
 */
const SAFE_PARAM_RE = /^[a-zA-Z0-9:._+\-\s@#$()[\]/\\<>=',"]{1,300}$/

/**
 * Fechas y agregados del historiador: alfanuméricos más la puntuación que
 * aparece en una marca de tiempo ISO con desfase (`2026-08-04T00:00:00+02:00`),
 * en un intervalo (`01:00:00`) y en un nombre de agregado (`Interpolative`).
 */
const SAFE_HISTORY_ARG_RE = /^[a-zA-Z0-9:./+\-\s]{1,64}$/

export function isSafePointName(value) {
  return typeof value === 'string' && SAFE_PARAM_RE.test(value)
}

export function isSafeHistoryArgument(value) {
  return typeof value === 'string' && SAFE_HISTORY_ARG_RE.test(value)
}

/** Trocea la lista separada por comas de `?points=` descartando huecos. */
export function parsePointList(rawValue) {
  return rawValue
    .split(',')
    .map(point => point.trim())
    .filter(Boolean)
}

