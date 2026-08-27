/**
 * Búfer rodante de lecturas en vivo: las últimas N muestras que ha visto ESTA
 * sesión del navegador.
 *
 * ── POR QUÉ HACE FALTA ALGO ASÍ ────────────────────────────────────
 *
 * Las tarjetas quieren un sparkline y la vista quiere una tendencia, y las dos
 * fuentes disponibles se quedan cortas cada una por su lado:
 *
 *  - El **historiador** sólo tiene ~3 h de este árbol (empezó a coleccionar hoy)
 *    y, sobre todo, **sólo cuatro de las ocho señales tienen serie propia**: a
 *    las otras tres les devuelve la curva de la temperatura del tanque. Ver
 *    `domain/senales.js`.
 *  - El **simulador determinista** de Resonac (`getMachineHistory`) inventa una
 *    rejilla anclada al valor actual. Aquí eso sería inaceptable: con un
 *    historiador que ya confunde tres tags por su cuenta, añadir encima una
 *    serie sintética haría imposible saber qué se está mirando.
 *
 * Este búfer es la tercera vía y es **dato real**: son las muestras que el motor
 * de polling ya trajo, guardadas en memoria. Efímeras —se pierden al recargar—
 * pero ciertas, y disponibles para las ocho señales por igual.
 *
 * JS puro, sin React ni DOM, para poder probarlo en node.
 *
 * ── LA DEDUPLICACIÓN NO ES UNA OPTIMIZACIÓN ────────────────────────
 *
 * El motor notifica a sus suscriptores en cada ciclo, y la fuente emite además
 * una instantánea al suscribirse. Sin deduplicar por marca de tiempo, abrir dos
 * vistas o navegar de una a otra metería el mismo instante varias veces y la
 * serie mostraría una meseta que nunca ocurrió.
 */

/** Cuántas muestras se guardan. A 3 s por ciclo, 200 son unos 10 minutos. */
export const MAX_PUNTOS = 200;

export function createBufferRodante({ maxPuntos = MAX_PUNTOS } = {}) {
  /** [{ t: Date, valores: { clave: number|boolean|null } }] — la más nueva al final. */
  const puntos = [];

  /** Marca de tiempo del último punto admitido, para deduplicar. */
  let ultimaMarca = null;

  return {
    /**
     * Admite una instantánea del sistema. Se ignora la que no traiga marca de
     * tiempo (aún no ha llegado nada) y la que repita la anterior.
     */
    push(sistema) {
      const t = sistema?.receivedAt;
      if (!t) return false;

      const marca = t instanceof Date ? t.getTime() : new Date(t).getTime();
      if (!Number.isFinite(marca) || marca === ultimaMarca) return false;
      ultimaMarca = marca;

      const valores = {};
      for (const s of sistema.lista ?? []) valores[s.key] = s.valor;

      puntos.push({ t: new Date(marca), valores });
      if (puntos.length > maxPuntos) puntos.splice(0, puntos.length - maxPuntos);
      return true;
    },

    /**
     * Serie de una señal, ya lista para un sparkline.
     *
     * Devuelve **sólo números finitos**: un hueco se descarta en vez de
     * romperse en `Math.min` ni de dibujarse como un cero, que es la regla de
     * siempre. Con menos de dos puntos el sparkline no se pinta, y quien llama
     * ya lo comprueba.
     *
     * `puntos` recorta a los N más recientes; sin él devuelve todo el búfer.
     */
    serie(clave, { puntos: n } = {}) {
      const valores = puntos
        .map((p) => p.valores[clave])
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      return n && valores.length > n ? valores.slice(-n) : valores;
    },

    /** Lo mismo con su marca de tiempo, para gráficas con eje temporal. */
    puntosDe(clave, { puntos: n } = {}) {
      const filas = puntos
        .filter((p) => typeof p.valores[clave] === "number" && Number.isFinite(p.valores[clave]))
        .map((p) => ({ t: p.t, valor: p.valores[clave] }));
      return n && filas.length > n ? filas.slice(-n) : filas;
    },

    /** Cuántas muestras hay, y qué ventana de tiempo cubren (en segundos). */
    estado() {
      if (puntos.length < 2) return { muestras: puntos.length, ventanaS: 0 };
      return {
        muestras: puntos.length,
        ventanaS: Math.round((puntos.at(-1).t - puntos[0].t) / 1000),
      };
    },

    limpiar() {
      puntos.length = 0;
      ultimaMarca = null;
    },
  };
}
