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
 * Desde el Plan 21 F2 comparte el MOTOR de sondeo con el tanque —el de
 * `lib/iconics/pollingEngine.js`— pero no el LOTE ni el búfer: cada máquina
 * construye el suyo en su propia fuente. La distinción es la que sostiene todo
 * lo de arriba, y está explicada en la cabecera de `vibracionSource.js`.
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
 * provider que manda sobre el resto de la aplicación.
 *
 * ── LO QUE ESTE ARCHIVO DEJÓ DE HACER (Plan 21 F2) ─────────────────
 *
 * Tenía su propio `setInterval`, su propio lector de lote y su propio
 * `valorDe`. Los tres se fueron a `vibracionSource.js`, sobre el motor de
 * sondeo que el tanque ya usaba: conteo de referencias, guarda de petición en
 * vuelo, corte por visibilidad, backoff y marca de rancio. Lo que queda aquí
 * es lo único que es de React — suscribirse al montar y darse de baja al
 * desmontar.
 */
import { useEffect, useMemo, useState } from "react";

import { useDataSource } from "@/lib/datasource";

import { fuenteDeVibracion } from "./vibracionSource.js";

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
 * El estado de vibración, listo para `evaluarRiesgosVibracion`.
 *
 * Devuelve además `puntosSinDato`: cuántos de los puntos pedidos no trajeron
 * lectura. La pantalla lo necesita para distinguir «la máquina está tranquila»
 * de «la máquina no está contestando», que se ven igual si sólo se miran los
 * riesgos activos.
 *
 * CINCO componentes lo llaman —`InicioVibraciones`, `Vibraciones`,
 * `RiesgosVibracion`, `Vibraciones3D` y `CierreDiagnostico`— y desde F2 todos
 * comparten un motor: el conteo de referencias de `pollingEngine` hace que dos
 * montados a la vez sigan siendo UNA petición por ciclo, no dos.
 */
export function useVibracion() {
  const [estado, setEstado] = useState(VACIO);

  /*
   * `useDataSource()` publica la CLASE de transporte, no una fuente. La fuente
   * se cachea por clase en `vibracionSource.js`, así que cambiar de origen
   * devuelve otra distinta y el efecto se rehace solo.
   */
  const { transporte } = useDataSource();
  const fuente = useMemo(() => fuenteDeVibracion(transporte), [transporte]);

  useEffect(() => {
    setEstado(VACIO);
    /* La baja va SIEMPRE en el return: con el doble montaje de StrictMode, un
       efecto sin limpieza dejaría una referencia huérfana en cada visita y el
       motor seguiría sondeando puntos que ya no mira nadie. */
    return fuente.subscribeVibracion(setEstado);
  }, [fuente]);

  return estado;
}
