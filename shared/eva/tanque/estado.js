/**
 * Vocabulario de estado de Demo EVA: clave canónica, etiqueta y token de color.
 *
 * ── ESTE ESTADO ES DERIVADO, Y ESO CAMBIA TODO ─────────────────────
 *
 * El tablero de Resonac lee un tag `Estado` que el PLC calcula y que ICONICS
 * publica: su vocabulario (`running`, `alarma`, `commfail`…) **es el del
 * servidor**, y por eso `shared/domain/estado.js` advierte de que «un tablero de
 * planta no debe prometer estados que el servidor no va a enviar nunca».
 *
 * Aquí no existe ese tag. Bajo `ac:TDCON/DEMO/SENSORES/` hay ocho magnitudes y
 * nada más: ni estado, ni alarmas configuradas (Plan 8 §1.1 y §1.4). Así que el
 * color de un activo sale de comparar sus señales contra los umbrales de
 * `./umbrales.js`, que son **nuestros**.
 *
 * De ahí las dos decisiones de este archivo:
 *
 *  1. Las claves son **deliberadamente distintas** de las de Resonac. Ni un
 *     `running` ni un `alarma` en todo el módulo. Quien lea el código no puede
 *     confundir un estado que llega del servidor con uno que calculamos, y un
 *     `import` cruzado por accidente falla en vez de colar.
 *  2. `DERIVADO` es `true` y la vista lo rotula. No se esconde que la planta no
 *     publica esto; se dice, con enlace a los umbrales.
 *
 * ── POR QUÉ EXISTE `reposo` ────────────────────────────────────────
 *
 * La instalación está parada la mayor parte del tiempo: caudal ≈ 0, carga del
 * motor 0, eficiencia 0. Sin esta clave, esos ceros caerían por debajo de sus
 * límites y la demo abriría en rojo permanente — que es exactamente la pantalla
 * que enseña a ignorar las alertas.
 *
 * `reposo` no es «todo bien»: es «esta señal no significa nada ahora mismo». Por
 * eso sólo se aplica a las señales marcadas `soloEnMarcha` en el catálogo, y el
 * nivel del tanque o la tensión de línea se siguen evaluando con el sistema
 * parado, que es cuando más importan.
 */
import { REPOSO, bandaDe } from "../comun/umbrales.js";
import { SENALES } from "./senales.js";

/**
 * `token` es un nombre de color del tema, no un hex, igual que en el dominio de
 * Resonac: quien pinta resuelve `theme[token]` y funciona en claro y en oscuro.
 *
 * `orden` va de peor a mejor y manda en la agregación (`peor`) y en las
 * leyendas, para que lo grave quede arriba.
 *
 * `sin_dato` va ANTES que `reposo` y `nominal` a propósito: un activo al que le
 * falta una lectura no puede anunciarse como correcto. Ausencia de dato no es
 * ausencia de problema.
 */
export const ESTADOS = {
  critico:  { key: "critico",  label: "Fuera de límite", corto: "Fuera",    token: "coral",     orden: 0, critico: true },
  atencion: { key: "atencion", label: "En aviso",        corto: "Aviso",    token: "amber",     orden: 1 },
  sin_dato: { key: "sin_dato", label: "Sin dato",        corto: "Sin dato", token: "textFaint", orden: 2 },
  reposo:   { key: "reposo",   label: "En reposo",       corto: "Reposo",   token: "textSoft",  orden: 3 },
  nominal:  { key: "nominal",  label: "En banda",        corto: "En banda", token: "success",   orden: 4 },
};

/** Claves de peor a mejor. Alimenta leyendas y agregación. */
export const ESTADOS_ORDEN = Object.values(ESTADOS)
  .sort((a, b) => a.orden - b.orden)
  .map((e) => e.key);

/** Configuración completa de un estado, tolerante a claves desconocidas. */
export const estadoInfo = (key) => ESTADOS[key] ?? ESTADOS.sin_dato;

/** ¿Este estado pide que alguien mire ahora? Sólo dos lo piden. */
export const pideAtencion = (key) => key === "critico" || key === "atencion";

/**
 * Este vocabulario NO lo publica ICONICS. Lo leen las vistas para rotularlo.
 * Es una constante y no una función porque nunca va a dejar de ser cierto
 * mientras el servidor no publique un tag de estado.
 */
export const DERIVADO = true;

/**
 * El peor de una lista de estados. Una lista vacía es `sin_dato`, no `nominal`:
 * un activo sin señales no está bien, está sin medir.
 */
export function peor(claves) {
  if (!claves?.length) return "sin_dato";
  return claves.reduce(
    (acc, k) => (estadoInfo(k).orden < estadoInfo(acc).orden ? k : acc),
    "nominal"
  );
}

/**
 * Codificación común a `Estado VFD`, `Estado S1`, `Estado S2` y `Estado BA`
 * (Plan 27 F5, `Lista-variables.pdf` §1.6). `Estado VFD` no está en el
 * catálogo todavía (`MANDO_DEL_VARIADOR_VFD/` queda fuera del alcance de
 * F0-F5); la tabla se deja aquí, común, para que entrar no repita esto.
 */
const ESTADO_EQUIPO = { 1: "nominal", 2: "nominal", 3: "critico", 4: "atencion" };

