/**
 * Estado derivado → cómo se comporta el modelo 3D del sistema de agua.
 *
 * Funciones puras y una tabla. Sin React, sin three, sin tema: aquí se decide
 * QUÉ comunica cada estado y en `components/` cómo se dibuja. El motivo del
 * reparto: la parte con criterio tiene que poder revisarse de un vistazo y
 * probarse en node.
 *
 * ── SE HEREDA EL PRINCIPIO DE DISEÑO, NO LA TABLA ──────────────────
 *
 * El principio venía de la vista 3D del tablero anterior y sigue valiendo
 * palabra por palabra: a tres metros de una televisión el estado se lee por SILUETA y COLOR
 * antes que por movimiento, así que el orden de los canales es baliza → pose →
 * movimiento, y el tinte del material refuerza pero nunca es la única señal.
 *
 * La tabla no se puede heredar porque los estados son otros: allí son los seis
 * que publica el PLC, aquí son cinco derivados de umbrales. Un `import` de
 * aquella tabla devolvería `unknown` para las cinco claves de aquí.
 *
 * ── LA REGLA DE MOVIMIENTO, OTRA VEZ ───────────────────────────────
 *
 *   «una animación en bucle es una alarma, y todo lo demás se anima una sola
 *    vez [...] si parpadean seis cosas a la vez el ojo aprende a ignorarlas
 *    todas, incluida la que importa»            — lib/motion.js
 *
 * En esta sección hay exactamente **dos** bucles permitidos, igual que en la de
 * Resonac, y los dos están declarados para que la prueba pueda verificarlo:
 *
 *  - `"alarma"`    — sólo `critico`. El destello de la baliza.
 *  - `"informativo"` — el giro del impulsor de la bomba. **No lo declara un
 *    estado**, lo declara el caudal: la bomba gira porque está impulsando, y su
 *    velocidad codifica la carga del motor. Ver `rpmDe`, y de ahí que
 *    `frameloopDe` reciba las dos cosas.
 *
 * Ese matiz es la única diferencia estructural con Resonac, y es correcto: allí
 * «operando» ES un estado del servidor; aquí «impulsando» es un hecho que se
 * deduce de dos magnitudes, y puede coexistir con una alarma de otra señal.
 */
import { ESTADOS, estadoInfo } from "../../domain/estado.js";

const materialNormal = { opacidad: 1, desaturar: 0, tinte: null, wireframe: false };

/**
 * Forma de un descriptor:
 *
 *   baliza    { patron: "fija"|"destello"|"apagada", hz, intensidad 0..1 }
 *   material  { opacidad 0..1, desaturar 0..1, tinte: token|null, wireframe }
 *   halo      "ninguno" | "simple" | "doble" — anillos de luz en el suelo
 *   bucle     "ninguno" | "alarma"   ← lo verifica la prueba
 *   lectura   lo que la vista explica en su panel lateral
 *
 * ── POR QUÉ EL HALO TIENE TRES VALORES Y NO ES UN BOOLEANO ─────────
 *
 * Empezó siéndolo, y la prueba `tres-d.test.js` lo tumbó: con el halo apagado
 * en `atencion`, ese estado y `nominal` compartían baliza, opacidad, desaturado
 * y malla, así que **sólo se distinguían por el tinte del material**. A tres
 * metros de una televisión eso no lo distingue nadie, con o sin daltonismo, y es
 * justo lo que el principio de diseño prohíbe.
 *
 * El halo pasa a ser el canal que separa «hay algo que mirar» de «todo en
 * banda». Y como `critico` también lo necesita —es su refuerzo estático—, hace
 * falta un tercer valor: con `prefers-reduced-motion` el destello desaparece, y
 * un `critico` sin destello y con halo simple volvería a ser indistinguible de
 * `atencion`. El anillo doble es lo que lo mantiene separado cuando el
 * movimiento no está disponible.
 */
const TABLA = {
  critico: {
    baliza: { patron: "destello", hz: 1.4, intensidad: 1 },
    material: { ...materialNormal, tinte: "coral" },
    halo: "simple",
    bucle: "alarma",
    lectura: "Alguna señal del activo está fuera de su límite duro.",
  },

  atencion: {
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    material: { ...materialNormal, tinte: "amber" },
    // El halo es lo que lo separa de `nominal` sin depender del color.
    halo: "simple",
    bucle: "ninguno",
    lectura: "Alguna señal ha salido de la banda cómoda, sin llegar al límite.",
  },

  nominal: {
    baliza: { patron: "fija", hz: 0, intensidad: 1 },
    material: materialNormal,
    halo: "ninguno",
    bucle: "ninguno",
    lectura: "Todas las señales del activo están dentro de su banda.",
  },

  reposo: {
    // Atenuada y desaturada, como el Stand By de Resonac: disponible, sin
    // actividad. No es un problema y no debe parecerlo.
    baliza: { patron: "fija", hz: 0, intensidad: 0.35 },
    material: { ...materialNormal, desaturar: 0.6 },
    halo: "ninguno",
    bucle: "ninguno",
    lectura: "El sistema no está impulsando: estas señales no se evalúan ahora.",
  },

  sin_dato: {
    // Apagada del todo y modelo fantasma. Una baliza gris tenue diría «en
    // reposo», que es una afirmación; la ausencia de dato no afirma nada.
    baliza: { patron: "apagada", hz: 0, intensidad: 0 },
    material: { opacidad: 0.35, desaturar: 1, tinte: null, wireframe: true },
    halo: "ninguno",
    bucle: "ninguno",
    lectura: "Sin lectura utilizable. No se afirma nada sobre este activo.",
  },
};

