/**
 * Estado de la máquina → cómo se comporta el modelo 3D.
 *
 * Funciones puras y una tabla. Sin React, sin three, sin tema: aquí se decide
 * QUÉ comunica cada estado, y en `components/` se decide cómo se dibuja. Es la
 * misma separación que hay entre `plantModel.js` y los tiles del dashboard, y
 * por el mismo motivo: la parte con criterio tiene que poder revisarse de un
 * vistazo y probarse en node.
 *
 * ── EL PRINCIPIO DE DISEÑO ─────────────────────────────────────────
 *
 * A tres metros de una televisión, el estado se lee por SILUETA y COLOR antes
 * que por movimiento. Un pulso sutil de emisividad es invisible en la pared;
 * una torreta roja no. De ahí el orden de los tres canales:
 *
 *   1. BALIZA — la torreta de señalización. Es la convención industrial que el
 *      operador ya conoce y lo único legible desde lejos. Canal principal.
 *   2. POSE — carcasa abierta, módulo despiezado, modelo fantasma.
 *   3. MOVIMIENTO — sólo cuando informa, nunca decorativo. Ver más abajo.
 *
 * El tinte del material refuerza, pero NUNCA es la única señal: la paleta está
 * validada para daltonismo y aun así un color plano no distingue «receso» de
 * «sin dato». La prueba `estadoVisual.test.js` afirma justamente eso — que dos
 * estados canónicos nunca se diferencian sólo por el color.
 *
 * ── LA REGLA DE MOVIMIENTO, HEREDADA DE `lib/motion.js` ────────────
 *
 *   «una animación en bucle es una alarma, y todo lo demás se anima una sola
 *    vez [...] si parpadean seis cosas a la vez el ojo aprende a ignorarlas
 *    todas, incluida la que importa»
 *
 * En 3D es más fácil violarla que en 2D, porque todo invita a girar. Aquí sólo
 * hay DOS bucles permitidos en toda la aplicación, y el campo `bucle` de cada
 * descriptor los declara para que la prueba pueda verificarlo:
 *
 *   - `"informativo"` — sólo `running`. El husillo gira porque el giro CODIFICA
 *     producción: su velocidad sale del rendimiento medido (ver `rpmDe`). Si se
 *     quita, una máquina produciendo y una parada se ven igual.
 *   - `"alarma"` — sólo `alarma`. El destello de la baliza.
 *
 * Todo lo demás vale `"ninguno"`. Es un recorte deliberado respecto al primer
 * borrador del plan, que daba vaivén al Set-Up, respiración al fallo de
 * comunicación y una pasada periódica a la Limpieza: tres bucles más que no
 * informaban de nada y que, sumados, son exactamente la pantalla que la regla
 * describe. En los tres casos la señal la lleva la pose —panel abierto, modelo
 * fantasma, cinta vacía—, que se lee mejor y no cansa.
 *
 * Nótese que `paro_emergencia` NO parpadea aunque sea el estado más grave: la
 * quietud absoluta con la seta encendida ES el mensaje, y es lo que lo
 * distingue de `alarma` sin depender de que el rojo se lea distinto del rojo.
 */
import { ESTADOS, estadoInfo } from "@/lib/domain/index.js";

/* ------------------------------------------------------------------ *
 * Descriptores
 * ------------------------------------------------------------------ */

/**
 * Forma de un descriptor:
 *
 *   baliza     { patron: "fija"|"destello"|"apagada", hz, intensidad 0..1 }
 *   pose       "cerrada" | "abierta" | "despiece" | "fantasma"
 *   movimiento { tipo: "ninguno"|"giro"|"sacudida", unaVez }
 *   material   { opacidad 0..1, desaturar 0..1, tinte: token|null, wireframe }
 *   halo       mancha de luz en el suelo (sustituto estático de un bucle)
 *   seta       la seta de emergencia, iluminada
 *   bucle      "ninguno" | "informativo" | "alarma"  ← lo verifica la prueba
 */

const quieto = { tipo: "ninguno", unaVez: false };
const materialNormal = { opacidad: 1, desaturar: 0, tinte: null, wireframe: false };

/**
 * La cinta va vacía salvo que el estado diga lo contrario, así que sólo los
 * dos estados en los que hay pieza en proceso lo declaran.
 *
 * No es un detalle decorativo: «cinta vacía» es LA señal de Limpieza, y
 * deducirla del color violeta dejaría ese estado dependiendo de un solo canal.
 */
const SIN_PIEZA = { pieza: false };

/**
 * Los seis que emite ICONICS hoy. La etiqueta y el token NO se escriben aquí:
 * salen de `lib/domain/estado.js` al construir el descriptor, para que el 3D y
 * las tarjetas 2D no puedan decir cosas distintas del mismo estado.
 */
