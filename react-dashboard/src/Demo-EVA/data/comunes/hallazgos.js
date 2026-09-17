/**
 * Cuántos hallazgos hay pendientes, para el badge del sidebar — Plan 31 F1.
 *
 * ── POR QUÉ ESTO NO SALE A LA RED, Y POR QUÉ IMPORTA ────────────────
 *
 * Porque cuenta lo que YA está calculado. `evaluarRiesgos()` y
 * `evaluarRiesgosVibracion()` son funciones puras de `shared/eva/` sobre el
 * snapshot que los dos sondeos ya traen para pintar sus pantallas: contar sus
 * activos no añade ni una petición.
 *
 * Es la única forma en que un contador puede vivir en el chrome de la
 * aplicación. El precedente está escrito en `routes.jsx`: el botón de campana
 * del Topbar lleva retirado desde el 31-08-2026 porque *«sondeaba el conteo de
 * eventos cada 30 s en TODAS las pantallas»*, y la nota que dejaron al quitarlo
 * describe exactamente esto — *«un contador que tuviera sentido leería el
 * sistema en vivo»*. Un badge que sale a la red desde el sidebar está en todas
 * las pantallas por definición, así que el coste se multiplica por cada
 * pantalla que nadie estaba mirando.
 *
 * Si alguien vuelve por aquí con la idea de «ya que estamos, que el badge traiga
 * también el diagnóstico»: eso sí sale a la red, una llamada por riesgo activo,
 * y desde el sidebar se pagaría en todas las pantallas. El diagnóstico se pide
 * al ABRIR la Bandeja (Plan 31 §2.3), donde hay alguien mirándolo.
 *
 * ── QUÉ CUENTA, Y QUÉ NO PROMETE ────────────────────────────────────
 *
 * Cuenta HALLAZGOS —riesgos activos, descontando los ya descartados—, no
 * diagnósticos. La diferencia no es de matiz: los diagnósticos no existen
 * hasta que alguien abre la vista, así que un badge que dijera «3
 * diagnósticos» estaría prometiendo un trabajo que nadie ha hecho (§2.4, la
 * ausencia de dato no se disfraza).
 *
 * Los casos similares tampoco entran, y por el mismo motivo: llegan con el
 * diagnóstico, o sea después. El número del badge es por tanto un SUELO del
 * que verá quien abra la Bandeja, nunca un techo — y eso es lo correcto para
 * invitar a mirar.
 *
 * ── POR QUÉ LEE `vistoPorMi` Y NO CUENTA A SECAS ────────────────────
 *
 * Porque un badge que sigue marcando lo que ya descartaste deja de significar
 * nada a los dos días. Se lee la MISMA clave que usa la Bandeja
 * (`eva:hallazgos`), no una copia, para que descartar en una apague el número
 * en la otra.
 */
import { useMemo, useSyncExternalStore } from "react";

import { crearVistoPorMi } from "@/lib/vistoPorMi.js";
import { hallazgoDeRiesgo } from "@shared/eva/comun/hallazgos.js";

/* Cerrados con la estación de llenado (rama `Vibraciones1.0`) — ver el bloque
   de `useConteoHallazgos`:
   import { evaluarRiesgos } from "../../domain/riesgos.js";
   import { useSistemaAgua } from "./hooks.js"; */
import { evaluarRiesgosVibracion } from "../../domain/riesgosVibracion.js";
import { useVibracion } from "../vibraciones/vibracion.js";

/**
 * La misma clave que `BandejaEva`, a propósito.
 *
 * `crearVistoPorMi` devuelve una vista sobre `localStorage`, no un estado
 * propio, así que dos instancias sobre la misma clave leen lo mismo. Compartir
 * la clave es lo que hace que descartar en la Bandeja apague el badge.
 */
const vistoPorMi = crearVistoPorMi("eva:hallazgos");

/**
 * Cuántos hallazgos pendientes hay ahora mismo.
 *
 * `useSyncExternalStore` sobre el evento `storage` y no un `useState`: el
 * badge vive en el sidebar y la Bandeja en el área de contenido, dos árboles
 * que no comparten estado. Sin esto, descartar un hallazgo dejaría el badge
 * marcando hasta la siguiente recarga.
 *
 * @returns {{ total: number, porSistema: { tanque: number, vibraciones: number } }}
 */