/**
 * ¿Está el sistema sin impulsar?
 *
 * Exige que **las dos** señales estén medidas y las dos por debajo de su umbral.
 * Con una sola sin lectura no se afirma el reposo: no saber si la bomba está en
 * marcha no es lo mismo que saber que está parada, y la diferencia importa
 * porque `reposo` silencia la evaluación de media instalación.
 */
export function enReposo(valores = {}) {
  const carga = valores.cargaMotor;
  const flujo = valores.flujoInstantaneo;
  if (!Number.isFinite(carga) || !Number.isFinite(flujo)) return false;
  return carga <= REPOSO.cargaMotor && Math.abs(flujo) <= REPOSO.flujo;
}

/**
 * Estado de una señal concreta.
 *
 * `valor` llega ya saneado (número, booleano o `null`). Las booleanas SIN
 * `naturaleza` declarada (`modoVdf`, y `PARO_DE_EMERGENCIA` desde el Plan 27
 * F3) no tienen banda: con lectura son `nominal` y sin ella `sin_dato`, porque
 * un modo de operación no es ni bueno ni malo — y porque en el caso de
 * `PARO_DE_EMERGENCIA` la polaridad del bit está sin confirmar (ver su `nota`
 * en el catálogo): dictaminar `critico` o `nominal` sobre un booleano cuyo
 * significado no se conoce sería inventar, no leer.
 *
 * ── `naturaleza: "alarma"` ES DISTINTO, Y A PROPÓSITO (Plan 27 F3) ────
 *
 * Las ocho de `ALARMAS/` sí tienen una polaridad confirmada por el propio
 * nombre del bit (`Lista-variables.pdf` §1.10): `true` es la condición mala.
 * Tratarlas como boolean genérico las dejaría siempre en `nominal` —una
 * alarma activa disfrazada de instalación sana—, así que aquí SÍ se juzga:
 * `true` → `meta.estadoActivo` (`"critico"` si no se declara), `false` →
 * `nominal`. `estadoActivo` distingue los pares de dos niveles del propio PLC
 * (`NIVEL_ALTO` es aviso, `NIVEL_ALTO_ALTO` es crítico) sin inventar un umbral
 * nuevo: es la misma distinción que ya hace el nombre del bit.
 */
export function estadoDeSenal(key, valor, { reposo = false } = {}) {
  const meta = SENALES[key];
  if (!meta) return "sin_dato";

  if (meta.naturaleza === "alarma") {
    if (reposo && meta.soloEnMarcha) return "reposo";
    if (valor === null || valor === undefined) return "sin_dato";
    return valor ? meta.estadoActivo ?? "critico" : "nominal";
  }

  /*
   * `naturaleza: "mando"` (`CONTROL`, Plan 27 F3), `"consigna"` (los dos
   * set points de `AUTOMATISMO_LLENADO_VACIO/`, Plan 27 F4) y `"crudo"` (los
   * diez registros de `LECTURA_VARIADOR_MODBUS_RTU/`, Plan 27 F4): ninguna es
   * una condición que juzgar. Una orden no es buena ni mala, un set point es
   * una configuración y un registro sin escalar no se puede comparar contra
   * nada hasta que se confirme su divisor — juzgarlo sería inventar la
   * calibración que falta. Las tres comparten el mismo trato: se informa el
   * valor, nunca se pinta una banda sobre él.
   *
   * `soloEnMarcha` SÍ se respeta aquí: varios de los diez crudos del
   * variador (frecuencia, corriente, par…) sólo dicen algo con el motor
   * impulsando, igual que `cargaMotor`.
   */
  if (["mando", "consigna", "crudo"].includes(meta.naturaleza)) {
    if (reposo && meta.soloEnMarcha) return "reposo";
    return valor === null || valor === undefined ? "sin_dato" : "nominal";
  }

  /*
   * `naturaleza: "estado"` (`ESTADO_S1`/`ESTADO_S2`/`ESTADO_BA`, Plan 27 F5):
   * el enumerado de equipo que comparten las cuatro señales `Estado *` del
   * PLC (`Lista-variables.pdf` §1.6) — 1 Apagado, 2 Run, 3 Error,
   * 4 Mantenimiento. A diferencia de `alarma`, aquí la tabla es UNA sola,
   * común a las cuatro, así que se fija aquí y no por señal.
   *
   * `0` es el valor inicial del PLC antes del primer ciclo de la lógica de
   * estados, y el propio PDF avisa: "conviene tratarlo como sin dato y no
   * como apagado". Cualquier otro código fuera de la tabla (no debería
   * salir, pero el servidor no lo garantiza) se trata igual que `0`: no
   * inventar un estado que el programa no ha declarado.
   */
  if (meta.naturaleza === "estado") {
    if (valor === null || valor === undefined) return "sin_dato";
    return ESTADO_EQUIPO[valor] ?? "sin_dato";
  }

  if (meta.tipo === "booleano") {
    return valor === null || valor === undefined ? "sin_dato" : "nominal";
  }

  if (!Number.isFinite(valor)) return "sin_dato";

  // Con el sistema parado, una señal de marcha no dice nada. Evaluarla contra
  // su banda pintaría en rojo una instalación que simplemente está en reposo.
  if (reposo && meta.soloEnMarcha) return "reposo";

  const banda = bandaDe(key, valor);
  return banda ?? "sin_dato";
}
