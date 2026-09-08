/**
 * El puente entre el dominio compartido y los idiomas.
 *
 * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────
 *
 * `shared/eva/` declara el vocabulario de la planta con su identidad y su
 * texto juntos:
 *
 *   ESTADOS.critico = { key: "critico", label: "Fuera de límite", token: "coral" }
 *
 * Y eso está BIEN como está: `shared/` lo consumen los dos programas
 * (CLAUDE.md §2.6), y el backend usa esas etiquetas para componer lo que
 * contesta el asistente. Si el texto se mudara a los locales del tablero, el
 * servidor se quedaría mudo; y si i18next entrara en `shared/`, se rompería
 * §2.7 —dominio puro, sin nada que sepa de UI— y las pruebas de dominio
 * dejarían de correr en Node pelado.
 *
 * Así que ni se mueve ni se importa: se TRADUCE al pintar. Estas funciones
 * reciben la entrada del dominio tal cual y devuelven su texto en el idioma
 * activo, cayendo en la etiqueta de `shared/` cuando falta la traducción.
 *
 * ── POR QUÉ EL `defaultValue` ES LA ETIQUETA DEL DOMINIO ───────────
 *
 * Porque hace que la migración sea segura de una en una. Una clave que
 * todavía no está en `es/machines.json` sale con el mismo texto que salía
 * antes —el de `shared/`— en vez de salir como `machines:status.critico.label`
 * en la pantalla de un operador. El día que falte una traducción en inglés,
 * el mismo mecanismo la deja en español legible en vez de en una clave.
 *
 * ── LO QUE ESTO NO ES ──────────────────────────────────────────────
 *
 * No es un traductor genérico ni un sitio donde meter lógica. Si alguna vez
 * hace falta decidir algo —qué estado es peor, qué banda aplica— eso se le
 * pregunta a `shared/eva/`, que es quien lo sabe. Aquí sólo se elige texto.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { estadoInfo } from "@shared/eva/tanque/estado.js";
import { senalInfo } from "@shared/eva/tanque/senales.js";
import { activoInfo } from "@shared/eva/tanque/activos.js";
import { resumenDeSistemas } from "@shared/eva/comun/sistemas.js";

/**
 * Traduce el vocabulario del dominio: estados, señales y activos.
 *
 * Devuelve funciones y no cadenas para que el componente pida sólo lo que
 * pinta, y para que todas cuelguen del mismo `t` —o sea, del mismo idioma— en
 * un repintado.
 *
 * @example
 *   const { estado, senal } = useDominio();
 *   <span>{estado(activo.estado)}</span>
 *   <th>{senal("nivelTanque")}</th>
 */
export function useDominio() {
  const { t } = useTranslation(["machines", "sensors"]);

  /**
   * El texto de un estado. `variante` elige entre el largo y el corto, que en
   * el dominio son dos campos distintos porque caben en sitios distintos: el
   * largo en una leyenda, el corto en una insignia de tabla.
   */
  const estado = useCallback(
    (key, variante = "label") => {
      const info = estadoInfo(key);
      return t(`machines:status.${info.key}.${variante}`, { defaultValue: info[variante] ?? info.label });
    },
    [t]
  );

  /** El nombre de una señal. Mismo criterio de `label` / `corto`. */
  const senal = useCallback(
    (clave, variante = "label") => {
      const info = senalInfo(clave);
      if (!info) return clave;
      return t(`sensors:signals.${clave}.${variante}`, { defaultValue: info[variante] ?? info.label });
    },
    [t]
  );

  /** El nombre de un activo (Tanque, Bombeo, Distribución, Eléctrico). */
  const activo = useCallback(
    (id, variante = "label") => {
      const info = activoInfo(id);
      if (!info) return id;
      return t(`machines:assets.${id}.${variante}`, { defaultValue: info[variante] ?? info.label });
    },
    [t]
  );

  /**
   * El nombre de una MÁQUINA: «Sistema de agua industrial», «Vibration
   * System».
   *
   * Lo declara `shared/eva/comun/sistemas.js` y lo pintaban dos pantallas
   * leyéndolo de ahí directamente, así que el nombre de la máquina se quedaba
   * en español dentro de un tablero en inglés — con las claves ya escritas en
   * `machines:systems` y sin que nadie las llamara.
   *
   * `id` desconocido devuelve el propio id: es lo que hacía el código que
   * esto sustituye, y un id crudo dice más que una cadena vacía cuando el
   * manifiesto trae un sistema que ya no existe.
   */
  const sistema = useCallback(
    (id) => {
      if (!id) return "";
      const info = resumenDeSistemas().find((s) => s.id === id);
      return t(`machines:systems.${id}`, { defaultValue: info?.nombre ?? id });
    },
    [t]
  );

  /**
   * Los sistemas declarados, con su nombre ya traducido. Es lo que necesita
   * un `<select>`: la lista entera, no un nombre suelto.
   */
  const sistemas = useCallback(
    () => resumenDeSistemas().map((s) => ({ id: s.id, nombre: sistema(s.id) })),
    [sistema]
  );

  return { estado, senal, activo, sistema, sistemas };
}

/**
 * La UNIDAD de una señal, que deliberadamente NO se traduce.
 *
 * `°C`, `bar`, `V`, `%` y `L/min` son notación internacional: son las mismas
 * en los dos idiomas y cambiarlas sería un error técnico, no una traducción
 * (§16). Y cambiar de idioma tampoco convierte °C a °F: idioma y sistema de
 * unidades son cosas distintas, y este proyecto no tiene —ni necesita— la
 * segunda (§17).
 *
 * Existe como función y no como acceso directo a `senalInfo(x).unidad` para
 * que quede un sitio donde esta decisión está escrita, y para que quien
 * busque «dónde se traducen las unidades» encuentre este comentario en vez de
 * añadirlas a un JSON.
 */
export function unidadDe(clave) {
  return senalInfo(clave)?.unidad ?? "";
}
