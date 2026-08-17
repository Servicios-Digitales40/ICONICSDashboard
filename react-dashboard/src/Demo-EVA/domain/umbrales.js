/**
 * Los límites operativos de cada señal. **Un solo archivo, y es una suposición
 * declarada.**
 *
 * ── DE DÓNDE SALEN ESTOS NÚMEROS ───────────────────────────────────
 *
 * **De ningún sitio.** Nadie nos ha dado el rango operativo real de esta
 * instalación, y el servidor no publica límites: `.Attributes` viene vacío y no
 * hay alarmas configuradas para este árbol (Plan 8 §1.4). Lo de abajo son
 * valores de libro para un sistema de agua industrial genérico.
 *
 * Eso no los invalida —hay que pintar algo, y un tablero sin bandas no dice si
 * un número es bueno— pero **obliga a decirlo**: `PROVISIONALES` está en `true`
 * y la vista de Planta pinta un aviso mientras lo esté. Cuando el usuario
 * confirme los rangos reales se corrigen aquí, se pone la bandera en `false` y
 * el aviso desaparece solo. Ningún componente cambia.
 *
 * Es el mismo criterio con el que «Máquina 3D» rotula aparte los estados que
 * ICONICS no emite: lo que no está confirmado no se esconde, se etiqueta.
 *
 * ── LA FORMA DE UNA BANDA ──────────────────────────────────────────
 *
 *     min ─── avisoMin ─────── avisoMax ─── max
 *      │crítico│   aviso  │ nominal │ aviso │crítico│
 *
 * `null` en un extremo significa que ese lado **no tiene límite**, no que valga
 * cero: una eficiencia energética no es peor por ser alta, y un motor no está
 * en falta por ir descargado. Un `null` mal leído como 0 marcaría en rojo la
 * mitad de la planta, así que `bandaDe` lo comprueba explícitamente.
 *
 * Las señales booleanas no tienen banda y valen `null` entero: un modo no es
 * ni bueno ni malo, es un hecho.
 */

/**
 * ¿Los umbrales siguen sin confirmar contra la instalación real?
 *
 * Lo lee `views/PlantaEva.jsx` para pintar el aviso de procedencia. Cuando esto
 * pase a `false` hay que haber revisado la tabla entera, no sólo una fila.
 */
export const PROVISIONALES = true;

/**
 * Umbrales por clave de señal. Sin entrada = sin banda (se trata como nominal
 * siempre que haya lectura).
 */
export const UMBRALES = {
  // Un tanque por debajo del 15 % arriesga cavitación de la bomba; por encima
  // del 95 %, rebose. La banda cómoda es amplia a propósito: el nivel oscila
  // por diseño y una banda estrecha convertiría la operación normal en aviso.
  nivelTanque: { min: 15, avisoMin: 25, avisoMax: 90, max: 95 },

  // Agua de proceso: por debajo de 4 °C hay riesgo de congelación en tuberías
  // expuestas; por encima de 45 °C ya no es agua de servicio.
  temperaturaTanque: { min: 4, avisoMin: 10, avisoMax: 35, max: 45 },

  // Sin unidad declarada (ver `senales.js`), así que la banda está en las
  // unidades del tag, sean las que sean. Es el umbral que MÁS depende de la
  // confirmación del usuario.
  flujoInstantaneo: { min: 0, avisoMin: 2, avisoMax: 45, max: 55 },
  presionRelativa: { min: 0.5, avisoMin: 1.5, avisoMax: 5.5, max: 6.5 },

  // Sin límite inferior: un motor descargado no está en falta, sólo ocioso.
  // Por arriba, 95 % es el umbral clásico de sobrecarga sostenida.
  cargaMotor: { min: null, avisoMin: null, avisoMax: 85, max: 95 },

  // Sin límite superior: más eficiencia nunca es un problema.
  eficienciaEnergetica: { min: 30, avisoMin: 55, avisoMax: null, max: null },

  // ±10 % sobre 120 V nominales, que es la tolerancia habitual de servicio.
  tensionLinea: { min: 105, avisoMin: 114, avisoMax: 126, max: 132 },

  // Booleano: no hay banda que aplicar.
  modoVdf: null,
};

/** ¿Hay número utilizable? Local para no arrastrar el dominio de Resonac aquí. */
const hay = (v) => v !== null && v !== undefined && Number.isFinite(v);

/**
 * Banda en la que cae un valor: `"nominal" | "atencion" | "critico"`.
 *
 * Sin umbrales declarados devuelve `"nominal"`: una señal sin banda no puede
 * estar fuera de ella. Sin valor devuelve `null`, y es quien llama el que
 * decide que eso es «sin dato» — aquí no se afirma nada sobre un hueco.
 */
export function bandaDe(key, valor) {
  if (!hay(valor)) return null;

  const u = UMBRALES[key];
  if (!u) return "nominal";

  if ((hay(u.min) && valor < u.min) || (hay(u.max) && valor > u.max)) return "critico";
  if ((hay(u.avisoMin) && valor < u.avisoMin) || (hay(u.avisoMax) && valor > u.avisoMax)) {
    return "atencion";
  }
  return "nominal";
}

/**
 * Cuánto margen se ha consumido, en %, midiendo desde el centro de la banda
 * cómoda hacia el límite duro más cercano.
 *
 * 0 % es el centro de la banda nominal; 100 % es tocar un límite duro. Por
 * encima de 100 el valor ya está fuera, y no se acota aquí: quien lo pinte
 * decide si recorta la barra, pero el ORDEN tiene que conservarse o la señal
 * más grave dejaría de encabezar la lista.
 *
 * Es lo que sustituye al Pareto de rechazos del tablero de Resonac. Responde la
 * misma pregunta —dónde está la tensión del sistema— con el eje que sí existe
 * aquí, y no requiere ningún dato que el servidor no dé.
 */
export function margenConsumido(key, valor) {
  if (!hay(valor)) return null;

  const u = UMBRALES[key];
  if (!u) return 0;

  // Centro de referencia: el punto medio de la banda cómoda. Con un solo lado
  // acotado, el propio umbral de aviso hace de centro, y todo lo que quede del
  // lado holgado consume 0.
  const tieneMin = hay(u.avisoMin);
  const tieneMax = hay(u.avisoMax);
  if (!tieneMin && !tieneMax) return 0;

  const centro = tieneMin && tieneMax ? (u.avisoMin + u.avisoMax) / 2 : (u.avisoMin ?? u.avisoMax);

  if (valor > centro) {
    if (!hay(u.max)) return 0;
    const recorrido = u.max - centro;
    return recorrido > 0 ? ((valor - centro) / recorrido) * 100 : 0;
  }

  if (valor < centro) {
    if (!hay(u.min)) return 0;
    const recorrido = centro - u.min;
    return recorrido > 0 ? ((centro - valor) / recorrido) * 100 : 0;
  }

  return 0;
}

/**
 * Umbrales a partir de los cuales se considera que el sistema **no está
 * impulsando**.
 *
 * Hace falta porque la instalación pasa la mayor parte del tiempo parada, y sin
 * esta noción un caudal de 0 caería por debajo de su límite duro y la demo
 * abriría en rojo permanente. Ver `estado.js` para cómo se aplica.
 */
export const REPOSO = {
  /** Carga del motor, en %, por debajo de la cual no hay impulsión. */
  cargaMotor: 1,
  /** Caudal absoluto por debajo del cual no circula nada. */
  flujo: 0.5,
};
