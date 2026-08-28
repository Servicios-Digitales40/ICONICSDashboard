/**
 * El simulador de Demo EVA: una instalación de agua entera, sin servidor y sin
 * red.
 *
 * Cumple la misma firma que el transporte real —`read(pointNames)`— más un
 * `readSerie()` que sustituye al historiador, y con eso el interruptor de origen
 * del Topbar sirve también esta sección. Ver docs/PLAN-9-SIMULADOR-EVA.md.
 *
 * ── QUÉ QUEDA AQUÍ DESPUÉS DE GENERALIZAR EL TRANSPORTE ────────────
 *
 * El `read()` ya no se escribe aquí: la mecánica —latencia, huecos, calidad
 * mala, no finitos, el `Map` de salida— es de `lib/iconics/transporteSimulado.js`,
 * que no conoce ninguna instalación y recibe la física por parámetro. Lo que
 * este archivo aporta a esa lectura es una sola línea: `modelo: valorDePunto`.
 *
 * Lo que NO se pudo generalizar es `readSerie()`, y no por falta de ganas: el
 * historiador de esta instalación tiene reglas suyas —qué señales tienen serie
 * propia, cómo se resuelve un rango, dónde recorta— que la máquina de
 * vibraciones directamente no tiene, porque no tiene historia. Generalizar eso
 * con un solo ejemplo sería inventarse el contrato de la segunda.
 *
 * ── POR QUÉ VIVE AQUÍ Y NO EN `lib/iconics/` ───────────────────────
 *
 * Porque `lib/` es infraestructura compartida y no debe conocer ninguna
 * instalación. Un simulador allí tendría que importar `domain/senales.js` para
 * saber qué puntos generar, invirtiendo la dependencia y rompiendo desde fuera
 * el pacto de que ese archivo es **el único de Demo EVA con nombres de tag**.
 * Lo que sí es compartido —la firma `read` y los presets de caos— vive en
 * `lib/iconics/`; lo que sabe de agua, aquí.
 *
 * ── EL MODELO FÍSICO VIVE EN `shared/eva/simulador.js` ─────────────
 *
 * `valorEn`, `mediaDelTramo`, `enMarcha`, `faseCiclo` y `eventoDe` son la
 * MISMA función pura que usa el transporte falso del backend
 * (`ICONICS_FAKE=true`, Plan 14 §7.1): dos programas sirviendo el mismo reloj
 * de pared tienen que ver la misma instalación, y repetirla a mano en los dos
 * lados es exactamente el tipo de duplicado que un día diverge en silencio.
 * Este archivo se queda con el TRANSPORTE —cómo se sirve, con qué caos, con
 * qué firma— y `shared/eva/simulador.js` con la señal.
 *
 * No hay `Math.random()` en ninguna señal: es pura. Tres propiedades salen
 * gratis de ahí y las tres importan:
 *
 *  - La serie histórica **empalma** con el valor en vivo, porque las dos salen
 *    de la misma función. Con ruido aleatorio, la gráfica terminaría en un punto
 *    y la tarjeta enseñaría otro.
 *  - Recargar la página no da un salto.
 *  - Dos navegadores abiertos a la vez enseñan lo mismo.
 *
 * Lo único aleatorio es el CAOS —huecos, mala calidad, fallos de petición—, y
 * ahí la aleatoriedad es el punto: un hueco es un suceso pasajero, no una
 * propiedad de la línea de tiempo.
 */
import { CAOS_SUAVE, createTransporteSimulado } from "@/lib/iconics";
import {
  CICLO_MS, JORNADA_MS, enMarcha, eventoDe, faseCiclo, mediaDelTramo, valorDePunto, valorEn,
} from "@shared/eva/simulador.js";

import { esHistorizada, senalInfo } from "../domain/senales.js";
import { MAX_PUNTOS, SIN_SERIE, VENTANA } from "./historia.js";

export { CICLO_MS, JORNADA_MS, enMarcha, eventoDe, faseCiclo, mediaDelTramo, valorEn };

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── El transporte ──────────────────────────────────────────────── */

/**
 * Transporte simulado para el árbol de Demo EVA.
 *
 * `ahora` y `rnd` se inyectan para poder fijar el reloj y el azar en las
 * pruebas; en la aplicación son el reloj del sistema y `Math.random`.
 */
