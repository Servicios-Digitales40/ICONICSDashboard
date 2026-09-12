/**
 * De un fallo del puente al texto que ve un operador, en su idioma.
 *
 * ── LO QUE DECIDE, Y POR QUÉ SON TRES COSAS Y NO UNA ───────────────
 *
 * Devuelve `{ titulo, detalle, accion }`, no una cadena:
 *
 *   · `titulo`  la frase del CÓDIGO, traducida. «El archivo supera el límite
 *               de este servidor.»
 *   · `detalle` lo que redactó el servidor, tal cual. «El archivo supera el
 *               límite de 25 MB.»
 *   · `accion`  qué hacer al respecto, o `null`. «Divide el manual en partes
 *               o súbelo sin las imágenes de mayor peso.»
 *
 * ── LA ACCIÓN ES OPCIONAL POR CÓDIGO, Y ESO ES DELIBERADO ──────────
 *
 * De los cuarenta y dos códigos del catálogo, hoy trece llevan acción. No es
 * trabajo a medias: **la mayoría no tiene nada que pedirle a un operador de
 * planta.** Un `ERROR_VALIDACION` interno, un `ERROR_CASO_NO_ENCONTRADO`, un
 * `ERROR_SERVER` — la respuesta a todos ellos es «esto es un fallo del
 * programa», y escribir «inténtalo de nuevo» debajo sería relleno.
 *
 * Y el relleno aquí tiene un coste concreto: enseña que el hueco de la acción
 * no dice nada útil, y entonces se deja de leer justo en los trece casos donde
 * sí lo dice. Por eso `verificar-codigos.mjs` comprueba la SIMETRÍA de las
 * acciones que existen (si está en español, está en inglés) y nunca exige que
 * existan todas.
 *
 * Tres códigos no llevan acción aparte porque ya la llevan DENTRO de su frase
 * —`ERROR_ENLACE_CADUCADO` («pídele al asistente que te genere otro»),
 * `ERROR_CONSULTA_EN_CURSO`, `ERROR_RATE_LIMITED`—. Duplicarla la diría dos
 * veces con otras palabras, que se lee como dos instrucciones distintas.
 *
 * Separarlas es lo que permite traducir sin perder información. El código no
 * puede llevar el número —lo sabe el servidor, no el diccionario— y el mensaje
 * del servidor no se puede traducir —llega hecho—. Con las dos, la pantalla
 * enseña la frase en el idioma del tablero y, debajo y en gris, el detalle.
 *
 * ── EL DETALLE NO SE ENSEÑA SIEMPRE ────────────────────────────────
 *
 * Sólo cuando AÑADE algo. Si el servidor no mandó código, el detalle SUBE a
 * título —es lo único que hay, y es lo que se pintaba antes de que existieran
 * los códigos—. Y si el mensaje es idéntico a la frase traducida, se omite
 * para no decir dos veces lo mismo, que es lo que pasa en español con la
 * mitad de los códigos.
 *
 * ── POR QUÉ AQUÍ Y NO EN CADA VISTA ────────────────────────────────
 *
 * Porque son once pantallas las que pintan un error del puente y la decisión
 * —qué sube, qué baja, qué se omite— es la misma en todas. Repartida, la
 * primera que se olvide de mirar `codigo` vuelve a enseñar español dentro del
 * inglés y nadie lo nota.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

/**
 * @returns {(fallo: unknown) => { titulo: string, detalle: string|null, accion: string|null }}
 */
export function useMensajeDeError() {
  const { t } = useTranslation("errors");

  return useCallback(
    (fallo) => {
      /* Una cadena suelta: alguna vista todavía guarda `error` como texto. */
      if (typeof fallo === "string") return { titulo: fallo, detalle: null, accion: null };
      if (!fallo) return { titulo: t("codes.ERROR_UNKNOWN"), detalle: null, accion: null };

      const codigo = fallo.codigo ?? null;
      const delServidor = fallo.mensajeDelServidor ?? fallo.message ?? null;

      /*
       * Sin código no hay nada que traducir: se enseña lo que mandó el
       * servidor, que es exactamente el comportamiento de antes. Ver
       * `lib/api/errorDelPuente.js` sobre por qué se degrada a esto y no a un
       * genérico.
       */
      if (!codigo) {
        return { titulo: delServidor || t("codes.ERROR_UNKNOWN"), detalle: null, accion: null };
      }

      /*
       * La acción va atada al CÓDIGO, así que sin código no hay acción: un
       * fallo sin identidad no se puede acompañar de un «qué hacer» sin
       * adivinar cuál era. Y `defaultValue: ""` en vez de dejar que i18next
       * devuelva la clave: una acción ausente es `null`, no el texto
       * «actions.ERROR_X» pintado en la tarjeta.
       */
      const accion = t(`actions.${codigo}`, { defaultValue: "" }) || null;

      /*
       * Un código que el diccionario no conoce es un backend más nuevo que
       * este tablero. Mismo criterio: su texto, sin inventar nada.
       */
      const clave = `codes.${codigo}`;
      const traducido = t(clave, { defaultValue: "" });
      if (!traducido) {
        /* La acción sí puede existir aunque falte la frase: son dos claves
           independientes, y si el diccionario tiene una y no la otra, dar la
           que hay es mejor que callar las dos. */
        return { titulo: delServidor || codigo, detalle: null, accion };
      }

      /*
       * Se comparan los dos textos ya resueltos. Si coinciden —caso normal en
       * español, donde la frase del diccionario suele ser la del servidor— se
       * omite el detalle en vez de repetirlo.
       */
      const repetido =
        delServidor && delServidor.trim().toLowerCase() === traducido.trim().toLowerCase();

      return { titulo: traducido, detalle: repetido ? null : delServidor, accion };
    },
    /* Sólo `t`: react-i18next devuelve una función nueva al cambiar de idioma. */
    [t],
  );
}
