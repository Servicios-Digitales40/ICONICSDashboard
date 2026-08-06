/** prototypes/area-views/Area2NeonV.jsx — Vista temporal: Neon HUD Vertical aplicado a Área 2. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area2NeonV({ onNavigate }) {
  return <AreaVariantView areaId="area2" variant="neon-v" onNavigate={onNavigate} />;
}
