/**
 * Lectura en vivo del SISTEMA DE VIBRACIONES.
 *
 * ── POR QUÉ NO PASA POR `EvaProvider` ──────────────────────────────
 *
 * Porque `EvaProvider` sirve el sistema del TANQUE: su fuente sabe de las ocho
 * señales de `senales.js`, de su búfer y de su simulador. Esto es otra máquina,
 * con otro PLC y otro variador, y meterla por la misma puerta acabaría con las
 * dos series en el mismo búfer, a un `unir()` de distancia de que alguien
 * cruzara el caudal de allí con la vibración de aquí.
 *
 * Así que este hook sale a la API por su cuenta, en lote, y no toca nada del
 * otro sistema.
 *
 * ── POR QUÉ SE SONDEA Y NO SE PIDE UNA VEZ ─────────────────────────
 *
 * Porque estos puntos se apagan. El 26-08-2026, a las 13:10:31, quince de
 * veintiún puntos dejaron de entregar valor de golpe: se quedaron con la marca
 * de tiempo congelada y una calidad sin dato. Los que siguieron vivos eran
 * `aRMS` y `aPeak`, que se miden sin conocer la velocidad; los que murieron
 * incluían todos los `vRMS` —que necesitan la velocidad para integrar la
 * aceleración— y el variador entero.
 *
 * Es decir: se apagó la máquina, el variador dejó de publicar, y con él se fue
 * la referencia de velocidad. Una pantalla que hubiera leído una sola vez a
 * las 13:05 seguiría enseñando aquellos números como si fueran de ahora.
 *
 * ── POR QUÉ OBEDECE AL INTERRUPTOR DE ORIGEN ───────────────────────
 *
 * Hasta que se añadió `simuladorVibracion.js`, este hook salía SIEMPRE a la
 * red: con el origen puesto en «Simulado» la sección entera quedaba muda
 * —veintiún puntos sin lectura, todas las reglas sin comprobar y el aviso de
 * «la máquina no está contestando» encendido para siempre—. Es exactamente el
 * fallo que el Plan 9 arregló para el tanque; aquí se repetía porque esta
 * sección nació después del simulador y nadie volvió a pasar por aquí.
 *
 * La decisión NO se toma en este archivo: sale de `useDataSource()`, el mismo
 * provider que manda sobre el resto de la aplicación. Aquí sólo se elige QUÉ
 * transporte construir para el origen que ya está decidido — el mismo reparto
 * que hace `EvaProvider` con el árbol del tanque.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDataSource } from "@/lib/datasource";
import { isGoodQuality } from "@shared/quality.js";

import { createSistemaVibraciones } from "@shared/eva/sistemaVibraciones.js";

import { transporteDe } from "./transportes.js";

import { todosLosPuntos } from "../domain/vibraciones.js";

/** Cada cuánto se relee. El SM 1281 publica cada pocos segundos. */
const CADENCIA_MS = 5000;

const VACIO = {
  canales: {},
  variador: {},
  alarmas: {},
  loading: true,
  error: null,
  lastUpdated: null,
  puntosSinDato: [],
};

/**
 * Saca el valor de una entrada ya normalizada, o `null`.
 *
 * Hay DOS formas de no tener dato y las dos tienen que acabar en `null`:
 * calidad mala, y calidad aceptable pero sin campo `value`. La segunda es la
 * que se vio en el servidor real —calidad `0x08000000`, sin `value`— y es la
 * peligrosa, porque un `?? 0` descuidado la convertiría en un cero que el
 * motor de reglas leería como «vibración nula, todo perfecto». El simulador
 * reproduce esa forma exacta, y no un cero con calidad mala, justamente para
 * que este camino se ejercite sin servidor.
 */
function valorDe(entrada) {
  if (!entrada) return null;
  if (!isGoodQuality(entrada.quality)) return null;
  return entrada.value === undefined || entrada.value === null ? null : entrada.value;
}

