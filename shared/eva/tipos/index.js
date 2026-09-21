/**
 * El índice de TIPOS de máquina — Plan 33 F1.
 *
 * ── QUÉ ES UN TIPO Y EN QUÉ SE DIFERENCIA DE UN SISTEMA ────────────
 *
 * Tres palabras que se parecen y no se pueden intercambiar. Las dos primeras
 * ya están en `CLAUDE.md` §4.7; ésta es la tercera:
 *
 *   MÓDULO   agrupación por FUENTE de datos (`shared/modulos.js`).
 *            Hoy `monitoreo` (ICONICS) y `prediccion` (API externa).
 *   SISTEMA  una MÁQUINA concreta de planta (`comun/sistemas.js`).
 *            Hoy `tanque` y `vibraciones`.
 *   TIPO     de qué CLASE es una máquina. Sus reglas, su física, su norma.
 *            Hoy `vibraciones`.
 *
 * La diferencia entre SISTEMA y TIPO es la que abre esta fase: el sistema
 * `vibraciones` es el motor que hay montado —con su raíz `ac:TDCON/DEMO_VIBRACIONES/Vibraciones/`
 * y sus sensibilidades de 100,05 / 99 / 100 mV/g—; el tipo `vibraciones` es lo
 * que sabríamos hacer con CUALQUIER motor vigilado por un SM 1281.
 *
 * Hoy los dos se llaman igual porque hay una máquina de cada tipo. En cuanto
 * haya un segundo motor, el tipo será uno y los sistemas dos — que es
 * exactamente lo que esta fase existe para permitir.
 *
 * ── POR QUÉ UN ÍNDICE Y NO IMPORTAR EL TIPO DIRECTAMENTE ───────────
 *
 * Por el mismo motivo que `sistemas.js` existe habiendo dos máquinas: el que
 * sabe qué tipos hay acaba siendo un `if` repetido en cinco archivos, y el
 * quinto siempre se olvida. Con esto, `tipoDe(id)` es la única pregunta.
 *
 * ── LO QUE ESTE ÍNDICE NO HACE ─────────────────────────────────────
 *
 * No construye máquinas y no lee disco. Un tipo es código; una máquina es
 * configuración (Plan 33 §6, D2). Este archivo sólo enumera los tipos que el
 * programa sabe interpretar.
 *
 * Y hoy no lo consume nadie salvo sus pruebas: F1 es una extracción, y una
 * extracción que cambia el comportamiento no se distingue de una regresión.
 */
import { TIPO_VIBRACIONES } from "./vibraciones.js";

/**
 * Los tipos que este programa sabe interpretar.
 *
 * `estacionLlenado` NO está, y su ausencia es deliberada: extraerlo exigiría
 * tocar el código del tanque, que la rama `Vibraciones1.0` prohíbe
 * (`CLAUDE.md` §1, regla 1). Entra en la F9 del Plan 33, detrás de la
 * reapertura. Mientras tanto, el tanque sigue funcionando como siempre: su
 * entrada de `SISTEMAS` está escrita a mano y no necesita tipo.
 */
export const TIPOS = Object.freeze([TIPO_VIBRACIONES]);

/** Tipo por id. */
export const TIPO = Object.freeze(Object.fromEntries(TIPOS.map((t) => [t.id, t])));

/** Ids de los tipos declarados. */
export const TIPO_IDS = Object.freeze(TIPOS.map((t) => t.id));

/**
 * Un tipo por su id, o `null`.
 *
 * Devuelve `null` y no lanza porque quien pregunta puede estar validando una
 * configuración que trae un tipo que ya no existe — y eso es un error DE ESA
 * configuración, que hay que poder contar con su nombre, no una excepción que
 * tumbe el arranque. La distinción es la misma que `sistemaDePunto()` hace con
 * un punto desconocido.
 */
export const tipoDe = (id) => TIPO[String(id ?? "").trim()] ?? null;

/**
 * Resumen de los tipos, para enumerarlos sin arrastrar reglas ni funciones.
 *
 * Lo que viaja son datos: la vista de configuración necesita pintar la lista
 * de tipos elegibles, y mandarle las 18 reglas de cada uno por HTTP sería
 * mandar código serializado que nadie va a ejecutar allí.
 */
export function resumenDeTipos() {
  return TIPOS.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    descripcion: t.descripcion,
    reglas: t.reglas.length,
    rolesRequeridos: t.rolesRequeridos,
    capacidadesPosibles: t.capacidadesPosibles,
  }));
}

/**
 * Comprobaciones al cargar el índice.
 *
 * LANZAN, igual que `validarRegistro()` en `sistemas.js` y por el mismo
 * motivo: un tipo mal declarado no da un error visible más adelante, da una
 * máquina que se configura «bien» y diagnostica con reglas que nunca se
 * evalúan. Es mejor que el proceso no arranque.
 */
function validarTipos() {
  const vistos = new Set();

  for (const t of TIPOS) {
    if (!t.id) throw new Error("tipos/index.js: hay un tipo sin id.");
    if (vistos.has(t.id)) throw new Error(`tipos/index.js: el id «${t.id}» está dos veces.`);
    vistos.add(t.id);

    const falta = [
      "nombre", "roles", "rolesRequeridos", "reglas", "evaluarRiesgos", "estado", "resumen",
    ].filter((campo) => t[campo] === undefined || t[campo] === null);

    if (falta.length) {
      throw new Error(`tipos/index.js: «${t.id}» no declara ${falta.join(", ")}`);
    }

    if (!t.reglas.length) {
      throw new Error(
        `tipos/index.js: «${t.id}» no declara ninguna regla. Un tipo sin reglas produce ` +
          "máquinas que se dan de alta como diagnosticables y nunca dicen nada.",
      );
    }

    /*
     * Que cada rol requerido EXISTA entre los roles del tipo. Sin esto, un
     * `necesita` mal escrito en una regla se convierte en un requisito que
     * ninguna configuración puede cumplir, y la máquina quedaría para siempre
     * incompleta sin que el mensaje dijera por qué.
     */
    for (const rol of t.rolesRequeridos) {
      if (!t.roles[rol]) {
        throw new Error(
          `tipos/index.js: «${t.id}» exige el rol «${rol}», que no está entre los que declara.`,
        );
      }
    }
  }
}

validarTipos();
