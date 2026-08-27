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
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchIconicsBatch } from "@/lib/iconics";
import { isGoodQuality } from "@shared/quality.js";

import {
  BANDERAS,
  CALIDADES,
  CONTADORES_ALARMA,
  CANALES,
  MEDIDAS,
  VARIADOR,
  VIGILANCIAS,
  decodificarVigilancia,
  puntoAlarma,
  puntoBandera,
  puntoCalidad,
  puntoMedida,
  puntoSensor,
  puntoVariador,
  puntoVigilancia,
} from "../domain/vibraciones.js";

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
 * Saca el valor de una entrada del lote, o `null`.
 *
 * Hay DOS formas de no tener dato y las dos tienen que acabar en `null`:
 * calidad mala, y calidad aceptable pero sin campo `value`. La segunda es la
 * que se vio en el servidor real —calidad `0x08000000`, sin `value`— y es la
 * peligrosa, porque un `?? 0` descuidado la convertiría en un cero que el
 * motor de reglas leería como «vibración nula, todo perfecto».
 */
function valorDe(entrada) {
  const p = entrada?.payload;
  if (!entrada?.ok || !p) return null;
  if (!isGoodQuality(p.quality)) return null;
  return p.value === undefined || p.value === null ? null : p.value;
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

  const leer = useCallback(async () => {
    const puntos = [];
    for (const c of CANALES) {
      for (const m of MEDIDAS) puntos.push(puntoMedida(m.key, c.id));
      for (const b of BANDERAS) puntos.push(puntoBandera(b.key, c.id));
      for (const v of VIGILANCIAS) puntos.push(puntoVigilancia(v.key, c.id));
      for (const q of CALIDADES) puntos.push(puntoCalidad(q.key, c.id));
      puntos.push(puntoSensor(c.id));
    }
    for (const v of VARIADOR) puntos.push(puntoVariador(v.key));
    for (const a of CONTADORES_ALARMA) puntos.push(puntoAlarma(a.key));

    try {
      const res = await fetchIconicsBatch(puntos);
      if (!vivo.current) return;

      if (!res?.ok) {
        setEstado((prev) => ({ ...prev, loading: false, error: res?.error ?? "Sin respuesta del servidor." }));
        return;
      }

      const mapa = res.payload ?? {};
      const sinDato = [];

      const canales = {};
      for (const c of CANALES) {
        const d = {};
        for (const m of MEDIDAS) {
          const punto = puntoMedida(m.key, c.id);
          d[m.key] = valorDe(mapa[punto]);
          if (d[m.key] === null) sinDato.push(punto);
        }
        for (const b of BANDERAS) {
          const punto = puntoBandera(b.key, c.id);
          d[b.key] = valorDe(mapa[punto]);
          if (d[b.key] === null) sinDato.push(punto);
        }

        /*
         * Los estados de vigilancia se decodifican AQUÍ, en la frontera, y no
         * en las reglas: el base64 del módulo es un detalle del transporte, y
         * el motor de riesgos no tiene por qué saber que existe. Lo que le
         * llega es «apagado» o «en orden».
         */
        d.vigilancias = {};
        for (const v of VIGILANCIAS) {
          const punto = puntoVigilancia(v.key, c.id);
          const estado = decodificarVigilancia(valorDe(mapa[punto]));
          d.vigilancias[v.key] = estado;
          if (estado === null) sinDato.push(punto);
        }

        d.calidades = {};
        for (const q of CALIDADES) {
          const punto = puntoCalidad(q.key, c.id);
          d.calidades[q.key] = valorDe(mapa[punto]);
          if (d.calidades[q.key] === null) sinDato.push(punto);
        }

        const puntoS = puntoSensor(c.id);
        d.sensor = decodificarVigilancia(valorDe(mapa[puntoS]));
        if (d.sensor === null) sinDato.push(puntoS);

        canales[c.id] = d;
      }

      const variador = {};
      for (const v of VARIADOR) {
        const punto = puntoVariador(v.key);
        variador[v.key] = valorDe(mapa[punto]);
        if (variador[v.key] === null) sinDato.push(punto);
      }

      /*
       * Los contadores del servidor de alarmas. Van aparte de `variador` y de
       * `canales` porque no son de la máquina: son de ICONICS, que vigila esta
       * área con 57 alarmas configuradas por quien conoce el proceso.
       */
      const alarmas = {};
      for (const a of CONTADORES_ALARMA) {
        const punto = puntoAlarma(a.key);
        alarmas[a.key] = valorDe(mapa[punto]);
        if (alarmas[a.key] === null) sinDato.push(punto);
      }

      setEstado({
        canales,
        variador,
        alarmas,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        puntosSinDato: sinDato,
        puntosPedidos: puntos.length,
      });
    } catch (e) {
      if (!vivo.current) return;
      setEstado((prev) => ({ ...prev, loading: false, error: e?.message ?? String(e) }));
    }
  }, []);

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
