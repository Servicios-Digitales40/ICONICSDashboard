/**
 * prototypes/machine-cards/variants.js
 * ------------------------------------------------------------------
 * Registro ÚNICO de las propuestas de tarjeta en evaluación.
 *
 * Lo consumen dos sitios que deben coincidir siempre:
 *   • prototypes/area-views/*        → pinta la parrilla del área con esa variante
 *   • pages/MachineDetail → pinta la MISMA tarjeta en el detalle, para que
 *                           al hacer clic no cambie el lenguaje visual
 *
 * La clave de cada variante coincide a propósito con el sufijo del id de
 * página (`area1-aurora`, `area2-neon-v`…): así la vista de área sabe
 * reconstruir su propio id para el botón "Volver" sin cablearlo.
 *
 * `wide` marca las tarjetas de formato banner (fluidas hasta 620px) frente
 * a las compactas de 320px fijos; de eso dependen tanto las columnas de la
 * parrilla como el ancho de la columna izquierda del detalle.
 *
 * Cuando se elija una propuesta: se promueve su componente al kit
 * definitivo y este archivo, prototypes/machine-cards/ y prototypes/area-views/ se borran.
 */
import MachineCardEditorial from "./MachineCardEditorial.jsx";
import MachineCardAurora from "./MachineCardAurora.jsx";
import MachineCardAuroraVertical from "./MachineCardAuroraVertical.jsx";
import MachineCardNeonHUD from "./MachineCardNeonHUD.jsx";
import MachineCardNeonHUDVertical from "./MachineCardNeonHUDVertical.jsx";

export const CARD_VARIANTS = {
  editorial: { label: "Panel Editorial", Comp: MachineCardEditorial, wide: false },
  aurora: { label: "Aurora Hero", Comp: MachineCardAurora, wide: true },
  "aurora-v": { label: "Aurora Vertical", Comp: MachineCardAuroraVertical, wide: false },
  neon: { label: "Neon Cyber HUD", Comp: MachineCardNeonHUD, wide: true },
  "neon-v": { label: "Neon HUD Vertical", Comp: MachineCardNeonHUDVertical, wide: false },
};

/** Devuelve la variante o `null` si no existe (→ se usa la GaugeCard normal). */
export const getVariant = (key) => CARD_VARIANTS[key] ?? null;
