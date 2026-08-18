/**
 * Fuente de datos de Demo EVA. Traduce entre el mundo de ICONICS (puntos con
 * nombre y calidad) y el del dominio (`Sistema`).
 *
 * Es delgada a propósito, igual que `iconicsSource.js`: no agenda (eso es del
 * motor), no sanea números (eso es del dominio) y no decide colores (eso es de
 * los umbrales). Sólo empareja unos con otros.
 *
 * ── UN SOLO MOTOR, Y POR QUÉ ───────────────────────────────────────
 *
 * Resonac usa tres cadencias porque tiene 140 puntos repartidos entre lo que se
 * mira siempre (resumen), lo que se mira al abrir una máquina (detalle) y lo
 * que casi no cambia (Modelo, tiempos planificados). Aquí son **ocho puntos**,
 * los ocho se pintan en todas las vistas y ninguno es estático: partirlos en
 * cadencias sería complejidad sin nada que ahorrar.
 *
 * Ocho puntos entran de sobra en un solo lote, así que un ciclo es exactamente
 * **una petición**. `stats()` lo confirma en pantalla.
 *
 * ── LA CADENCIA ────────────────────────────────────────────────────
 *
 * 3 s, la misma que el resumen de planta de Resonac, y por el mismo motivo: el
 * suelo real no es el tiempo de respuesta sino `batchCacheTtlMs` del puente
 * (2 s), que colapsa en una sola llamada a ICONICS lo que piden todas las
 * pantallas. Sondear por debajo de eso no trae dato más nuevo, sólo repite el
 * cacheado.
 */
import { createPollingEngine } from "@/lib/iconics";

import { SENAL_KEYS, TODOS_LOS_PUNTOS, pointName } from "../domain/senales.js";
import { createSistema } from "../domain/sistema.js";
import { createBufferRodante } from "../lib/buffer.js";
import { leerSerie as leerDelHistoriador } from "./historia.js";

export const CADENCIA_MS = 3_000;

export function createEvaSource({ transport, intervalMs = CADENCIA_MS } = {}) {
  if (!transport?.read) {
    throw new Error("createEvaSource requiere un transporte con read()");
  }

  const motor = createPollingEngine({ read: transport.read, intervalMs });

  /**
   * De dónde sale una serie histórica.
   *
   * El transporte simulado trae la suya (`readSerie`); el real no, porque el
   * histórico de este árbol no se pide como el de Resonac —lleva el nombre de
   * tiempo real, con `ac:`— y por eso vive en `historia.js` en vez de en el
   * transporte. Ver la cabecera de ese archivo.
   *
   * La elección se hace **aquí y una sola vez**, por el mismo motivo por el que
   * `DataSourceProvider` es el único sitio que elige transporte: repartir el `if`
   * por los hooks acabaría dejando alguna gráfica pegando a la red con el
   * simulador encendido.
   */
  const leerSerie = transport.readSerie ?? leerDelHistoriador;

  /**
   * El búfer vive en la FUENTE y no en un componente: así sobrevive a que una
   * tarjeta se desmonte y se vuelva a montar, y las tres vistas comparten las
   * mismas muestras en vez de acumular cada una las suyas desde cero.
   */
  const buffer = createBufferRodante();

  /** Lo que el motor sabe ahora mismo de las ocho señales. */
  function instantanea() {
    const lecturas = {};
    for (const key of SENAL_KEYS) {
      const l = motor.get(pointName(key));
      lecturas[key] = { value: l.value, receivedAt: l.receivedAt, stale: l.stale };
    }

    const sistema = createSistema(lecturas);
    const error = motor.stats().ultimoError;
    const conDato = sistema.receivedAt !== null;

    return {
      sistema,
      // Mismo criterio que en Resonac: se está cargando mientras no haya
      // llegado nada Y no haya error. Un error con datos previos no borra la
      // pantalla; se advierte encima y se sigue enseñando lo último bueno.
      loading: !conDato && !error,
      error: conDato ? null : error ?? null,
      lastUpdated: sistema.receivedAt,
    };
  }

  return {
    /**
     * Alta de las ocho señales. Devuelve la baja, que hay que llamar al
     * desmontar: es lo que permite al motor contar referencias y dejar de
     * sondear cuando nadie mira.
     */
    subscribeSistema(cb) {
      const baja = motor.acquire(TODOS_LOS_PUNTOS);
      motor.start();

      const emitir = () => {
        const snapshot = instantanea();
        // El búfer se alimenta aquí y no en la vista: es la única forma de que
        // siga creciendo aunque la tarjeta que lo dibuja no esté montada.
        // Deduplica por marca de tiempo, así que emitir de más no lo ensucia.
        buffer.push(snapshot.sistema);
        cb(snapshot);
      };

      const off = motor.onUpdate(emitir);
      emitir();

      return () => {
        off();
        baja();
      };
    },

    /**
     * Serie histórica de una señal. No se sondea: se pide al montar, porque el
     * pasado no cambia y el borde derecho lo cubre el valor en vivo.
     */
    leerSerie: (clave, ventana) => leerSerie(clave, ventana),

    /** Las muestras en vivo acumuladas en esta sesión. Ver `lib/buffer.js`. */
    buffer,

    stop() {
      motor.stop();
      buffer.limpiar();
    },

    /** Instrumentación del motor, para medir el presupuesto de red. */
    stats: () => motor.stats(),
  };
}
