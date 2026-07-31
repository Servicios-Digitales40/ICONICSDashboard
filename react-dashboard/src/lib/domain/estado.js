/**
 * lib/domain/estado.js
 * ------------------------------------------------------------------
 * FUENTE ÚNICA del vocabulario de estados de máquina.
 *
 * Antes vivía duplicado en dos sitios que podían divergir: `ESTADO_TOKEN`
 * en lib/machines.js (colores) y el mapa `ESTADOS` de GaugeCard (colores
 * + iconos). Ahora el dominio manda: aquí están la clave canónica, la
 * etiqueta y el token de color; el icono lo pone el componente, porque
 * es la única parte que sí es presentación.
 *
 * ── LA DECISIÓN (Plan 1 §5.1) ──────────────────────────────────────
 *
 * El vocabulario canónico es EL DE ICONICS, no el que tenía la app.
 *
 * La app manejaba seis estados en español (Operando, Mantenimiento
 * Correctivo, Mantenimiento Preventivo, Limpieza, Receso, Paro de
 * Emergencia). El servidor solo emite cinco enteros, y de todos ellos
 * únicamente «Operando ↔ 1» coincidía. Los otros cinco de la app no
 * existen en ICONICS y nunca se recibirían; los cuatro de ICONICS que
 * faltaban (Stand By, Set-Up, Comm Fail, Alarma) no se podrían mostrar.
 *
 * Se adopta el del servidor porque un tablero de planta no debe prometer
 * estados que nadie va a enviar jamás. Si producción necesita los de
 * mantenimiento, hay que añadirlos EN EL SERVIDOR y luego aquí — no
 * inventarlos en el frontend.
 *
 * Los códigos salen de la propia expresión de la propiedad `Estado` en
 * el Excel:
 *
 *     IF   B_Run    THEN 1   ← Running
 *     ELSEIF B_Std_By THEN 0 ← Stand By
 *     ELSEIF B_SetUp  THEN 2 ← Set-Up / No identificada
 *     ELSEIF Comm Fail THEN 3 ← Fallo de comunicación
 *     ELSE 4                 ← Alarma
 */

/**
 * `token` es un nombre de color del TEMA, no un hex: quien pinta resuelve
 * `theme[token]` y así funciona igual en claro y en oscuro.
 *
 * `orden` va de peor a mejor y manda en la leyenda de la dona del
 * dashboard, para que lo grave quede arriba.
 */
export const ESTADOS = {
  alarma:   { key: "alarma",   codigo: 4,    label: "Alarma",              token: "coral",     orden: 0, critico: true },
  commfail: { key: "commfail", codigo: 3,    label: "Sin comunicación",    token: "amber",     orden: 1 },
  setup:    { key: "setup",    codigo: 2,    label: "Set-Up",              token: "accent",    orden: 2 },
  standby:  { key: "standby",  codigo: 0,    label: "Stand By",            token: "textSoft",  orden: 3 },
  running:  { key: "running",  codigo: 1,    label: "Operando",            token: "success",   orden: 4 },
  /** No es un estado del servidor: es la ausencia de dato (mala calidad o sin leer aún). */
  unknown:  { key: "unknown",  codigo: null, label: "Sin dato",            token: "textFaint", orden: 5 },
};

/** Claves de peor a mejor. Alimenta la leyenda de la dona de estados. */
export const ESTADOS_ORDEN = Object.values(ESTADOS)
  .sort((a, b) => a.orden - b.orden)
  .map((e) => e.key);

const POR_CODIGO = Object.fromEntries(
  Object.values(ESTADOS)
    .filter((e) => e.codigo !== null)
    .map((e) => [e.codigo, e.key])
);

/**
 * Entero de ICONICS → clave canónica.
 *
 * Cualquier cosa que no sea uno de los cinco códigos conocidos cae en
 * `unknown`: un código nuevo aparecido en el servidor debe verse como
 * «sin dato» y no colarse como el estado equivocado.
 */
export function estadoFromCode(codigo) {
  if (codigo === null || codigo === undefined) return "unknown";
  return POR_CODIGO[Number(codigo)] ?? "unknown";
}

/** Configuración completa de un estado, tolerante a claves desconocidas. */
export const estadoInfo = (key) => ESTADOS[key] ?? ESTADOS.unknown;

/** Etiqueta legible. */
export const estadoLabel = (key) => estadoInfo(key).label;

/** ¿Cuenta como máquina produciendo? Un solo sitio decide qué es «operando». */
export const estaOperando = (key) => key === ESTADOS.running.key;
