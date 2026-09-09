/**
 * La PROSA del dominio, traducida al pintarla.
 *
 * ── EN QUÉ SE DIFERENCIA DE `useDominio` ───────────────────────────
 *
 * `useDominio` traduce ETIQUETAS: una palabra o dos, keyed por su id, que no
 * cambian nunca —«Fuera de límite», «Lado acople», «Tanque»—. Esto traduce
 * FRASES que llevan cifras medidas dentro:
 *
 *   «El tanque está al 12,3 % y la bomba sigue impulsando (carga 84,1 %).»
 *
 * Y esa diferencia manda en todo lo demás. Una etiqueta se sustituye; una
 * frase con cifras hay que REHACERLA, porque en inglés el orden de las
 * palabras no es el mismo y las cifras tienen que caer donde toque.
 *
 * ── POR QUÉ EL ESPAÑOL NO ESTÁ EN EL DICCIONARIO ───────────────────
 *
 * Porque ya está en `shared/eva/`, y ahí tiene que seguir: esa prosa la
 * consume el BACKEND para componer lo que el modelo narra (ver
 * `ia/conversacion/herramientas.mjs`, que mete `evidencia`, `consecuencia` y
 * `accion` en el resultado de la herramienta). No es texto de interfaz que se
 * pueda mudar; es vocabulario del dominio con dos consumidores.
 *
 * Así que `es/domain.json` está VACÍO a propósito y el español llega por
 * `defaultValue`: la frase que compuso el dominio. Copiarla al diccionario
 * habría creado dos originales del mismo párrafo en dos archivos que nadie
 * edita a la vez — exactamente la divergencia que §2.6 existe para impedir.
 *
 * La alternativa —escribir el español en las dos partes y añadir una prueba
 * que compare las dos copias— se descartó por eso: una prueba que vigila una
 * copia es peor que no tener la copia.
 *
 * ── CÓMO VIAJAN LAS CIFRAS ─────────────────────────────────────────
 *
 * El evaluador emite `valores` con las señales EN CRUDO, sin formatear, y
 * aquí se formatean por las `decimales` que declara cada señal en su catálogo.
 * No es un rodeo: es lo que hace que un tablero en inglés escriba «12.3» y uno
 * en español «12,3» sobre la misma lectura. El dominio no puede hacerlo —
 * no sabe de idiomas, y no debe (§2.7).
 *
 * Lo que NO es una señal —un umbral que la frase cite, una cuenta— viaja tal
 * cual desde el `datos()` de la regla y se pasa sin tocar.
 *
 * La máquina de VIBRACIONES lo hace al revés: sus cifras llegan ya formateadas
 * por la propia regla. No es una incoherencia sino la consecuencia de que casi
 * ninguna sea una señal del catálogo —«cuántas vigilancias están apagadas»,
 * «cuántas veces peor está un apoyo»— y de que sus decimales sólo los conozca
 * quien escribió la frase. Formatearlas aquí pedía un segundo catálogo de
 * decimales que se desincronizaría del primero.
 *
 * ── LA ASIMETRÍA QUE ESTO DEJA, DICHA EN VOZ ALTA ──────────────────
 *
 * El formateo por idioma sólo ocurre donde hay PLANTILLA, o sea en inglés. En
 * español llega la frase que ya compuso el dominio con `toFixed`, que escribe
 * punto: la tarjeta de riesgo dice «92.4» mientras la tarjeta de señal, dos
 * pantallas más allá, dice «92,4».
 *
 * Es una inconsistencia real y se queda. Quitarla pedía escribir también el
 * español en el diccionario, y entonces el mismo párrafo tendría dos
 * originales en dos archivos que nadie edita a la vez — un separador decimal
 * no vale ese riesgo. Queda fijada en `test/i18n/prosa-del-dominio.test.jsx`
 * para que se vea si alguien la cambia sin querer.
 *
 * ── LO QUE PASA CON UNA REGLA NUEVA ────────────────────────────────
 *
 * Sale en español dentro del tablero en inglés, porque cae en el
 * `defaultValue`. No se rompe nada y no se ve como un error — que es
 * justamente el motivo de que exista `scripts/verificar-dominio.mjs`: recorre
 * los ids de `shared/` y falla si a alguno le falta su inglés.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { senalInfo } from "@shared/eva/tanque/senales.js";

import { useFormato } from "./formato.js";
import { useDominio } from "./useDominio.js";

/**
 * Los trozos de frase que el dominio NO pudo componer, regla por regla.
 *
 * ── POR QUÉ EXISTE ESTE MAPA ───────────────────────────────────────
 *
 * Casi toda la prosa del dominio se rehace con cifras: se meten en la
 * plantilla del idioma y ya está. Tres frases de vibración no, porque lo que
 * enumeran son PALABRAS —el nombre de una vigilancia, su estado, el nombre de
 * un apoyo— y ésas hay que traducirlas una a una antes de unirlas.
 *
 * El dominio no puede: no sabe de idiomas y no debe (§2.7). Así que manda las
 * claves —`{ clave: "bpfo", estado: "aviso" }`— y aquí se convierten en la lista
 * ya escrita que la plantilla coloca en su hueco.
 *
 * ── POR QUÉ POR ID Y NO POR LA FORMA DEL VALOR ─────────────────────
 *
 * Porque lo otro —«si es un array de objetos con `clave` y `estado`, será una
 * lista de vigilancias»— adivina. Este mapa dice qué regla necesita qué, se
 * lee de un vistazo, y `test/i18n/prosa-del-dominio.test.jsx` comprueba que sus
 * claves siguen siendo ids de reglas que existen: un renombrado en `shared/`
 * deja de funcionar en la prueba, no en planta.
 */
