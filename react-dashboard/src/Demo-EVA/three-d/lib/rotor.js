/**
 * El banco de rotor en metros: dónde cae cada pieza, y cómo se comporta.
 *
 * Es a `Vibraciones3D` lo que `layout.js` + `comportamiento.js` son a la
 * maqueta del tanque, juntos en un archivo porque aquí hay una sola escena y
 * seis piezas, no cuatro activos repartidos por dos niveles.
 *
 * ── POR QUÉ ESTO NO ESTÁ EN `shared/eva/vibraciones/` ──────────────
 *
 * Porque son centímetros de dibujo, no hechos de la máquina. QUÉ piezas tiene
 * el tren y en qué orden van es dominio y vive en `TREN_MECANICO`; a cuántos
 * metros del origen se planta cada una es una decisión de encuadre que sólo
 * esta vista necesita. El día que la escena se recomponga, el dominio no se
 * entera — y ése es exactamente el reparto que hacen `domain/activos.js` y
 * `three-d/lib/layout.js` para la otra máquina.
 *
 * ── LA ESCALA NO ES LITERAL, Y ES DELIBERADO ───────────────────────
 *
 * El eje real mide 60 cm. Aquí mide 3,4 unidades de escena. No se dibuja a
 * escala 1:1 por dos motivos, y conviene que consten para que nadie «arregle»
 * esto midiendo con una regla:
 *
 *  1. **La cota de 60 cm es ambigua.** El propio levantamiento avisa (§7.2) de
 *     que no está definido si es la longitud total o la libre entre soportes.
 *     Una escena construida sobre ella afirmaría una precisión que el dato no
 *     tiene, y peor: alguien podría medir distancias entre chumaceras en la
 *     pantalla, que es justo el dato que falta (`EJE.distanciaEntreChumacerasMm`).
 *  2. **Lo que esta vista comunica es TOPOLOGÍA, no metrología.** Qué hay
 *     antes y después de qué, y qué apoyo mira cada sonda. Para eso, separar
 *     las piezas más de lo real es lo correcto: pegadas a escala, las dos
 *     chumaceras y el disco se solapan en pantalla y no se distingue cuál
 *     lleva sensor.
 *
 * De ahí que la vista escriba la cota como número y con su advertencia, en vez
 * de dejar que se deduzca de la geometría.
 */
import { RPM_MINIMA_ISO, bandaISO } from "../../domain/vibraciones.js";

/* ── Dónde cae cada pieza ─────────────────────────────────────────── */

/**
 * Posición en X de cada elemento del tren, siguiendo el orden de
 * `TREN_MECANICO`. El eje corre a lo largo de X y la escena mira desde +Z.
 *
 * El origen (x = 0) NO está en el motor sino cerca del disco de desbalance:
 * es el centro visual del banco, y dejarlo ahí hace que la órbita gire
 * alrededor de la pieza que interesa en vez de barrer el motor fuera de
 * cuadro.
 */
export const POSICION_X = Object.freeze({
  motor: -1.55,
  acoplamiento: -1.0,
  "chumacera-1": -0.45,
  disco: 0.3,
  "chumacera-2": 1.05,
  "extremo-libre": 1.62,
});

/**
 * ── LAS TRES COTAS VERTICALES, Y POR QUÉ SON TRES ──────────────────
 *
 * Es el reparto que hay que tener claro antes de tocar cualquier modelo de
 * esta escena, porque los tres números tienen que cuadrar entre sí o el eje
 * pasa por fuera de los rodamientos — y eso se ve, pero no falla.
 *
 *   `ALTURA_BANCADA`        cota del SUELO al plano de montaje. Todo lo que se
 *                           atornilla al banco arranca aquí, no en y = 0.
 *   `ALTURA_EJE`            cota del SUELO al centro del eje. Es la que usa el
 *                           rotor, que cuelga de la raíz de la escena.
 *   `ALTURA_EJE_MONTAJE`    la misma cota vista DESDE el plano de montaje. Es
 *                           la que usan el motor y las chumaceras, porque el
 *                           grupo de cada uno está plantado sobre la bancada.
 *
 * La tercera se deriva y no se escribe a mano a propósito: escrita a mano, un
 * cambio de `ALTURA_BANCADA` dejaría los soportes a una altura y el eje a otra,
 * y el síntoma sería un rodamiento que no toca el eje al que sujeta.
 */