/**
 * Un lector de lote para un origen: `(puntos) => { ok, mapa, error }`.
 *
 * Los dos caminos acaban en el MISMO `Map(nombre → { value, quality })`, que es
 * la forma que ya usan el transporte real de `lib/iconics` y el motor de
 * sondeo. Normalizar aquí —y no repartir un `if` por el cuerpo del hook— es lo
 * que deja `leer()` sin saber de dónde vienen los datos.
 *
 * ── LA NORMALIZACIÓN DEL LOTE REAL ESTABA ESCRITA DOS VECES ────────
 *
 * Este archivo tenía su propio recorrido de la respuesta del puente: desenvolver
 * `{ ok, payload }`, saltarse los puntos ausentes y leer `value`/`Value` y
 * `quality`/`Quality` en sus dos grafías. `createRealTransport().read()` hace
 * exactamente eso, y es el que usa el resto de la aplicación.
 *
 * Dos copias de la misma normalización no fallan a la vez: divergen. Y el
 * síntoma de que divergieran no habría sido un error, sino esta máquina leyendo
 * una forma de payload que la otra ya sabe leer — es decir, puntos sin dato en
 * una pantalla y con dato en otra, contra el mismo servidor.
 *
 * Ahora los dos orígenes salen de `transporteDe`, que es el único sitio que
 * construye transportes. Lo que este archivo conserva es lo que de verdad es
 * suyo: envolver el resultado en `{ ok, error }`, porque la pantalla pinta el
 * mensaje del puente en su cinta roja.
 *
 * `error` sólo viaja por el camino real: el simulador no tiene puente que
 * falle; lo que sí puede es lanzar —`chaos.errorPeticion`—, y eso lo recoge el
 * `catch` de `leer()`, igual que recogería un `fetch` caído.
 */
function crearLector(transporte) {
  /* La física la pone el registro de sistemas; aquí sólo se dice qué máquina
     es. Una máquina nueva cambia la cadena y nada más. */
  const fuente = transporteDe("vibraciones", transporte);

  return async (puntos) => {
    const mapa = await fuente.read(puntos);
    return { ok: true, mapa };
  };
}

/**
 * El estado de vibración, listo para `evaluarRiesgosVibracion`.
 *
 * Devuelve además `puntosSinDato`: cuántos de los puntos pedidos no trajeron
 * lectura. La pantalla lo necesita para distinguir «la máquina está tranquila»
 * de «la máquina no está contestando», que se ven igual si sólo se miran los
 * riesgos activos.
 */
export function useVibracion() {
  const [estado, setEstado] = useState(VACIO);
  const vivo = useRef(true);

  /*
   * El lector se crea una sola vez por origen. `useDataSource()` publica la
   * CLASE de transporte, no una fuente: la instancia se construye aquí, que es
   * barata —un cierre, sin estado—. El remontaje al conmutar lo hace el
   * provider con su `key`, así que no hay que limpiar nada a mano.
   */
  const { transporte } = useDataSource();
  const lector = useMemo(() => crearLector(transporte), [transporte]);

  const leer = useCallback(async () => {
    // La lista la da el catálogo: `todosLosPuntos()` y el recorrido de
    // `createSistemaVibraciones` salen de las mismas constantes, así que no
    // pueden desincronizarse.
    const puntos = todosLosPuntos();

    try {
      const res = await lector(puntos);
      if (!vivo.current) return;

      if (!res.ok) {
        setEstado((prev) => ({ ...prev, loading: false, error: res.error }));
        return;
      }

      /*
       * El recorrido del catálogo —tres canales por cinco familias, más el
       * variador y los contadores— vive en `@shared/eva/sistemaVibraciones.js`
       * y no aquí. Estaba escrito a mano en este archivo y OTRA VEZ en
       * `backend/ia/conversacion/herramientas.mjs`: dos copias del mismo recorrido sobre el
       * mismo catálogo, y el síntoma de que divergieran no habría sido un
       * error, sino el chat contestando sobre un apoyo con los datos de otro.
       */
      const { canales, variador, alarmas, sinDato, puntosPedidos } =
        createSistemaVibraciones((punto) => valorDe(res.mapa.get(punto)));

      setEstado({
        canales,
        variador,
        alarmas,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        puntosSinDato: sinDato,
        puntosPedidos,
      });
    } catch (e) {
      if (!vivo.current) return;
      setEstado((prev) => ({ ...prev, loading: false, error: e?.message ?? String(e) }));
    }
    /* `lector` en las dependencias, y no `[]`: cambiar de origen tiene que
       rehacer el sondeo. Sin esto, el cierre seguiría leyendo del transporte
       anterior mientras la cinta de la cabecera anuncia el nuevo. */
  }, [lector]);

  useEffect(() => {
    vivo.current = true;
    leer();
    const id = setInterval(leer, CADENCIA_MS);
    /* La baja va SIEMPRE en el return: con el doble montaje de StrictMode, un
       efecto sin limpieza deja un intervalo huérfano en cada visita. */
    return () => {
      vivo.current = false;
      clearInterval(id);
    };
  }, [leer]);

  return estado;
}