export const COMPOSICIONES = {
  "vigilancia-en-aviso": ({ disparadas }, d) => ({
    disparadas: (disparadas ?? [])
      .map((v) => `${d.vigilancia(v.clave)}: ${d.estadoVigilancia(v.estado)}`)
      .join(". "),
  }),
  /* `label` es notación —VRMS, ARMS, DKW—: se une, no se traduce. */
  "confianza-de-medida-baja": ({ bajas }) => ({
    bajas: (bajas ?? []).map((q) => `${q.label}: ${q.valor}`).join(", "),
  }),
  "asimetria-entre-apoyos": ({ canal }, d) => ({ canal: canal ? d.canal(canal) : canal }),
};

/**
 * Traduce la prosa que produce el dominio.
 *
 * @example
 *   const { riesgo } = useProsa();
 *   const r = riesgo(activo);      // { titulo, evidencia, consecuencia, accion, nota }
 */
export function useProsa() {
  const { t } = useTranslation("domain");
  const { numero } = useFormato();
  const { canal, vigilancia, estadoVigilancia } = useDominio();

  /**
   * Las cifras de una frase, listas para interpolar.
   *
   * Una clave que es una SEÑAL se formatea con sus decimales declaradas y con
   * el separador del idioma; cualquier otra cosa —un umbral, una cuenta— pasa
   * tal cual. Un valor que no es un número finito también pasa tal cual: la
   * ausencia de dato no se disfraza de cero (§2.4), y aquí no llega ninguna
   * porque la regla no se evalúa sin sus lecturas.
   */
  const cifras = useCallback(
    (valores) => {
      const salida = {};
      for (const [clave, valor] of Object.entries(valores ?? {})) {
        const decimales = senalInfo(clave)?.decimales;
        salida[clave] =
          typeof decimales === "number" && Number.isFinite(valor)
            ? numero(valor, decimales)
            : valor;
      }
      return salida;
    },
    [numero]
  );

  /**
   * Un riesgo activo, con sus cuatro campos de prosa.
   *
   * Recibe el objeto tal y como lo devuelve `evaluarRiesgos` y devuelve otro
   * con la misma forma: quien pinta no tiene que saber que hubo traducción.
   */
  const riesgo = useCallback(
    (r) => {
      if (!r) return r;
      const valores = cifras(r.valores);
      const traducir = (campo, original) =>
        t(`risks.${r.id}.${campo}`, { ...valores, defaultValue: original ?? "" });

      return {
        ...r,
        titulo: traducir("titulo", r.titulo),
        evidencia: traducir("evidencia", r.evidencia),
        consecuencia: traducir("consecuencia", r.consecuencia),
        accion: traducir("accion", r.accion),
        nota: r.nota ? traducir("nota", r.nota) : r.nota,
      };
    },
    [t, cifras]
  );

  /**
   * Una regla que no se pudo evaluar: su título, y qué lectura faltó.
   *
   * `falta` viene del dominio como la ETIQUETA española de la señal —así la
   * consume el backend—; aquí se prefiere `faltaClave`, que es la señal por su
   * clave, para poder decirla en el idioma activo.
   */
  const noEvaluable = useCallback(
    (n) => (n ? { ...n, titulo: t(`risks.${n.id}.titulo`, { defaultValue: n.titulo }) } : n),
    [t]
  );

  /**
   * Una causa candidata del diagnóstico.
   *
   * Sólo se traducen `titulo` y `componente`. `terminosManual` NO se toca y
   * no debe: son los términos con los que `documentos.mjs` busca en el corpus
   * de manuales, que está en español — traducirlos rompería la búsqueda en vez
   * de mejorarla. Lo mismo vale para `origen`, que es una referencia al
   * archivo del que salió la causa.
   */
  const causa = useCallback(
    (c) =>
      c
        ? {
          ...c,
          titulo: t(`causes.${c.id}.titulo`, { defaultValue: c.titulo }),
          componente: t(`causes.${c.id}.componente`, { defaultValue: c.componente }),
        }
        : c,
    [t]
  );

  /**
   * Un mecanismo de desgaste del pronóstico.
   *
   * `norma` se queda fuera a propósito: «ISO 10816-7» o «NEMA MG-1 §12.44» son
   * referencias, no texto — como un tag de ICONICS o un código de alarma.
   */
  const mecanismo = useCallback(
    (m) =>
      m
        ? {
          ...m,
          titulo: t(`mechanisms.${m.id}.titulo`, { defaultValue: m.titulo }),
          componente: t(`mechanisms.${m.id}.componente`, { defaultValue: m.componente }),
          mecanismo: t(`mechanisms.${m.id}.mecanismo`, { defaultValue: m.mecanismo }),
          consecuencia: t(`mechanisms.${m.id}.consecuencia`, { defaultValue: m.consecuencia }),
          accion: t(`mechanisms.${m.id}.accion`, { defaultValue: m.accion }),
          confirmar: m.confirmar
            ? t(`mechanisms.${m.id}.confirmar`, { defaultValue: m.confirmar })
            : m.confirmar,
        }
        : m,
    [t]
  );

  /**
   * Un riesgo de la máquina de vibraciones.
   *
   * Es hermano de `riesgo` y no el mismo, por dos razones que no se pueden
   * unificar sin empeorar las dos:
   *
   *  1. **Otro catálogo.** `vibrationRisks` y `risks` los escriben dos evaluadores
   *     distintos, y nada garantiza que sus ids no coincidan algún día.
   *     Mezclarlos haría que una colisión pintase la frase de la otra máquina,
   *     que es peor que no traducir.
   *  2. **Otra forma de llegar las cifras.** Las del tanque vienen EN CRUDO y
   *     se formatean aquí; las de vibración vienen ya formateadas por la
   *     propia regla, porque son derivadas y sus decimales sólo los conoce
   *     ella. La cabecera de `shared/eva/vibraciones/riesgosVibracion.js` lo
   *     explica del lado del dominio.
   *
   * `contexto` elige entre las formas de una frase con trozos opcionales
   * (i18next `context`): sin él, «2 alarmas activas, 1 sin reconocer» y «2
   * alarmas activas» saldrían de la misma plantilla con un hueco que a veces
   * queda vacío, y en inglés eso deja la coma colgando.
   */
  const riesgoVibracion = useCallback(
    (r) => {
      if (!r) return r;
      const { contexto, ...valores } = r.valores ?? {};
      const compuesto = COMPOSICIONES[r.id]?.(valores, { canal, vigilancia, estadoVigilancia });
      const opciones = { ...valores, ...compuesto, context: contexto };
      const traducir = (campo, original) =>
        t(`vibrationRisks.${r.id}.${campo}`, { ...opciones, defaultValue: original ?? "" });

      return {
        ...r,
        titulo: traducir("titulo", r.titulo),
        evidencia: traducir("evidencia", r.evidencia),
        consecuencia: traducir("consecuencia", r.consecuencia),
        accion: traducir("accion", r.accion),
        nota: r.nota ? traducir("nota", r.nota) : r.nota,
      };
    },
    [t, canal, vigilancia, estadoVigilancia]
  );

  /** Lo mismo que `noEvaluable`, para el catálogo de la otra máquina. */
  const noEvaluableVibracion = useCallback(
    (n) =>
      n ? { ...n, titulo: t(`vibrationRisks.${n.id}.titulo`, { defaultValue: n.titulo }) } : n,
    [t]
  );

  return { riesgo, noEvaluable, causa, mecanismo, riesgoVibracion, noEvaluableVibracion };
}
