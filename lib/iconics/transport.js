/**
 * Frontera con la red: el servidor real.
 *
 * Aquí queda solo lo que toca la red o el entorno del navegador. Quién elige
 * entre este transporte y el simulado es `Demo-EVA/data/EvaProvider.jsx`, que
 * es donde vive la sección con datos; este archivo se limita a decir con qué
 * transporte ARRANCA el build (`VITE_ICONICS_FAKE`) y a construir el real.
 *
 * ── QUÉ DESAPARECIÓ DE AQUÍ ────────────────────────────────────────
 *
 * `readHistory`, `readDay` y `readDailyOee` leían las series del OEE de una
 * máquina de Resonac, y se fueron con esa sección. La historia de Demo EVA la
 * pide `Demo-EVA/data/historia.js` a `fetchIconicsHistory` directamente,
 * porque sus señales son puntos sueltos y no un juego de tags por máquina.
 *
 * También se fue `createFakeTransport`, el simulador de Resonac. Los grados de
 * caos que definía siguen vivos en `caos.js`: no eran suyos, son un ajuste del
 * entorno que usa el simulador de Demo EVA.
 */
import { fetchIconicsBatch } from "./apiClient.js";

/**
 * Transporte real: una petición en lote por llamada.
 *
 * Normaliza la respuesta del backend puente, que envuelve cada punto en
 * `{ ok, payload }`, al par `{ value, quality }` que espera el motor. La forma
 * del payload de ICONICS varía según el tipo de punto, de ahí las alternativas
 * al leer `value` y `quality`.
 */
export function createRealTransport() {
  return {
    async read(pointNames) {
      const respuesta = await fetchIconicsBatch(pointNames);
      const mapa = respuesta?.payload ?? {};
      const salida = new Map();

      for (const name of pointNames) {
        const entrada = mapa[name];
        if (!entrada?.ok) continue;   // punto ausente: el motor lo trata como hueco

        const p = entrada.payload ?? {};
        salida.set(name, {
          value: p.value ?? p.Value ?? null,
          quality: p.quality ?? p.Quality ?? null,
        });
      }
      return salida;
    },
  };
}

/** Los dos transportes posibles. */
export const TRANSPORTES = { REAL: "real", SIMULADO: "simulado" };

/** ¿El build arranca en el simulador? */
export const esTransporteFalso = () => import.meta.env?.VITE_ICONICS_FAKE === "true";

/**
 * Con qué transporte arranca la aplicación. Real salvo que se pida lo
 * contrario: un build sin configurar tiene que ir al servidor, nunca quedarse
 * enseñando datos inventados sin que nadie lo haya decidido.
 */
export const transporteInicial = () =>
  esTransporteFalso() ? TRANSPORTES.SIMULADO : TRANSPORTES.REAL;
