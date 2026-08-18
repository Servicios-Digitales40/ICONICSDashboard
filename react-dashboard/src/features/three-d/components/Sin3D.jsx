/**
 * Lo que se ve cuando la escena 3D no se puede dibujar.
 *
 * ── POR QUÉ DICE POR QUÉ, Y NO SÓLO QUE NO SE PUEDE ────────────────
 *
 * «No se puede mostrar el 3D» deja a quien mira sin nada que hacer. Los dos
 * motivos por los que esto ocurre tienen remedios distintos —uno es el equipo,
 * el otro se arregla recargando— y sólo distinguiéndolos se puede actuar.
 *
 * ── POR QUÉ ACEPTA UN RESPALDO Y NO PINTA UNA TABLA ────────────────
 *
 * El 3D es una forma de enseñar el estado de una instalación, no la
 * información en sí: sin él, la información sigue existiendo y cabe en una
 * tabla. Pero la tabla depende de QUÉ instalación se estaba mirando, y este
 * componente es genérico.
 *
 * Antes traía la de las diez máquinas de Resonac, cableada con `usePlantData`.
 * Eso ataba la escena —que no sabe de dominios— a una sección concreta, y al
 * retirarse esa sección se habría quedado pintando una tabla vacía. Ahora la
 * aporta quien monta la escena, con `respaldo`; sin ella queda el aviso solo,
 * que es lo honesto cuando nadie tiene una alternativa que ofrecer.
 */
import { AlertBanner } from "@/components/ui/index.js";

const MOTIVOS = {
  "sin-webgl": {
    titulo: "Este equipo no puede dibujar gráficos 3D",
    detalle:
      "El navegador no ha podido crear un contexto WebGL. Suele pasar en equipos sin GPU utilizable, " +
      "por escritorio remoto sin aceleración, o con el controlador en la lista negra del navegador. " +
      "Los datos son los mismos que en la vista de Planta.",
  },
  "contexto-perdido": {
    titulo: "Se perdió el contexto gráfico y no se pudo recuperar",
    detalle:
      "El navegador cerró el contexto WebGL varias veces seguidas —normalmente por un reinicio del " +
      "controlador de vídeo— y se dejó de reintentar para no entrar en un bucle. Recargando la página " +
      "se vuelve a intentar.",
  },
};

export default function Sin3D({ motivo = "sin-webgl", respaldo = null }) {
  const { titulo, detalle } = MOTIVOS[motivo] ?? MOTIVOS["sin-webgl"];

  return (
    <div>
      <AlertBanner type="warning" title={titulo} message={detalle} />
      {respaldo}
    </div>
  );
}
