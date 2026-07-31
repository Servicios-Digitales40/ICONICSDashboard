/** prototypes/area-views/Area1Aurora.jsx — Vista temporal: Aurora Hero aplicado a Área 1. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area1Aurora({ onNavigate }) {
  return <AreaVariantView areaId="area1" variant="aurora" onNavigate={onNavigate} />;
}
