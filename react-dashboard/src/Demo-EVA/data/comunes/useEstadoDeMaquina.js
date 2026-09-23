/**
 * Los hooks de una máquina CONFIGURADA para las vistas genéricas (Plan 42.5
 * F1): el estado en vivo en la forma común, su búfer de sesión y sus series
 * del historiador. Ninguna vista sabe de dónde salen.
 *
 * ── LA MISMA FUENTE QUE LAS VISTAS DE VIBRACIONES ───────────────────
 *
 * `useDominioVibracion` (`data/vibraciones/vibracion.js`) y estos hooks piden
 * la fuente a `fuenteDeMaquinaConfigurada`, que la cachea por máquina y
 * transporte: Planta, el Detalle y el Inicio de la misma máquina comparten
 * UN motor de sondeo y una petición por ciclo, aunque estén montados a la
 * vez. Es la regla de `sistemas.js` —un motor por máquina— y la razón de que
 * aquí no se abra ningún `pollingEngine`.
 *
 * ── SIN MÁQUINA DELANTE, LA FORMA VACÍA ─────────────────────────────
 *
 * Igual que `useMaquina()`: fuera de una sección de máquina se devuelve una
 * forma con `maquina: null` y `loading: false`, nunca se lanza. Una fuente que
 * no se puede construir (tipo que este programa no conoce) tampoco lanza en el
 * render: viaja en `error`, y la vista lo dice.
 */
import { useEffect, useMemo, useState } from "react";

import { useDataSource } from "@/lib/datasource";

import { fuenteDeMaquinaConfigurada } from "./fuenteDeMaquina.js";
import { useMaquina } from "./MaquinaContext.jsx";
import { VENTANA } from "./historia.js";
import { useSeriesDe } from "./useSeriesDe.js";

const INSTANTANEA_VACIA = Object.freeze({ estado: null, lastUpdated: null, loading: true, error: null });

const SIN_MAQUINA = Object.freeze({
  sistema: null,
  maquina: null,
  estado: null,
  buffer: null,
  lastUpdated: null,
  loading: false,
  error: null,
  fuente: null,
});

/**
 * La fuente de la máquina en contexto para el transporte activo, o `null`.
 * Devuelve también el error de construcción, si lo hubo, en vez de lanzar.
 */
function useFuenteDeMaquina() {
  const { transporte } = useDataSource();
  const { configurada } = useMaquina();

  return useMemo(() => {
    if (!configurada) return { fuente: null, error: null };
    try {
      return { fuente: fuenteDeMaquinaConfigurada(configurada, transporte), error: null };
    } catch (error) {
      return { fuente: null, error };
    }
  }, [configurada, transporte]);
}

/**
 * El estado en vivo de la máquina configurada en contexto.
 *
 * @returns {{
 *   sistema: object|null, maquina: object|null, estado: object|null, buffer: object|null,
 *   lastUpdated: Date|null, loading: boolean, error: Error|null, fuente: object|null,
 * }}
 *   `sistema` es el del registro (`construirSistema`), `maquina` la configuración
 *   cruda (`assets`, `variables`), `estado` la forma común de `estadoMaquina.js`
 *   —`null` hasta la primera lectura— y `buffer` el de sesión, para «Tiempo real».
 */
export function useEstadoDeMaquina() {
  const { configurada } = useMaquina();
  const { fuente, error: errorDeFuente } = useFuenteDeMaquina();
  const [instantanea, setInstantanea] = useState(INSTANTANEA_VACIA);

  useEffect(() => {
    setInstantanea(INSTANTANEA_VACIA);
    if (!fuente) return undefined;
    // La baja SIEMPRE en el return: con el doble montaje de StrictMode, un
    // efecto sin limpieza dejaría un suscriptor huérfano por visita.
    return fuente.subscribe(setInstantanea);
  }, [fuente]);

  if (!configurada) return SIN_MAQUINA;
  if (!fuente) return { ...SIN_MAQUINA, maquina: configurada, error: errorDeFuente };

  return {
    sistema: fuente.sistema,
    maquina: configurada,
    estado: instantanea.estado ?? null,
    buffer: fuente.buffer,
    lastUpdated: instantanea.lastUpdated ?? null,
    loading: instantanea.loading,
    error: instantanea.error ?? null,
    fuente,
  };
}

/**
 * Varias series del historiador de la máquina en contexto, con el contrato de
 * `useSeriesHistoricas` (`porClave`, `metaPorClave`, `filas`, `cobertura`,
 * `hasMore`, `loading`, `error`). Sin máquina delante resuelve vacío.
 */
export function useSeriesDeMaquina(claves, rango = VENTANA) {
  const { fuente } = useFuenteDeMaquina();
  return useSeriesDe(fuente, claves, rango);
}
