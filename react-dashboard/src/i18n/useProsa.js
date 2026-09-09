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

  return { riesgo, noEvaluable };
}