/** Claves, en el orden de gravedad del dominio. */
export const CLAVES = Object.keys(ESTADOS);

/**
 * Descriptor completo de un estado.
 *
 * Una clave desconocida cae en `sin_dato` y no revienta, por el mismo motivo
 * que en el dominio: algo que no sepamos interpretar debe verse como «sin
 * dato» y nunca como el estado equivocado.
 *
 * La etiqueta y el token NO se escriben en la tabla: salen de `domain/estado.js`
 * al construir el descriptor, para que el 3D y las tarjetas 2D no puedan decir
 * cosas distintas del mismo estado.
 */
export function comportamiento(key) {
  const base = TABLA[key] ?? TABLA.sin_dato;
  const dominio = estadoInfo(TABLA[key] ? key : "sin_dato");

  return { key: dominio.key, label: dominio.label, token: dominio.token, ...base };
}

/**
 * El mismo descriptor con el movimiento desactivado, para
 * `prefers-reduced-motion`.
 *
 * No basta con poner los bucles a cero: un estado que comunicaba con
 * movimiento se quedaría mudo. Aquí el sustituto es el halo en el suelo y la
 * baliza a intensidad máxima, los dos estáticos — igual que en Resonac.
 */
export function comportamientoReducido(key) {
  const c = comportamiento(key);
  if (c.bucle === "ninguno") return c;

  return {
    ...c,
    bucle: "ninguno",
    baliza: { ...c.baliza, patron: c.baliza.patron === "apagada" ? "apagada" : "fija", hz: 0, intensidad: 1 },
    // Doble y no simple: sin el destello, un halo simple dejaría a `critico`
    // idéntico a `atencion` salvo por el color. Ver la cabecera de TABLA.
    halo: "doble",
  };
}

/* ---- Ritmo del impulsor ------------------------------------------ */

/** Rango de giro visible. Por debajo de 40 rpm no se percibe como impulsión. */
export const RPM_MIN = 40;
export const RPM_MAX = 150;

/** Ritmo nominal para cuando impulsa pero no hay carga medida. */
export const RPM_NOMINAL = (RPM_MIN + RPM_MAX) / 2;

/**
 * Velocidad de giro del impulsor, en rpm.
 *
 * El giro codifica **que** la bomba impulsa; el ritmo codifica la carga del
 * motor sólo cuando hay carga que codificar. Con el sistema en reposo se para
 * del todo, que es la única forma de que un sistema parado y uno impulsando no
 * se vean igual.
 *
 * Con el sistema en marcha pero sin lectura de carga se gira a ritmo nominal y
 * se devuelve `medido: false`, que es lo que la ficha usa para escribir «ritmo
 * sin medir». Es la regla de siempre —un hueco se pinta como hueco y nunca como
 * cero— traducida a geometría: parar el modelo diría «esta bomba no impulsa»,
 * que es justo lo contrario de lo que informó el servidor.
 */
export function rpmDe(sistema) {
  if (!sistema || sistema.enReposo) return { rpm: 0, medido: false, motivo: "reposo" };

  const carga = sistema.senales?.cargaMotor?.valor;
  if (!Number.isFinite(carga)) return { rpm: RPM_NOMINAL, medido: false, motivo: "sin-carga" };

  const pct = Math.max(0, Math.min(100, carga));
  return { rpm: RPM_MIN + ((RPM_MAX - RPM_MIN) * pct) / 100, medido: true, motivo: null };
}

/**
 * El `frameloop` que le toca al `<Canvas>`.
 *
 * Con `"always"`, r3f repinta 60 veces por segundo aunque no se mueva nada; en
 * una pantalla de planta encendida ocho horas eso es una GPU al 100 % dibujando
 * el mismo fotograma. Con `"demand"` sólo se dibuja cuando alguien lo pide.
 *
 * La respuesta es exacta y no una heurística porque los bucles están limitados
 * a dos y declarados: un sistema en reposo y en banda deja la GPU a cero, y
 * basta con que la bomba arranque —o con que una señal se salga— para que
 * vuelva a dibujar.
 */
export function frameloopDe({ estados = [], rpm = 0, reduce = false } = {}) {
  if (reduce) return "demand";
  if (rpm > 0) return "always";
  return estados.some((k) => comportamiento(k).bucle !== "ninguno") ? "always" : "demand";
}