const CANONICOS = {
  running: {
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    pose: "cerrada",
    pieza: true,
    movimiento: { tipo: "giro", unaVez: false },
    material: materialNormal,
    halo: false,
    seta: false,
    bucle: "informativo",
    // Lo que la vista explica al operador en su panel lateral.
    lectura: "El husillo gira; su velocidad sale del rendimiento medido.",
  },

  alarma: {
    baliza: { patron: "destello", hz: 1.4, intensidad: 1 },
    pose: "cerrada",
    // Sacudida corta al ENTRAR en alarma y luego quieta: la máquina «reacciona»
    // y se para. Es lo que la separa del paro de emergencia, que nace parado.
    movimiento: { tipo: "sacudida", unaVez: true },
    material: { ...materialNormal, tinte: "coral" },
    halo: true,
    seta: false,
    bucle: "alarma",
    lectura: "Baliza en destello y sacudida al entrar. El husillo frena en seco.",
  },

  commfail: {
    // Ámbar FIJA, no en respiración: la señal la lleva el modelo fantasma.
    baliza: { patron: "fija", hz: 0, intensidad: 0.8 },
    // No sabemos en qué estado está la máquina. No es que esté mal: es que no
    // contesta. Un modelo translúcido dice «no hay información» como ningún
    // color lo dice, y es el mismo criterio con el que `format.js` pinta «—».
    pose: "fantasma",
    movimiento: quieto,
    material: { opacidad: 0.35, desaturar: 0.5, tinte: "amber", wireframe: true },
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Modelo translúcido: el equipo no contesta y su estado real se desconoce.",
  },

  setup: {
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    pose: "abierta",
    // Con pieza: en un Set-Up se está ajustando la máquina CONTRA una pieza de
    // prueba. Sin ella la escena diría que no hay nada que ajustar.
    pieza: true,
    movimiento: quieto,
    material: materialNormal,
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Panel frontal abierto y guías a la vista: hay intervención en curso.",
  },

  standby: {
    baliza: { patron: "fija", hz: 0, intensidad: 0.35 },
    pose: "cerrada",
    movimiento: quieto,
    material: { ...materialNormal, desaturar: 0.6 },
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Cerrada y apagada, sin luz interior. Disponible pero sin producir.",
  },

  unknown: {
    // Apagada del todo. Una baliza gris tenue diría «en reposo», que es una
    // afirmación; la ausencia de dato no afirma nada.
    baliza: { patron: "apagada", hz: 0, intensidad: 0 },
    pose: "cerrada",
    movimiento: quieto,
    material: { opacidad: 0.35, desaturar: 1, tinte: null, wireframe: false },
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Sin lectura todavía. No se afirma nada sobre el equipo.",
  },
};

/**
 * Estados que ICONICS **no emite hoy**.
 *
 * Existen porque se pidieron para la demostración, y llevan `label` y `token`
 * propios precisamente porque no están en el dominio: si estuvieran, saldrían
 * de allí como los canónicos.
 *
 * `esExtendido` no es decorativo — la vista lo usa para rotularlos aparte, y
 * así la demo no promete una pantalla que en planta no va a ocurrir. Para
 * darlos de alta de verdad hay que añadirlos primero a `lib/domain/estado.js`
 * con su código del servidor, y entonces bajarlos a `CANONICOS`; la prueba
 * avisa cuando eso pase.
 */
const EXTENDIDOS = {
  correctivo: {
    label: "Mantenimiento Correctivo",
    token: "amber",
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    // Despiece: el módulo averiado separado del cuerpo. Es la silueta más
    // distinta de todo el juego, y se lee al instante desde lejos.
    pose: "despiece",
    movimiento: quieto,
    material: materialNormal,
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Carcasa abierta y módulo separado del cuerpo: reparación en curso.",
  },

  preventivo: {
    label: "Mantenimiento Preventivo",
    token: "accent",
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    // Abierta pero SIN despiece: es lo que la separa del correctivo. Se
    // interviene una máquina que no está rota.
    pose: "abierta",
    movimiento: quieto,
    material: materialNormal,
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Abierta pero sin despiece: intervención prevista, no una avería.",
  },

  limpieza: {
    label: "Limpieza",
    token: "violet",
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    pose: "cerrada",
    movimiento: quieto,
    // Brillo alto y cinta vacía. La «pasada» periódica del primer borrador era
    // un bucle que no informaba de nada; ver la cabecera.
    material: { ...materialNormal, tinte: "violet" },
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Cinta vacía y acabado brillante. No hay pieza en proceso.",
  },

  paro_emergencia: {
    label: "Paro de Emergencia",
    token: "coral",
    // FIJA, no en destello: ver la cabecera. La quietud es el mensaje.
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    pose: "cerrada",
    movimiento: quieto,
    material: { ...materialNormal, tinte: "coral" },
    halo: true,
    seta: true,
    bucle: "ninguno",
    lectura: "Todo congelado y la seta encendida. Nada se mueve hasta que se rearme.",
  },

  receso: {
    label: "Receso",
    token: "textSoft",
    // Mismo comportamiento que Stand By, a propósito: son el mismo hecho
    // físico. Si algún día hay que separarlos, se separan aquí y no en el
    // componente.
    baliza: { patron: "fija", hz: 0, intensidad: 0.35 },
    pose: "cerrada",
    movimiento: quieto,
    material: { ...materialNormal, desaturar: 0.6 },
    halo: false,
    seta: false,
    bucle: "ninguno",
    lectura: "Idéntico a Stand By: es el mismo hecho físico, una parada prevista.",
  },
};

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

