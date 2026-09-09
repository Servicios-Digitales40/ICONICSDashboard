/**
 * Las frases de evidencia del motor de diagnóstico, en el idioma del tablero.
 *
 * ── QUÉ ES ESTO Y POR QUÉ NO ES `useProsa` ──────────────────────────
 *
 * `useProsa` traduce la prosa que escribe `shared/eva/` —el dominio puro—. Esto
 * traduce la que redacta `backend/ia/motor/` al respaldar una causa: «una señal
 * subió en las últimas 2 h», «un técnico descartó esta causa».
 *
 * Son dos sitios distintos con el mismo problema y la misma solución: el que
 * compone la frase no sabe en qué idioma se va a pintar, así que manda el HECHO
 * por claves —`plantilla: { clave, ...valores }`— y aquí se vuelve a escribir.
 * La frase española sigue viajando en `texto` porque es lo que consume el
 * modelo, y es también el `defaultValue`: una clave que falte sale en español,
 * no como `evidence.tendencia_sube` en crudo.
 *
 * ── LO QUE NO SE TRADUCE, Y NO ES UN OLVIDO ────────────────────────
 *
 * Una entrada SIN `plantilla` se pinta tal cual, y hay dos que nunca la llevan:
 * el fragmento del manual —la cita tiene que poder contrastarse con el papel—
 * y lo que escribió un técnico al cerrar un caso, que son sus palabras. Está
 * razonado del lado del motor, en `CLAVES_DE_EVIDENCIA`.
 *
 * Lo mismo con `causaDescartada`: la frase es nuestra y se traduce, pero la
 * causa que cita puede ser un id del catálogo o TEXTO LIBRE que escribió
 * alguien. Se pasa por `causa()` con el valor crudo como `defaultValue`, así que
 * el id se dice en el idioma activo y el texto libre se respeta.
 *
 * ── UNA COSA QUE HOY NO SE VE ──────────────────────────────────────
 *
 * `evidenciaDelRiesgo` —la frase de la fuente `datos`— está implementada y no
 * llega a ninguna pantalla, porque el motor sólo la compone si quien llama trae
 * `valoresSensores` y hoy no lo trae nadie: `GET /api/diagnostico` valida su
 * querystring con un Zod que sólo admite `sistema` y `riesgoId`. Se deja escrito
 * y probado para cuando esa fuente se alimente; queda dicho aquí para que nadie
 * lo dé por ejercitado.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useDominio } from "./useDominio.js";
import { useProsa } from "./useProsa.js";

export function useEvidencia() {
  /* `traducir` y no `t`: en las vistas `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("diagnostics");
  const { senal } = useDominio();
  const { riesgo, riesgoVibracion, causa } = useProsa();

  /** De qué fuente sale una evidencia: datos, manual, casos o tendencia. */
  const fuente = useCallback(
    (f) => traducir(`evidence.source.${f}`, { defaultValue: f }),
    [traducir]
  );

  /** La frase de una entrada de `evidenciaAFavor` / `evidenciaEnContra`. */
  const texto = useCallback(
    (e) => {
      const p = e?.plantilla;
      if (!p) return e?.texto ?? "";

      /*
       * La evidencia medida del riesgo es prosa del DOMINIO, no del motor: se
       * rehace con el mismo puente que la tarjeta de riesgo, y por eso hay que
       * elegir catálogo según la máquina.
       */
      if (p.clave === "evidenciaDelRiesgo") {
        const comoUnRiesgo = { id: p.riesgoId, evidencia: e.texto, valores: p.valores };
        const traducido =
          p.sistema === "vibraciones" ? riesgoVibracion(comoUnRiesgo) : riesgo(comoUnRiesgo);
        return traducido.evidencia;
      }

      if (p.clave === "causaDescartada") {
        return traducir("evidence.causaDescartada", {
          context: p.causaReal ? undefined : "sinCausa",
          causa: p.causaReal ? causa({ id: p.causaReal, titulo: p.causaReal }).titulo : "",
          defaultValue: e.texto,
        });
      }

      return traducir(`evidence.${p.clave}`, {
        context: p.direccion,
        senal: senal(p.senal),
        ventanaH: p.ventanaH,
        defaultValue: e.texto,
      });
    },
    [traducir, senal, riesgo, riesgoVibracion, causa]
  );

  return { fuente, texto };
}
