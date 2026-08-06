/** prototypes/area-views/Area1AuroraV.jsx — Vista temporal: Aurora Vertical aplicado a Área 1. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area1AuroraV({ onNavigate }) {
  return <AreaVariantView areaId="area1" variant="aurora-v" onNavigate={onNavigate} />;
}