export const ALTURA_BANCADA = 0.16;
export const ALTURA_EJE = 0.62;
export const ALTURA_EJE_MONTAJE = ALTURA_EJE - ALTURA_BANCADA;

/**
 * Extremos del eje dibujado.
 *
 * Empieza en la BRIDA del motor y no en el acoplamiento: entre las dos hay un
 * tramo de eje que existe, y sin él el rotor arrancaría en el aire con el
 * motor mirándolo desde lejos.
 */
export const EJE_DESDE = -1.14;
export const EJE_HASTA = POSICION_X["extremo-libre"];

/**
 * La bancada de perfil ranurado sobre la que va todo atornillado.
 *
 * Larga y descentrada hacia −X porque el motor sobresale por su lado: entre el
 * cuerpo, la campana del ventilador y su rejilla, la pieza llega bastante más
 * allá del punto donde está plantada.
 */
export const BANCADA = Object.freeze({
  largo: 4.4,
  ancho: 1.05,
  alto: ALTURA_BANCADA,
  centroX: -0.1,
});

/** Radio del disco de piso. Da aire a los lados sin que el banco se pierda. */
export const RADIO_PISO = 4.6;

/**
 * Los tres encuadres del selector.
 *
 * `lateral` es el primero y el que abre la vista, y no `isometrica` como en la
 * maqueta del tanque: este banco es una máquina EN LÍNEA, y su orden —qué pieza
 * va antes de cuál— sólo se lee de perfil. Una isométrica de entrada obliga a
 * reconstruir mentalmente la secuencia antes de poder leer nada.
 */
export const ENCUADRES = Object.freeze({
  lateral: { etiqueta: "Lateral", posicion: [0.1, 1.35, 5.0], objetivo: [0.05, 0.62, 0] },
  isometrica: { etiqueta: "Isométrica", posicion: [3.5, 2.9, 4.2], objetivo: [0.05, 0.55, 0] },
  superior: { etiqueta: "Superior", posicion: [0.05, 5.2, 0.01], objetivo: [0.05, 0.4, 0] },
});

/* ── Estado de un apoyo ───────────────────────────────────────────── */

/**
 * ¿Se pronuncia ISO 10816 sobre esta máquina ahora mismo?
 *
 * Devuelve `true`, `false` o **`null`**, y el `null` es el punto entero de que
 * esto sea una función: «no se sabe si la norma aplica» y «la norma no aplica»
 * son cosas distintas, y confundirlas apagaría el criterio de ISO en silencio
 * cada vez que el variador dejara de publicar su velocidad — que es justo
 * cuando esta máquina se queda muda.
 *
 * Es el mismo cálculo que hace `estadoVibraciones.js` en el dominio, y vive
 * aquí además porque las dos pantallas 3D lo necesitan antes de pintar. Estuvo
 * copiado a mano en `Vibraciones3D`; en cuanto el hero necesitó el mismo dato
 * iban a ser tres copias del mismo umbral, y el síntoma de que divergieran no
 * sería un error sino dos pantallas juzgando la misma lectura con distinta
 * vara.
 *
 * @param {object} variador  `variador` de `createSistemaVibraciones`
 * @returns {boolean|null}
 */
export function normaAplicableDe(variador) {
  const v = variador?.velocidad;
  if (!Number.isFinite(v)) return null;
  return v >= RPM_MINIMA_ISO;
}

