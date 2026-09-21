/**
 * El árbol de ICONICS tal como se ha podido LEER, rama a rama. Plan 36 F1.
 *
 * ── QUÉ ES, Y QUÉ NO ───────────────────────────────────────────────
 *
 * Una caché de `browse` por carpeta, con tres estados por rama que desde
 * fuera se ven igual —«no hay hijos que pintar»— y significan cosas
 * distintas:
 *
 *   sin entrada        nadie la ha pedido todavía
 *   `hijos: null`      se pidió y FALLÓ (red, 500, rama inexistente)
 *   `hijos: []`        se pidió y está vacía
 *
 * La distinción es la misma que `recorrer()` hace en el backend y que
 * `compararConArbol` necesita para no dar por ausente una variable cuya
 * carpeta no se pudo mirar (`UNKNOWN` ≠ `INVALID`, Plan 33). Colapsarlas
 * aquí las colapsaría en todo lo que se construye encima.
 *
 * ── POR QUÉ ES UN HOOK PROPIO Y NO `useQuery` COMO `ExploradorAssets` ─
 *
 * Porque la pantalla de configuración necesita el árbol COMO DATO —recorrer
 * lo leído para contar hojas, marcar una carpeta entera, comparar con una
 * máquina guardada— y no sólo pintarlo nodo a nodo. Con una query por nodo
 * ese dato estaría repartido en decenas de cachés que ningún componente
 * puede leer juntas. Aquí vive en un solo `Map`, y `hojasBajo()` del dominio
 * lo recorre sin saber de React.
 *
 * ── LO QUE NO HACE ─────────────────────────────────────────────────
 *
 * No sondea nada. Una lectura de `browse` es una petición al abrir o marcar
 * una rama, no un sondeo periódico, y esta pantalla no suscribe ninguna
 * máquina (ver la cabecera de `ConfiguracionPlanta.jsx`).
 */
import { useCallback, useMemo, useRef, useState } from "react";

import { browseIconics } from "@/lib/iconics";
import { esCarpetaEnVivo, esCarpetaHistorica, esNodoDeSistema } from "@shared/eva/comun/arbolIconics.js";

/** ¿Es una carpeta en cualquiera de los dos árboles con niveles? */
const esCarpeta = (pointName) => esCarpetaEnVivo(pointName) || esCarpetaHistorica(pointName);

/** De carpeta → `{hijos, error}` a carpeta → `hijos | null`, que es lo que lee el dominio. */
const soloHijos = (ramas) => new Map([...ramas].map(([carpeta, entrada]) => [carpeta, entrada.hijos]));

export function useArbolIconics({ explorar = browseIconics } = {}) {
  /*
   * `Map` de carpeta → `{ hijos, error }`. Se guarda en estado para que la
   * pantalla se repinte al llegar cada rama, y en un `ref` espejo para que
   * las cargas en cadena (marcar una carpeta con subcarpetas) lean lo último
   * sin esperar al siguiente render.
   */
  const [ramas, setRamas] = useState(() => new Map());
  const ramasRef = useRef(ramas);
  const [cargando, setCargando] = useState(() => new Set());

  const anotar = useCallback((carpeta, entrada) => {
    const siguiente = new Map(ramasRef.current);
    siguiente.set(carpeta, entrada);
    ramasRef.current = siguiente;
    setRamas(siguiente);
  }, []);

  /**
   * Lee una rama si no está leída. Devuelve sus hijos, o `null` si falló.
   *
   * Una rama que falló NO se reintenta sola: quien quiera volver a mirar lo
   * pide con `forzar`. Reintentar en cada render convertiría un servidor
   * caído en una tormenta de peticiones.
   */
  const cargar = useCallback(
    async (carpeta, { forzar = false } = {}) => {
      if (!carpeta) return null;
      const previa = ramasRef.current.get(carpeta);
      if (previa && !forzar) return previa.hijos;

      setCargando((prev) => new Set(prev).add(carpeta));
      try {
        const respuesta = await explorar(carpeta);
        /* Fuera los nodos del sistema (`.Attributes`): ni son carpeta ni señal. */
        const hijos = (respuesta?.payload ?? []).filter((n) => n?.pointName && !esNodoDeSistema(n));
        anotar(carpeta, { hijos, error: null });
        return hijos;
      } catch (error) {
        anotar(carpeta, { hijos: null, error });
        return null;
      } finally {
        setCargando((prev) => {
          const s = new Set(prev);
          s.delete(carpeta);
          return s;
        });
      }
    },
    [explorar, anotar],
  );

  /**
   * Lee una carpeta y TODAS sus subcarpetas. Es lo que hace falta para
   * «marcar el activo marca todas sus variables»: no se puede marcar lo que
   * no se ha leído.
   *
   * Devuelve `false` si alguna rama del camino falló: entonces el conteo de
   * hojas no es completo, y quien marca tiene que saberlo.
   */
  const cargarEnProfundidad = useCallback(
    async (carpeta, profundidad = 0) => {
      if (profundidad > 6) return false;
      const hijos = await cargar(carpeta);
      if (hijos === null) return false;
      let completo = true;
      for (const h of hijos) {
        if (esCarpeta(h.pointName)) {
          const ok = await cargarEnProfundidad(h.pointName, profundidad + 1);
          completo = completo && ok;
        }
      }
      return completo;
    },
    [cargar],
  );

  /** Lee una carpeta y el primer nivel de cada una de sus subcarpetas. */
  const cargarDosNiveles = useCallback(
    async (carpeta) => {
      const hijos = await cargar(carpeta);
      if (hijos === null) return null;
      await Promise.all(hijos.filter((h) => esCarpeta(h.pointName)).map((h) => cargar(h.pointName)));
      return hijos;
    },
    [cargar],
  );

  /**
   * El árbol como lo necesita el dominio: carpeta → hijos (o `null` si falló).
   * Es un `Map` nuevo sólo cuando cambia `ramas`, así que se puede pasar
   * directamente a `hojasBajo`, `activosDesdeRaiz` y `compararConArbol`.
   */
  const hijosPorCarpeta = useMemo(() => soloHijos(ramas), [ramas]);

  const olvidar = useCallback(() => {
    ramasRef.current = new Map();
    setRamas(new Map());
  }, []);

  return {
    hijosPorCarpeta,
    /**
     * Lo leído AHORA MISMO, sin esperar al render. Es lo que necesita quien
     * acaba de cargar una carpeta en profundidad y quiere contar sus hojas en
     * la misma función: el estado de React todavía apunta al mapa anterior.
     */
    hijosActuales: () => soloHijos(ramasRef.current),
    cargando,
    cargar,
    cargarEnProfundidad,
    cargarDosNiveles,
    olvidar,
    /** Los hijos ya leídos de una carpeta, o `undefined` si nadie la pidió. */
    hijosDe: (carpeta) => ramas.get(carpeta)?.hijos,
    /** El error con que falló una carpeta, si falló. */
    errorDe: (carpeta) => ramas.get(carpeta)?.error ?? null,
  };
}
