/**
 * Hallazgos: lo que el sistema ya calculó y que aún no ha visto nadie,
 * proyectado en una forma común (Plan 25 F6 · `NUE-03`).
 *
 * ── POR QUÉ SE LLAMA «HALLAZGO» Y NO «PROPUESTA» ────────────────────
 *
 * Porque «propuesta» YA SIGNIFICA algo concreto en este proyecto:
 * `shared/eva/comun/aprendizaje.js` — una regla de riesgo que el asistente
 * sugiere (`proponer_regla`), con un ciclo de aprobación deliberadamente
 * FUERA del tablero (`scripts/revisar-propuestas.mjs`), porque aprobarla exige
 * escribir la regla y su prueba a mano. Usar la misma palabra aquí, para algo
 * que SÍ se puede aceptar o descartar con un botón, habría hecho creer que las
 * dos bandejas se aprueban igual — cuando una no exige escribir una línea de
 * código y la otra exige una regla probada.
 *
 * Un «hallazgo» es más honesto con lo que es: algo que ya estaba calculado y
 * que este componente no descubre ni decide, sólo reúne para que alguien lo
 * mire.
 *
 * ── ESTE MÓDULO NO CALCULA NADA ─────────────────────────────────────
 *
 * `CLAUDE.md` §4.3: el dominio decide bandas y órdenes, la presentación no.
 * Aquí no hay ninguna regla de riesgo ni ninguna puntuación — eso ya lo
 * hicieron `evaluarRiesgos()`/`evaluarRiesgosVibracion()` y
 * `buscarCasosSimilares()` (vía F0), en sus propios dominios. Esto sólo
 * NORMALIZA sus salidas a una forma común para que una bandeja las pinte
 * juntas sin un `if` por origen.
 *
 * ── LAS DOS FUENTES, Y LA TERCERA QUE NO ENTRA ──────────────────────
 *
 * Riesgos activos (de las dos máquinas) y casos similares proactivos (F0). Lo
 * que la especificación original de `NUE-03` también nombraba —«diagnósticos
 * sin cerrar»— NO se puede construir hoy sin inventar un registro que no
 * existe: `diagnosticEventId` se genera UNA VEZ por llamada a
 * `/api/diagnostico` y no se persiste hasta que alguien cierra el caso, así
 * que no hay ningún sitio donde conste qué diagnósticos se calcularon y
 * quedaron sin cerrar. Inventarlo sería fabricar un dato que no existe (§2.5).
 * Se deja fuera y anotado, no simulado.
 *
 * ── EL ID, Y POR QUÉ LLEVA SU ORIGEN DELANTE ────────────────────────
 *
 * Mismo criterio que `idDeEvento()` en `eventosDeAlarma.js`: el id lleva
 * prefijado de dónde viene (`riesgo:`, `caso:`) para que nunca se confunda con
 * un id de otro sistema, y para que `crearVistoPorMi()` pueda marcarlo sin que
 * dos hallazgos de origen distinto colisionen por compartir el mismo id crudo.
 *
 * ── LA REGLA QUE ESTE MÓDULO NO PUEDE ROMPER ────────────────────────
 *
 * `NO_COMPARTEN`: cada hallazgo lleva su `sistema` (`"tanque"` |
 * `"vibraciones"` | `null` si no es de ninguna máquina) y nunca se fusiona el
 * de una máquina con el de otra. Quien pinte la bandeja filtra o agrupa por
 * `sistema`, no mezcla.
 */

/**
 * Un riesgo activo de una máquina, a hallazgo.
 *
 * @param {"tanque"|"vibraciones"} sistema
 * @param {object} riesgo  la forma de `evaluarRiesgos().activos[i]` — trae
 *                         al menos `id`, `titulo`, `severidad`.
 * @returns {object} hallazgo
 */
export function hallazgoDeRiesgo(sistema, riesgo) {
  return {
    id: `riesgo:${sistema}:${riesgo.id}`,
    origen: "riesgo",
    sistema,
    // La severidad ya viene puntuada por el dominio del riesgo — esto no
    // decide ninguna banda, sólo la transporta.
    severidad: riesgo.severidad,
    titulo: riesgo.titulo,
    resumen: riesgo.evidencia,
    // Con qué se navega a la vista de Riesgos de esa máquina, si alguien
    // pulsa el hallazgo. El destino real (qué ruta, qué parámetro) lo decide
    // quien pinta, no este módulo — aquí sólo viaja el id del riesgo.
    referencia: { riesgoId: riesgo.id },
  };
}

/**
 * Un caso similar citado por el motor de diagnóstico (F0), a hallazgo.
 *
 * @param {"tanque"|"vibraciones"} sistema
 * @param {string} riesgoId       el riesgo cuya causa citó este caso
 * @param {object} caso           `{ id, fecha, resuelto, resumen }` — la forma
 *                                de `casosCitados[i]` en `diagnostico.mjs`.
 * @returns {object} hallazgo
 */
export function hallazgoDeCaso(sistema, riesgoId, caso) {
  return {
    id: `caso:${sistema}:${riesgoId}:${caso.id}`,
    origen: "caso",
    sistema,
    // Un caso citado no lleva severidad propia: la severidad es del RIESGO
    // que respalda, no del caso en sí. Se deja `null` en vez de inventar una —
    // inferirla de `resuelto` afirmaría algo que el dominio del caso no dice.
    severidad: null,
    titulo: caso.resumen ?? "—",
    resumen: caso.fecha ? `Caso previo del ${caso.fecha}` : "Caso previo",
    referencia: { riesgoId, casoId: caso.id },
  };
}

/**
 * Orden de severidad, para pintar lo grave primero.
 *
 * `null` (un caso, que no lleva severidad propia) va al final: no es que no
 * importe, es que no es comparable con una severidad de riesgo sin inventar
 * una equivalencia que el dominio no ha declarado.
 */
const ORDEN_SEVERIDAD = { critico: 0, atencion: 1, informativo: 2 };

/** Ordena hallazgos por severidad (grave primero), estable. */
export function ordenarHallazgos(hallazgos) {
  return [...hallazgos].sort((a, b) => {
    const oa = a.severidad === null ? 99 : ORDEN_SEVERIDAD[a.severidad] ?? 98;
    const ob = b.severidad === null ? 99 : ORDEN_SEVERIDAD[b.severidad] ?? 98;
    return oa - ob;
  });
}