/**
 * El estado de un apoyo instrumentado, en el vocabulario de `domain/estado.js`.
 *
 * ── EL ORDEN DE LAS PREGUNTAS ES EL ARGUMENTO ──────────────────────
 *
 * Se pregunta primero si HAY dato, después qué dice el MÓDULO, y sólo al final
 * qué dice la NORMA. No es un orden arbitrario:
 *
 *  1. **Sin lectura no hay estado.** Un apoyo cuyo `vRMS` no llegó no está
 *     «en banda»: no se sabe. Es la regla de siempre —un hueco nunca se
 *     disfraza de cero— aplicada al color de una pieza.
 *  2. **La alarma del módulo manda sobre la norma.** El SM 1281 vigila cosas
 *     que este catálogo no puede leer (el espectro de envolvente, la cuarta
 *     frecuencia de rodamiento BSF). Si él enciende la alarma y el vRMS está
 *     en zona A, el que sabe más es él. Pintar el apoyo en verde porque la
 *     velocidad eficaz salió baja sería contradecir al instrumento con un
 *     subconjunto de su propia información.
 *  3. **La norma, al final**, y sólo cuando aplica: `bandaISO` ya devuelve
 *     `null` si la máquina gira por debajo de las 600 rpm en que ISO 10816
 *     deja de pronunciarse.
 *
 * Un apoyo con lectura, sin banderas y sin veredicto de norma sale `null` —no
 * hay criterio— y la escena lo pinta como `sin_dato`. Es incómodo y es
 * honesto: significa que la máquina gira demasiado despacio para que la única
 * medida acotada signifique algo.
 *
 * @param {object} canal  la entrada de `canales[id]` de `createSistemaVibraciones`
 * @param {boolean|null} normaAplicable
 * @returns {string} clave de `domain/estado.js`
 */
export function estadoDeApoyo(canal, normaAplicable) {
  if (!canal) return "sin_dato";

  const { vRMS, alarma, aviso } = canal;

  if (alarma === true) return "critico";
  if (aviso === true) return "atencion";

  if (!Number.isFinite(vRMS)) return "sin_dato";

  const banda = bandaISO(vRMS, normaAplicable);
  if (!banda) return "sin_dato";

  if (banda.nivel === "critico") return "critico";
  if (banda.nivel === "atencion") return "atencion";
  return "nominal";
}

/* ── Ritmo del eje ────────────────────────────────────────────────── */

/**
 * Rango de giro visible, en rpm de DIBUJO.
 *
 * El eje real llega a 3475 rpm, que a 60 fotogramas por segundo es un
 * estroboscopio: la malla daría casi una vuelta entera entre fotograma y
 * fotograma y se vería girar despacio, al revés, o quieta. Se comprime a una
 * ventana donde el ojo sigue el movimiento.
 */
export const RPM_DIBUJO_MIN = 30;
export const RPM_DIBUJO_MAX = 130;

/** Régimen real que se toma como fondo de escala del dibujo. */
export const RPM_REAL_MAX = 3475;

/**
 * A qué ritmo se dibuja el eje, y si ese ritmo está medido.
 *
 * ── LO QUE ESTA FUNCIÓN NO SE PERMITE ──────────────────────────────
 *
 * Girar cuando no sabe si la máquina gira. Sin `SPEED_BMS` devuelve cero y
 * `medido: false`, y la ficha escribe que el régimen no se pudo leer.
 *
 * Es lo contrario de lo que hace `rpmDe` en la maqueta del tanque, y la
 * diferencia es real, no un descuido: allí el sistema publica si está
 * impulsando, así que «impulsa pero no sé a qué carga» es un estado conocido y
 * se dibuja girando a ritmo nominal. Aquí no hay ninguna señal que diga si la
 * máquina está en marcha —`enReposo` sale `null` en `estadoVibraciones.js` por
 * ese mismo motivo—, así que un eje girando «por defecto» estaría afirmando
 * que la máquina está encendida sin que nadie lo haya dicho.
 *
 * Un eje quieto tampoco lo afirma al revés: la ficha dice «sin lectura de
 * régimen», no «parado». Parado sería `rpm: 0` CON `medido: true`, que es lo
 * que devuelve cuando el variador contesta un cero de verdad.
 *
 * @param {object} variador  `variador` de `createSistemaVibraciones`
 */
export function rpmEjeDe(variador) {
  const real = variador?.velocidad;

  if (!Number.isFinite(real)) {
    return { rpm: 0, real: null, medido: false, motivo: "sin-lectura" };
  }

  if (real <= 0) return { rpm: 0, real, medido: true, motivo: "parado" };

  const pct = Math.min(1, real / RPM_REAL_MAX);
  return {
    rpm: RPM_DIBUJO_MIN + (RPM_DIBUJO_MAX - RPM_DIBUJO_MIN) * pct,
    real,
    medido: true,
    motivo: null,
  };
}
