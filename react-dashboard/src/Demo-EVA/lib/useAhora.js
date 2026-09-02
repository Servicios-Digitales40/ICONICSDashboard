/**
 * Un reloj compartido: un solo `setInterval` para toda una vista, no uno por
 * fila.
 *
 * ── POR QUÉ HACE FALTA UN RELOJ, Y NO BASTA CON EL SONDEO ────────────
 *
 * `frescuraDe()` (`data/comunes/estadoDelDato.js`) necesita saber cuánto tiempo ha
 * pasado desde la última lectura, y eso puede cambiar SIN que llegue ninguna
 * lectura nueva — es exactamente el caso que le importa: el puente se cae y
 * ningún ciclo de sondeo vuelve a disparar un repintado. Sin un reloj propio,
 * un valor que lleva diez minutos sin refrescarse se seguiría viendo tan
 * fresco como el primer segundo, porque nada obligaría a React a volver a
 * evaluar `frescuraDe()`.
 *
 * ── POR QUÉ UNO SOLO, Y NO EL `useTiempoRelativo` DE `base.jsx` ─────
 *
 * Ese hook ya existe y ya funciona, pero crea su PROPIO temporizador por
 * instancia — correcto para el único sitio donde se usa hoy (`UltimaLectura`,
 * una vez por vista), y exactamente el antipatrón si se repitiera por fila:
 * una rejilla de activos son ocho señales por activo, y ocho temporizadores
 * repintando cada segundo es coste real por algo que un solo reloj, llamado
 * una vez arriba y pasado hacia abajo como prop, resuelve igual de bien.
 *
 * ── POR QUÉ 5 S Y NO 1 S ──────────────────────────────────────────────
 *
 * `UMBRAL_CONGELADO_MS` son 60 000 ms; el otro estado que cambia solo con el
 * reloj es `stale`, que ya lo decide el motor de sondeo, no este hook. Nada
 * de lo que este reloj alimenta necesita notar un cambio con precisión de
 * segundo — sólo necesita, tarde o temprano, cruzar el umbral del minuto. Un
 * tic más lento es menos repintado por el mismo resultado observable.
 */
import { useEffect, useState } from "react";

const INTERVALO_POR_DEFECTO_MS = 5_000;

/** @param {number} [intervaloMs] */
export function useAhora(intervaloMs = INTERVALO_POR_DEFECTO_MS) {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return ahora;
}
