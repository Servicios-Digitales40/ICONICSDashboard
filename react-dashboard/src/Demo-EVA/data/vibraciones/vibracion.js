/**
 * Lectura en vivo de LA MÁQUINA DE VIBRACIONES DE LA PANTALLA.
 *
 * ── LO QUE ESTE ARCHIVO FUE, Y LO QUE ES DESDE EL PLAN 40 ─────────
 *
 * Nació para la máquina de vibraciones escrita a mano: su propio motor de
 * sondeo sobre los veintiún puntos del catálogo, separado del tanque para que
 * las dos series no acabaran en el mismo búfer (`NO_COMPARTEN`). Desde el
 * Plan 21 F2 compartía el MOTOR con el tanque (`pollingEngine.js`) pero no el
 * lote; desde el Plan 37 F2 aprendió a servir también a una máquina
 * CONFIGURADA del mismo tipo (`?maquina=<id>`).
 *
 * El Plan 40 retira la máquina escrita a mano: toda máquina de vibraciones es
 * una configurada, construida desde `datos/maquinas.json` con el tipo. Así que
 * aquí queda sólo el hook de la máquina de la pantalla, y la fuente es siempre
 * `fuenteDeMaquinaConfigurada`. `useVibracion()` —la escrita a mano, montada
 * en el chrome— desaparece; lo que el chrome necesita de TODAS las máquinas lo
 * da `useMaquinasEnVivo()` en `comunes/maquinasEnVivo.js`.
 *
 * ── POR QUÉ SE SONDEA Y NO SE PIDE UNA VEZ ─────────────────────────
 *
 * Porque estos puntos se apagan. El 26-08-2026, a las 13:10:31, quince de
 * veintiún puntos dejaron de entregar valor de golpe: se quedaron con la marca
 * de tiempo congelada y una calidad sin dato. Los que siguieron vivos eran
 * `aRMS` y `aPeak`, que se miden sin conocer la velocidad; los que murieron
 * incluían todos los `vRMS` —que necesitan la velocidad para integrar la
 * aceleración— y el variador entero. Una pantalla que hubiera leído una sola
 * vez a las 13:05 seguiría enseñando aquellos números como si fueran de ahora.
 *
 * ── POR QUÉ OBEDECE AL INTERRUPTOR DE ORIGEN ───────────────────────
 *
 * La decisión NO se toma en este archivo: sale de `useDataSource()`, el mismo
 * provider que manda sobre el resto de la aplicación. Con el origen en
 * «Simulado», la fuente de la configurada simula con la física de su TIPO
 * (Plan 40 F0), no se niega.
 */
import { useEffect, useMemo, useState } from "react";

import { useDataSource } from "@/lib/datasource";

import { fuenteDeMaquinaConfigurada } from "../comunes/fuenteDeMaquina.js";
import { useMaquina } from "../comunes/MaquinaContext.jsx";

const VACIO = {
  canales: {},
  variador: {},
  alarmas: {},
  loading: true,
  error: null,
  lastUpdated: null,
  puntosSinDato: [],
};

/** Sin máquina delante no hay nada que leer, y se dice con la misma forma. */
const SIN_MAQUINA = Object.freeze({ ...VACIO, loading: false, canalesMeta: [], maquina: null });

/**
 * El dominio de vibración DE LA MÁQUINA DE LA PANTALLA.
 *
 * Mira `useMaquina()`: si la pantalla es de una máquina configurada
 * (`?maquina=<id>`, o una ruta `maq-*`), abre su fuente —un motor sobre sus
 * variables, `dominioDesdeRoles` como forma— y devuelve el estado con
 * `canalesMeta` (sus apoyos, con su rótulo) y `maquina` (id, nombre, área).
 * Sin máquina delante devuelve la forma vacía con `maquina: null`: una vista
 * de planta que lo llame tiene que mirar eso antes de leer nada.
 *
 * La meta de la máquina va SIEMPRE, también en el primer render: la
 * configurada la trae en cada instantánea, pero el estado inicial es `VACIO`
 * y no la tiene. Lo destapó el usuario al abrir la sección el 21-09-2026.
 *
 * Las vistas que lo llaman —Inicio, Gráficas, Vista 3D, Riesgos, Hallazgos,
 * Avisos, Cierre— comparten un motor por máquina: el conteo de referencias
 * hace que dos montadas a la vez sigan siendo UNA petición por ciclo.
 */
export function useDominioVibracion() {
  const [estado, setEstado] = useState(VACIO);
  const { transporte } = useDataSource();
  const { configurada } = useMaquina();

  const fuente = useMemo(
    () => (configurada ? fuenteDeMaquinaConfigurada(configurada, transporte) : null),
    [configurada, transporte],
  );

  useEffect(() => {
    setEstado(VACIO);
    if (!fuente) return undefined;
    /* La baja va SIEMPRE en el return: con el doble montaje de StrictMode, un
       efecto sin limpieza dejaría una referencia huérfana en cada visita y el
       motor seguiría sondeando puntos que ya no mira nadie. */
    return fuente.subscribeVibracion(setEstado);
  }, [fuente]);

  if (!configurada) return SIN_MAQUINA;
  return {
    ...estado,
    canalesMeta: estado.canalesMeta ?? [],
    maquina: estado.maquina ?? {
      id: configurada.id,
      nombre: configurada.nombre ?? configurada.id,
      configurada: true,
      area: configurada.arboles?.alarmas ?? null,
    },
  };
}