/** Claves canónicas, en el orden en que las presenta la vista. */
export const CLAVES_CANONICAS = Object.keys(CANONICOS);

/** Claves extendidas (aún no las emite ICONICS). */
export const CLAVES_EXTENDIDAS = Object.keys(EXTENDIDOS);

/**
 * Descriptor completo de un estado.
 *
 * Una clave desconocida cae en `unknown` y no revienta, por el mismo motivo que
 * `estadoFromCode`: un código nuevo del servidor debe verse como «sin dato» y
 * nunca como el estado equivocado.
 */
export function comportamiento(key) {
  const ext = EXTENDIDOS[key];
  if (ext) return { key, esExtendido: true, ...SIN_PIEZA, ...ext };

  const base = CANONICOS[key] ?? CANONICOS.unknown;
  const dominio = estadoInfo(CANONICOS[key] ? key : "unknown");

  // La etiqueta y el token vienen del dominio, nunca de aquí.
  return {
    key: dominio.key,
    esExtendido: false,
    label: dominio.label,
    token: dominio.token,
    ...SIN_PIEZA,
    ...base,
  };
}

/**
 * El mismo descriptor con el movimiento desactivado, para
 * `prefers-reduced-motion`.
 *
 * No basta con poner los bucles a cero: un estado que comunicaba con
 * movimiento se quedaría mudo. `GaugeCard` ya documenta el mismo problema —sin
 * su latido, la tarjeta en alarma «necesita un fondo de alerta fijo para
 * seguir leyéndose como tal»—. Aquí el sustituto es el halo en el suelo y la
 * baliza a intensidad máxima, los dos estáticos.
 */
export function comportamientoReducido(key) {
  const c = comportamiento(key);
  if (c.bucle === "ninguno" && c.movimiento.tipo === "ninguno") return c;

  return {
    ...c,
    bucle: "ninguno",
    movimiento: quieto,
    baliza: { ...c.baliza, patron: c.baliza.patron === "apagada" ? "apagada" : "fija", hz: 0, intensidad: 1 },
    // Lo que se perdía en movimiento se recupera como presencia fija.
    halo: true,
  };
}

/* ---- Ritmo del giro ---------------------------------------------- */

/** Rango de giro visible. Por debajo de 60 rpm no se percibe como producción. */
export const RPM_MIN = 60;
export const RPM_MAX = 160;

/**
 * Ritmo nominal para cuando la máquina opera pero no hay rendimiento medido.
 * Justo en medio del rango: no sugiere ni un ritmo bueno ni uno malo.
 */
export const RPM_NOMINAL = (RPM_MIN + RPM_MAX) / 2;

/**
 * Velocidad de giro del husillo, en rpm.
 *
 * El giro codifica **que** la máquina produce; el ritmo sólo codifica el
 * rendimiento cuando hay rendimiento que codificar. Con el factor ausente se
 * gira a ritmo nominal y se devuelve `medido: false`, que es lo que la vista
 * usa para escribir «ritmo sin medir».
 *
 * Es la regla de siempre —un hueco se pinta como hueco y nunca como cero—
 * traducida a geometría: parar el modelo diría «esta máquina no produce», que
 * es justo lo contrario de lo que informó el servidor.
 */
export function rpmDe(machine) {
  if (!machine || machine.estado !== ESTADOS.running.key) return { rpm: 0, medido: false };

  const r = machine.rendimiento;
  if (r === null || r === undefined || !Number.isFinite(r)) {
    return { rpm: RPM_NOMINAL, medido: false };
  }

  const pct = Math.max(0, Math.min(100, r));
  return { rpm: RPM_MIN + ((RPM_MAX - RPM_MIN) * pct) / 100, medido: true };
}
