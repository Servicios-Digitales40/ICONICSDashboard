/**
 * De un fallo del puente al texto que ve un operador, en su idioma.
 *
 * ── LO QUE DECIDE, Y POR QUÉ SON DOS COSAS Y NO UNA ────────────────
 *
 * Devuelve `{ titulo, detalle }`, no una cadena:
 *
 *   · `titulo`  la frase del CÓDIGO, traducida. «El archivo supera el límite
 *               de este servidor.»
 *   · `detalle` lo que redactó el servidor, tal cual. «El archivo supera el
 *               límite de 25 MB.»
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
 * @returns {(fallo: unknown) => { titulo: string, detalle: string|null }}
 */
export function useMensajeDeError() {
  const { t } = useTranslation("errors");

  return useCallback(
    (fallo) => {
      /* Una cadena suelta: alguna vista todavía guarda `error` como texto. */
      if (typeof fallo === "string") return { titulo: fallo, detalle: null };
      if (!fallo) return { titulo: t("codes.ERROR_UNKNOWN"), detalle: null };

      const codigo = fallo.codigo ?? null;
      const delServidor = fallo.mensajeDelServidor ?? fallo.message ?? null;

      /*
       * Sin código no hay nada que traducir: se enseña lo que mandó el
       * servidor, que es exactamente el comportamiento de antes. Ver
       * `lib/api/errorDelPuente.js` sobre por qué se degrada a esto y no a un
       * genérico.
       */
      if (!codigo) {
        return { titulo: delServidor || t("codes.ERROR_UNKNOWN"), detalle: null };
      }

      /*
       * Un código que el diccionario no conoce es un backend más nuevo que
       * este tablero. Mismo criterio: su texto, sin inventar nada.
       */
      const clave = `codes.${codigo}`;
      const traducido = t(clave, { defaultValue: "" });
      if (!traducido) {
        return { titulo: delServidor || codigo, detalle: null };
      }

      /*
       * Se comparan los dos textos ya resueltos. Si coinciden —caso normal en
       * español, donde la frase del diccionario suele ser la del servidor— se
       * omite el detalle en vez de repetirlo.
       */
      const repetido =
        delServidor && delServidor.trim().toLowerCase() === traducido.trim().toLowerCase();

      return { titulo: traducido, detalle: repetido ? null : delServidor };
    },
    /* Sólo `t`: react-i18next devuelve una función nueva al cambiar de idioma. */
    [t],
  );
}