export function createTransporteEva({
  chaos = CAOS_SUAVE,
  ahora = () => Date.now(),
  rnd = Math.random,
} = {}) {
  /**
   * Lectura en lote: la mecánica es de `createTransporteSimulado` y lo único
   * que pone esta sección es su física.
   *
   * Un punto que no sea de este árbol se ignora en silencio, igual que hace el
   * transporte real con los que el servidor no tiene: para el motor eso es un
   * hueco, que es exactamente lo que es.
   */
  const { read } = createTransporteSimulado({
    modelo: valorDePunto,
    chaos,
    ahora,
    rnd,
    etiqueta: "simulador EVA",
  });

  /**
   * `{ horas, puntos }` (relativo a `ahora()`) o `{ inicio, fin }` (rango
   * absoluto, los presets del selector o el calendario personalizado) → el
   * cierre y el paso de la rejilla que arma `readSerie`.
   *
   * Repite la misma distinción que `resolverRango` de `data/historia.js` —el
   * lector real—: sin ella, un rango absoluto se destructuraría en
   * `{horas: undefined, puntos: undefined}` y el simulador serviría siempre
   * la ventana de 6 h por defecto, **en silencio**, mientras el historiador
   * real sí obedeciera el rango. La demo se rompería exactamente donde nadie
   * la mira: en el origen Simulado.
   */
  function resolverRangoSimulado(rango) {
    if (rango?.inicio instanceof Date && rango?.fin instanceof Date) {
      const finMs = rango.fin.getTime();
      const inicioMs = rango.inicio.getTime();
      return { finMs, pasoMs: (finMs - inicioMs) / MAX_PUNTOS, n: MAX_PUNTOS };
    }
    const h = rango?.horas ?? VENTANA.horas;
    const n = rango?.puntos ?? VENTANA.puntos;
    return { finMs: ahora(), pasoMs: (h * 3_600_000) / n, n };
  }

  /**
   * Serie histórica, en el lugar del historiador.
   *
   * **Repite la guarda de `data/historia.js` a propósito.** Cuatro de las ocho
   * señales no tienen serie propia en el servidor real, y la interfaz está
   * construida sobre ese hecho: la banda de KPIs son las cuatro historizadas y la
   * carga del motor se alimenta del búfer de sesión porque no puede pedir serie.
   * Un simulador que devolviera ocho series enseñaría a la pantalla una
   * instalación que no existe, y se rompería al volver a datos reales.
   *
   * Devuelve `{ datos, motivo, hasMore }` con la misma forma que el lector
   * real: `datos` son `[{ t: Date, valor }]`, `motivo` es un texto cuando no
   * hay serie que pedir (nunca las dos cosas a la vez), y `hasMore` siempre
   * es `false` — el simulador genera exactamente los puntos que se le piden,
   * nunca recorta de más como podría hacer el servidor real.
   */
  async function readSerie(clave, rango = VENTANA) {
    if (!senalInfo(clave)) return { datos: [], motivo: `Señal desconocida: ${clave}`, hasMore: false };
    if (!esHistorizada(clave)) return { datos: [], motivo: SIN_SERIE, hasMore: false };

    if (chaos.latenciaMs > 0) await espera(chaos.latenciaMs);

    // Mismo `errorPeticion` que `read()`, aplicado al historiador. Antes SÓLO
    // el sondeo en vivo podía fallar en este simulador: con el caos alto se
    // veía un tile en gris pero la gráfica de al lado seguía respondiendo
    // siempre, algo que el servidor real no promete. Sin esto no había forma
    // de ensayar "sin conexión" en una gráfica de historia sin desenchufar el
    // puente de verdad.
    if (rnd() < chaos.errorPeticion) {
      throw new Error("simulador EVA: fallo simulado de la petición al historiador");
    }

    const { finMs: fin, pasoMs, n } = resolverRangoSimulado(rango);
    const datos = [];

    for (let i = n - 1; i >= 0; i--) {
      const cierre = fin - i * pasoMs;

      // El historiador real también deja tramos sin muestra, y `normalizar` los
      // descarta. Aquí se reproduce el hueco para que la gráfica se escriba
      // sabiendo que la rejilla puede venir incompleta.
      if (rnd() < chaos.ausente) continue;

      datos.push({ t: new Date(cierre), valor: mediaDelTramo(clave, cierre - pasoMs, cierre) });
    }

    return { datos, motivo: null, hasMore: false };
  }

  return { read, readSerie };
}
