/**
 * Las máquinas CONFIGURADAS que el tablero conoce, leídas una vez por sesión.
 * Plan 37 F1.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────
 *
 * Hasta el Plan 37 una máquina configurada (`datos/maquinas.json`) sólo
 * existía para la pantalla de Configuración. El menú, `useMaquina()` y las
 * vistas sólo conocían el registro escrito a mano (`SISTEMAS`), y nadie
 * llamaba a `registrarSistema()` fuera de las pruebas. Este provider es la
 * pieza que faltaba: trae la lista y la pone al alcance del Shell entero, para
 * que el sidebar derive una sección por máquina y `MaquinaProvider` pueda
 * resolver `?maquina=vib-motor-03` a algo con lo que pintar.
 *
 * ── UNA LECTURA, NO UN SONDEO ─────────────────────────────────────
 *
 * Se pide `/api/maquinas` UNA vez cuando la sesión queda resuelta —antes no
 * hay token y el 401 se leería como sesión inválida— y otra vez cuando la
 * pantalla de Configuración avisa de que guardó o quitó algo
 * (`EVENTO_MAQUINAS_CAMBIARON`). No hay temporizador. Este proyecto ya ha
 * revivido dos veces el sondeo de una máquina desde un componente de chrome
 * (31-08-2026, 17-09-2026), y un provider que envuelve el Shell es el sitio
 * donde más caro sale ese error.
 *
 * ── LO QUE ENSEÑA Y LO QUE NO ─────────────────────────────────────
 *
 * Sólo las máquinas ACTIVAS: una desactivada (`activa: false`, por tener
 * casos previos que la nombran) no se ofrece en el menú, aunque siga en disco.
 * Un fallo al leer deja la lista vacía y el error a la vista de quien quiera
 * pintarlo; nunca inventa una lista ni bloquea el tablero: las máquinas
 * escritas a mano siguen funcionando sin esto.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { listarMaquinas } from "@/lib/api/maquinasApi.js";
import { useSesionResuelta } from "@/app/providers/SesionProvider.jsx";

/** Lo dispara la pantalla de Configuración al guardar o quitar una máquina. */
export const EVENTO_MAQUINAS_CAMBIARON = "eva:maquinas-cambiaron";

export function avisarMaquinasCambiaron() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_MAQUINAS_CAMBIARON));
}

const VACIO = Object.freeze({ maquinas: [], cargando: false, error: null, recargar: () => {} });

const Ctx = createContext(null);

export function MaquinasConfiguradasProvider({ children }) {
  const sesionResuelta = useSesionResuelta();
  const [estado, setEstado] = useState({ maquinas: [], cargando: false, error: null });

  const recargar = useCallback(async () => {
    setEstado((prev) => ({ ...prev, cargando: true }));
    try {
      const r = await listarMaquinas();
      const activas = (r?.maquinas ?? []).filter((m) => m && m.activa !== false);
      setEstado({ maquinas: activas, cargando: false, error: null });
    } catch (error) {
      /* Sin lista no hay secciones de máquina configurada; las escritas a
         mano siguen. El error queda para quien quiera decirlo. */
      setEstado({ maquinas: [], cargando: false, error });
    }
  }, []);

  /* Una vez, al tener sesión. Antes, el 401 se leería como sesión inválida. */
  useEffect(() => {
    if (sesionResuelta) recargar();
  }, [sesionResuelta, recargar]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const alCambiar = () => recargar();
    window.addEventListener(EVENTO_MAQUINAS_CAMBIARON, alCambiar);
    return () => window.removeEventListener(EVENTO_MAQUINAS_CAMBIARON, alCambiar);
  }, [recargar]);

  const valor = useMemo(() => ({ ...estado, recargar }), [estado, recargar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Las máquinas configuradas activas. Fuera del provider devuelve la forma
 * vacía en vez de lanzar: una vista en una prueba aislada no debería reventar
 * por preguntar algo que simplemente no aplica.
 */
export function useMaquinasConfiguradas() {
  return useContext(Ctx) ?? VACIO;
}
