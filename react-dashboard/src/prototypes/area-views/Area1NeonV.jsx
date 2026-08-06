/** prototypes/area-views/Area1NeonV.jsx — Vista temporal: Neon HUD Vertical aplicado a Área 1. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area1NeonV({ onNavigate }) {
  return <AreaVariantView areaId="area1" variant="neon-v" onNavigate={onNavigate} />;
}