export function useConteoHallazgos() {
  /*
   * ── SÓLO VIBRACIONES (rama `Vibraciones1.0`, 17-09-2026) ───────────
   *
   * Esto contaba las dos máquinas, y por eso `useSistemaAgua()` estaba aquí.
   * El problema no era el conteo: este hook lo usa el BADGE DEL SIDEBAR, que
   * está montado en todas las pantallas, y `subscribeSistema` arranca el motor
   * de sondeo por conteo de referencias (`evaSource.js`).
   *
   * O sea que el badge —escrito para NO añadir peticiones, y con una prueba
   * que lo comprueba— mantenía vivo el sondeo del tanque en todas las
   * pantallas de vibraciones. Su prueba seguía en verde porque cuenta `fetch`
   * en el propio badge, no las suscripciones que abre.
   *
   * Con la estación de llenado cerrada, contar sus riesgos sería además
   * mentir: son riesgos de una máquina que nadie está mirando.
   *
   * Para reabrir: descomentar `useSistemaAgua` y su `evaluarRiesgos`, y sumar
   * `tanque` en el `useMemo` de abajo.
   */
  const { canales, variador, alarmas } = useVibracion();

  const descartados = useSyncExternalStore(suscribirseADescartes, leerDescartes, leerDescartes);

  const { activos: activosVibracion } = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas]
  );

  return useMemo(() => {
    /*
     * El id se construye con `hallazgoDeRiesgo`, no a mano: si algún día cambia
     * la forma del id, un conteo que lo escribiera aquí dejaría de encontrar los
     * descartes en silencio — y un badge que no baja nunca es peor que ninguno.
     */
    const pendientes = (sistema, activos) =>
      activos.filter((r) => !descartados.has(hallazgoDeRiesgo(sistema, r).id)).length;

    const vibraciones = pendientes("vibraciones", activosVibracion);

    /*
     * `porSistema` conserva `tanque: 0` en vez de quitar la clave: quien lea
     * esto tiene que poder distinguir «esa máquina no tiene hallazgos» de
     * «esta versión no la cuenta». Con la estación cerrada es lo primero por
     * construcción, y decirlo explícitamente es lo que pide §2.4.
     */
    return { total: vibraciones, porSistema: { tanque: 0, vibraciones } };
  }, [activosVibracion, descartados]);
}

/*
 * ── EL CACHÉ DE `leerDescartes`, Y POR QUÉ HACE FALTA ───────────────
 *
 * `useSyncExternalStore` compara el resultado de `getSnapshot()` por identidad
 * y vuelve a renderizar si cambió. `vistoPorMi.leer()` construye un `Set`
 * nuevo en cada llamada, así que devolverlo tal cual sería un objeto distinto
 * cada vez: React lo vería como un cambio en cada render y entraría en bucle
 * infinito. Se guarda el último y sólo se sustituye cuando el CONTENIDO
 * cambió de verdad.
 */
let cache = null;

function leerDescartes() {
  const actual = vistoPorMi.leer();
  if (cache && cache.size === actual.size && [...actual].every((id) => cache.has(id))) {
    return cache;
  }
  cache = actual;
  return cache;
}

function suscribirseADescartes(alCambiar) {
  /*
   * `storage` sólo se dispara entre PESTAÑAS, no dentro de la que escribió —
   * es del estándar, no un fallo. Para el caso que importa (descartar en la
   * Bandeja, que está en esta misma pestaña) `vistoPorMi` avisa por su cuenta;
   * el `storage` cubre la segunda pantalla abierta en el mismo puesto, que en
   * planta pasa.
   */
  const alEscribirOtraPestana = (evento) => {
    if (evento.key === null || evento.key === vistoPorMi.clave) alCambiar();
  };
  window.addEventListener("storage", alEscribirOtraPestana);
  const baja = vistoPorMi.suscribir?.(alCambiar);

  return () => {
    window.removeEventListener("storage", alEscribirOtraPestana);
    baja?.();
  };
}
