/**
 * El `detalle` de un servicio de `/api/health`, en el idioma del tablero.
 *
 * ── EN QUÉ SE PARECE A `useEvidencia` ───────────────────────────────
 *
 * `backend/routes/systemRoutes.mjs` compone `detalle` en español —es lo que
 * se lee al curlear la ruta o al mirar un log por SSH, que es exactamente
 * para lo que existe esta pantalla (ver su cabecera)—. Igual que la evidencia
 * del motor de diagnóstico, cada rama manda además `plantilla: { clave,
 * ...valores }`: el HECHO por claves, para que este hook lo vuelva a decir en
 * el idioma activo con las mismas cifras.
 *
 * Una `plantilla` sin traducir cae en `defaultValue`, que es el propio
 * `detalle` español: una clave nueva en el backend sale en español dentro de
 * un tablero en inglés, no como `settings:health.detail.loQueSea` en crudo.
 *
 * ── POR QUÉ EL NOMBRE DEL SERVICIO NO PASA POR AQUÍ ─────────────────
 *
 * `servicio.nombre` no necesita una `plantilla`: la clave con la que ya
 * cuelga de `salud.servicios` —`datos`, `asistente`, `dictado`,
 * `documentacion`— es el mismo id que usa `settings:health.name`, así que se
 * traduce por esa clave, no por el texto. Ver `nombreDeServicio` más abajo.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export function useSalud() {
  const { t } = useTranslation("settings");

  /**
   * @param {{detalle?: string|null, plantilla?: {clave: string} & Record<string, unknown>}} servicio
   */
  const detalleDeServicio = useCallback(
    (servicio) => {
      const plantilla = servicio?.plantilla;
      if (!plantilla) return servicio?.detalle ?? null;

      const { clave, ...valores } = plantilla;
      /*
       * `noReachable` es la única con una variante de contexto: el motivo del
       * fallo de red es opcional, y una plantilla única con un hueco vacío
       * deja la frase coja en los dos idiomas. Las demás no declaran
       * `_conMotivo` y no se les pasa `context`, para no depender de que
       * i18next caiga solo a la forma base si la variante no existe.
       *
       * `count` es lo que decide `_one`/`_other` en las plantillas con
       * cantidad de puntos pedidos; las que no lo usan lo ignoran sin problema.
       */
      return t(`health.detail.${clave}`, {
        ...valores,
        count: valores.puntosPedidos,
        ...(clave === "noReachable" && valores.motivo ? { context: "conMotivo" } : {}),
        defaultValue: servicio?.detalle ?? "",
      });
    },
    [t]
  );

  /** El nombre de un servicio, por la clave con la que cuelga de `salud.servicios`. */
  const nombreDeServicio = useCallback(
    (clave, porDefecto = "") => t(`health.name.${clave}`, { defaultValue: porDefecto }),
    [t]
  );

  return { detalleDeServicio, nombreDeServicio };
}
