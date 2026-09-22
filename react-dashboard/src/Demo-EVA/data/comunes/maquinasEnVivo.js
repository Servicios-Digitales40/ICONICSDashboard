/**
 * Todas las máquinas configuradas ACTIVAS, en vivo, para el chrome de planta.
 *
 * ── POR QUÉ EXISTE (Plan 40 F2) ────────────────────────────────────
 *
 * Tres piezas montadas fuera de la sección de una máquina necesitan saber de
 * TODAS: el badge del sidebar (cuántos hallazgos pendientes hay), el muro de
 * planta (un panel por máquina) y la bandeja de hallazgos cuando se abre sin
 * máquina delante. Hasta hoy las tres leían la máquina de vibraciones escrita
 * a mano con `useVibracion()`, y la razón para no hacerlas «por máquina» era
 * que un hook de chrome que cambiara con la navegación abriría el motor de
 * cada máquina al pasar por su sección (la regresión del 31-08 y del 17-09).
 *
 * Esto es lo contrario: NO cambia con la navegación. Se suscribe a la fuente
 * de cada configurada activa una vez, y las fuentes tienen conteo de
 * referencias, así que la sección de esa máquina, cuando está abierta,
 * comparte el motor en vez de abrir otro. Con una o dos máquinas es lo que
 * ya había; con veinte habrá que medirlo (Plan 40 §2 D4).
 *
 * ── QUÉ DEVUELVE ───────────────────────────────────────────────────
 *
 * Una entrada por máquina: su configuración, su tipo, su último estado en
 * vivo (la forma que publica `createFuenteDeMaquina`) y sus riesgos, ya
 * evaluados con las reglas de su tipo. Una máquina cuyo tipo no sabe evaluar
 * trae `riesgos.activos` vacío y `evaluadas: 0`, que es distinto de «sin
 * riesgos».
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useTransporteActual } from "@/lib/datasource";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { fuenteDeMaquinaConfigurada } from "./fuenteDeMaquina.js";
import { useMaquinasConfiguradas } from "./MaquinasConfiguradas.jsx";

const VACIO = Object.freeze({
  canales: {},
  variador: {},
  alarmas: {},
  loading: true,
  error: null,
  lastUpdated: null,
  puntosSinDato: [],
  puntosPedidos: 0,
});

const SIN_RIESGOS = Object.freeze({ activos: [], noEvaluables: [], evaluadas: 0 });

/**
 * @returns {{ maquina: object, tipo: object|null, estado: object, riesgos: object }[]}
 */
export function useMaquinasEnVivo() {
  const { maquinas } = useMaquinasConfiguradas();
  /* Tolerante: este hook vive en el chrome, que se monta también sin proveedor. */
  const transporte = useTransporteActual();
  const [estados, setEstados] = useState({});

  /*
   * La suscripción se rehace por IDENTIDAD de las máquinas —qué ids, con qué
   * revisión—, no por identidad del array. Un array nuevo con las mismas
   * máquinas (un provider que lo recompone, un doble de prueba) volvería a
   * suscribir; y como la fuente entrega la primera instantánea en el acto,
   * cada suscripción provoca un render, cada render un array nuevo, y el bucle
   * no acaba: se vio como un worker de vitest sin memoria (22-09-2026).
   */
  const clave = maquinas.map((m) => `${m.id}|${m.revisada ?? ""}|${(m.variables ?? []).length}`).join(";");
  const refMaquinas = useRef(maquinas);
  refMaquinas.current = maquinas;

  useEffect(() => {
    setEstados({});
    const bajas = refMaquinas.current.map((m) =>
      fuenteDeMaquinaConfigurada(m, transporte).subscribeVibracion((estado) =>
        setEstados((prev) => ({ ...prev, [m.id]: estado })),
      ),
    );
    /* La baja va SIEMPRE en el return: con el doble montaje de StrictMode, un
       efecto sin limpieza dejaría una referencia huérfana por máquina. */
    return () => bajas.forEach((baja) => baja());
  }, [clave, transporte]);

  return useMemo(
    () =>
      maquinas.map((maquina) => {
        const tipo = tipoDe(maquina.tipo);
        const estado = estados[maquina.id] ?? VACIO;
        const riesgos = tipo?.evaluarRiesgos
          ? tipo.evaluarRiesgos({ canales: estado.canales, variador: estado.variador, alarmas: estado.alarmas })
          : SIN_RIESGOS;
        return { maquina, tipo, estado, riesgos };
      }),
    [maquinas, estados],
  );
}
